package website.finhub.finhot

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

class ApiError(val status: Int, val code: String? = null, override val message: String) : Exception(message)
data class Resource(val json: JsonElement, val deadline: Long)
class ApiClient(val base: String = BuildConfig.SITE_URL) {
    private data class Cached(val body: String, val etag: String?, val deadline: Long, val policy: String)
    private val cache = LinkedHashMap<String, Cached>(16, 0.75f, true)
    private var retryUntil = 0L
    init { require(URI(base).scheme == "https" && URI(base).host != null) }
    suspend fun collect(kind: String, path: String, visitor: String, label: String?) = withContext(Dispatchers.IO) {
        val payload = buildJsonObject {
            put("kind", kind); put("path", path); put("visitor", visitor)
            if (label != null) put("label", label)
        }
        val connection = URI("$base/api/analytics/collect").toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 4000
            connection.readTimeout = 4000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("User-Agent", "FinHOT-Android/0.1")
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            connection.responseCode
        } catch (_: java.io.IOException) {
            // Offline reading and navigation do not wait for analytics or retry it.
        } finally { connection.disconnect() }
        Unit
    }
    suspend fun get(path: String, query: Map<String, String> = emptyMap()): Resource = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        synchronized(cache) {
            if (retryUntil > now) throw ApiError(429, message = "服务繁忙，请在 ${(retryUntil - now) / 1000 + 1} 秒后重试。")
        }
        val suffix = if (query.isEmpty()) "" else query.entries.joinToString("&", prefix = "?") { "${encode(it.key)}=${encode(it.value)}" }
        val url = "$base/$path$suffix"
        val cached = synchronized(cache) { cache[url] }
        if (cached != null && cached.deadline > now) return@withContext Resource(wireJson.parseToJsonElement(cached.body), cached.deadline)
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15000; connection.readTimeout = 20000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "FinHOT-Android/0.1")
            if (cached?.etag != null) connection.setRequestProperty("If-None-Match", cached.etag)
            val status = connection.responseCode
            if (status !in 200..299 && status != 304) {
                val retry = connection.getHeaderField("Retry-After")?.let { raw -> raw.toLongOrNull()?.let { now + it * 1000 } ?: httpDate(raw) }
                if (status in listOf(429, 503) && retry != null && retry > now) synchronized(cache) { retryUntil = maxOf(retryUntil, retry) }
                val problem = connection.errorStream?.bufferedReader()?.use { it.readText() }
                val code = runCatching { wireJson.parseToJsonElement(problem.orEmpty()).jsonObject["code"]?.jsonPrimitive?.content }.getOrNull()
                throw ApiError(status, code, when {
                    code == "invalid_cursor" -> "列表范围已变化，请刷新列表。"
                    status == 404 -> "内容尚未发布或已不可用。"
                    status == 429 || status == 503 -> "服务繁忙，请稍后重试。"
                    else -> "网站暂时无法响应（$status）。"
                })
            }
            val body = if (status == 304) cached?.body ?: throw ApiError(502, message = "缺少可验证的缓存，请重新读取。")
                else connection.inputStream.bufferedReader().use { it.readText() }
            val policy = connection.getHeaderField("Cache-Control") ?: cached?.policy.orEmpty()
            val maxAge = Regex("(?:^|,)\\s*max-age=(\\d+)").find(policy)?.groupValues?.get(1)?.toLongOrNull() ?: 0
            val age = maxOf(connection.getHeaderFieldLong("Age", 0) * 1000,
                connection.getHeaderField("Date")?.let(::httpDate)?.let { System.currentTimeMillis() - it } ?: 0, 0)
            val cacheable = !policy.contains("no-store", ignoreCase = true) && !policy.contains("no-cache", ignoreCase = true)
            val deadline = if (cacheable) System.currentTimeMillis() + (maxAge * 1000 - age).coerceAtLeast(0) else now
            val parsed = wireJson.parseToJsonElement(body)
            if (path.startsWith("api/v1/") && cacheable) synchronized(cache) {
                cache[url] = Cached(body, connection.getHeaderField("ETag") ?: cached?.etag, deadline, policy)
                while (cache.size > 64) cache.remove(cache.keys.first())
            }
            Resource(parsed, deadline)
        } finally { connection.disconnect() }
    }
    suspend fun items(query: FeedQuery, cursor: String?): Pair<ItemsPage, Long> {
        val search = query.search.trim()
        require(search.isEmpty() || search.codePointCount(0, search.length) in 2..200) { "请输入 2–200 个字符的搜索词。" }
        val parameters = mutableMapOf("mode" to if (search.isEmpty()) query.mode else "all", "window" to "7d", "by" to "timeline", "limit" to "30")
        if (search.isNotEmpty()) parameters["q"] = search
        if (query.category.isNotEmpty()) parameters["category"] = query.category
        if (cursor != null) parameters["cursor"] = cursor
        val response = get("api/v1/items", parameters)
        val page = wireJson.decodeFromJsonElement(ItemsPage.serializer(), response.json)
        require(page.schemaVersion == 1) { "接口版本暂不支持。" }
        return page to response.deadline
    }
    private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")
    private fun httpDate(value: String): Long? = runCatching { ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }.getOrNull()
}

fun userMessage(error: Exception): String = when (error) {
    is ApiError -> error.message
    is kotlinx.serialization.SerializationException -> "网站返回的数据暂时无法识别，请稍后重试。"
    is java.net.SocketTimeoutException -> "网站响应超时，请稍后重试。"
    is java.io.IOException -> "网络连接失败，请检查网络后重试。"
    is IllegalArgumentException -> error.message ?: "请求条件不正确，请调整后重试。"
    else -> "暂时无法读取，请稍后重试。"
}
