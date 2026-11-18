package website.finhub.finhot

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

sealed interface Screen {
    data class ArticlePage(val id: String) : Screen
    data class StoryPage(val id: String) : Screen
    data class IssuePage(val kind: ReportKind, val key: String) : Screen
    data class Chart(val page: ChartPage) : Screen
    data class TopicPage(val slug: String, val name: String) : Screen
    data object Topics : Screen
    data object Bookmarks : Screen
    data object History : Screen
    data class Policy(val file: String, val title: String) : Screen
}
class FinHOTModel(application: Application) : AndroidViewModel(application) {
    val api = ApiClient()
    private val preferences = application.getSharedPreferences("reader-${fingerprint(api.base)}", 0)
    var library by mutableStateOf(preferences.getString("library", null)?.let { wireJson.decodeFromString<Library>(it) } ?: Library())
        private set
    val categories = wireJson.decodeFromString<List<Category>>(application.assets.open("categories.json").bufferedReader().use { it.readText() })
    val charts = wireJson.decodeFromString<List<ChartPage>>(application.assets.open("chronicle.json").bufferedReader().use { it.readText() })
    val stack = mutableStateListOf<Screen>()
    var tab by mutableStateOf(0)
    var reportKind by mutableStateOf(ReportKind.DAILY)
    var query by mutableStateOf(FeedQuery())
        private set
    var unreadOnly by mutableStateOf(false)
    var feed by mutableStateOf(FeedWindow())
        private set
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var restartRequired by mutableStateOf(false)
        private set
    var restoreVersion by mutableStateOf(0)
        private set
    var feedAnchor: String? = null
    var feedOffset = 0
    private var previousIDs: List<String> = emptyList()
    private var fetchJob: Job? = null
    private var restorePageCount = 0
    private var generation = 0
    val visibleItems get() = feed.items.filter { !unreadOnly || it.id !in library.readIDs }
    fun updateQuery(value: FeedQuery) {
        if (query == value) return
        query = value; feedAnchor = null; feedOffset = 0
        refresh()
    }
    fun rememberFeed(index: Int, offset: Int, ids: List<String>) {
        if (restorePageCount > 0 && ids.isEmpty()) return
        previousIDs = ids
        feedAnchor = ids.getOrNull(index - 1)
        feedOffset = if (feedAnchor == null) 0 else offset
    }
    fun open(screen: Screen) { stack += screen }
    fun back() {
        stack.removeLastOrNull()
        if (stack.isEmpty() && tab == 0) {
            if (feed.validUntil <= System.currentTimeMillis()) refresh(restoring = true)
            else restorePosition()
        }
    }
    fun onForeground() {
        if (stack.isEmpty() && tab == 0 && feed.pages > 0 && feed.validUntil <= System.currentTimeMillis()) refresh(restoring = true)
    }
    private fun restorePosition() {
        val target = restoredAnchor(feedAnchor, previousIDs, visibleItems.map { it.id })
        if (target != feedAnchor) feedOffset = 0
        feedAnchor = target; restoreVersion++
    }
    fun refresh(restoring: Boolean = false) = fetch(reset = true, restoring = restoring)
    fun retryFeed() {
        when {
            restartRequired -> refresh()
            restorePageCount > 0 -> refresh(restoring = true)
            feed.items.isEmpty() -> refresh()
            else -> more()
        }
    }
    fun more() { if (!loading && feed.hasMore) fetch(reset = false) }
    private fun fetch(reset: Boolean, restoring: Boolean = false) {
        fetchJob?.cancel()
        val token = ++generation
        val filter = query
        if (reset) restorePageCount = if (restoring) maxOf(1, restorePageCount, feed.pages) else 0
        val pages = restorePageCount.coerceAtLeast(1)
        if (reset) feed = FeedWindow()
        if (reset && !restoring) { feedAnchor = null; feedOffset = 0 }
        loading = true; error = null; restartRequired = false
        fetchJob = viewModelScope.launch {
            try {
                var result = feed
                repeat(pages) {
                    if (it > 0 && !result.hasMore) return@repeat
                    val (page, deadline) = api.items(filter, result.cursor)
                    ensureActive()
                    result = result.append(page, deadline)
                }
                ensureActive()
                feed = result
                restorePageCount = 0
                if (restoring) restorePosition() else if (reset) restoreVersion++
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { error = userMessage(failure); restartRequired = failure is ApiError && failure.code == "invalid_cursor" }
            finally { if (generation == token) loading = false }
        }
    }
    private fun save(value: Library) {
        library = value
        preferences.edit().putString("library", wireJson.encodeToString(value)).apply()
    }
    fun bookmark(id: String) = save(library.toggleBookmark(id))
    fun markRead(id: String) = save(library.markRead(id))
    fun markUnread(id: String) = save(library.markUnread(id))
    fun position(id: String, fingerprint: String, block: String) = save(library.savePosition(id, fingerprint, block))
    fun textSize(size: Int) = save(library.copy(textSize = size))
}
suspend inline fun <reified T> ApiClient.publicGet(path: String): T {
    val result = get(path)
    require(result.json.jsonObject["schemaVersion"]?.jsonPrimitive?.int == 1) { "接口版本暂不支持。" }
    return wireJson.decodeFromJsonElement(kotlinx.serialization.serializer<T>(), result.json)
}
suspend inline fun <reified T> ApiClient.siteGet(path: String, query: Map<String, String> = emptyMap()): T =
    wireJson.decodeFromJsonElement(kotlinx.serialization.serializer<T>(), get("api/site/$path", query).json)
