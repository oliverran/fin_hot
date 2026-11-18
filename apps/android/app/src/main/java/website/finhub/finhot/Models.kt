package website.finhub.finhot

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode
import java.security.MessageDigest

val wireJson = Json { ignoreUnknownKeys = true }
@Serializable data class Source(val name: String)
@Serializable data class Links(val original: String = "", val aihot: String? = null, val story: String? = null)
@Serializable data class Article(val id: String, val title: String, val source: Source,
    val summary: String? = null, val reason: String? = null, val publishedAt: String? = null,
    val discoveredAt: String? = null, val category: String? = null, val selected: Boolean = false)
@Serializable data class Page(val hasMore: Boolean, val nextCursor: String? = null)
@Serializable data class ItemsPage(val schemaVersion: Int, val items: List<Article>, val page: Page)
@Serializable data class CollectionPayload<T>(val schemaVersion: Int, val items: List<T>)
@Serializable data class StoryRef(val publicId: String, val title: String)
@Serializable data class ArticleBody(val zh: String? = null, val original: String? = null)
@Serializable data class ArticleDetail(val id: String, val title: String, val source: Source, val links: Links,
    val readingMode: String, val summary: String? = null, val reason: String? = null,
    val body: ArticleBody? = null, val relatedStories: List<StoryRef> = emptyList())
@Serializable data class HotTopic(val rank: Int, val id: String, val title: String, val sourceCount: Int, val links: Links)
@Serializable data class StoryReport(val id: String, val title: String, val source: Source, val publishedAt: String)
@Serializable data class Story(val title: String, val sourceCount: Int, val reportCount: Int,
    val reports: List<StoryReport>, val digest: String? = null, val latest: String? = null)
@Serializable data class StoryPayload(val schemaVersion: Int, val story: Story)
enum class ReportKind(val label: String, val collection: String, val path: String) {
    DAILY("日报", "dailies", "daily"), WEEKLY("周报", "weeklies", "weekly"), MONTHLY("月报", "monthlies", "monthly")
}
@Serializable data class Issue(val date: String? = null, val week: String? = null, val month: String? = null,
    val leadTitle: String? = null, val headline: String? = null) {
    fun key(kind: ReportKind): String = requireNotNull(when (kind) { ReportKind.DAILY -> date; ReportKind.WEEKLY -> week; ReportKind.MONTHLY -> month })
}
@Serializable data class Citation(val title: String, val source: Source, val links: Links, val summary: String? = null)
@Serializable data class ReportSection(val label: String, val items: List<Citation>, val summary: String? = null)
@Serializable data class Lead(val title: String, val leadParagraph: String)
@Serializable data class Report(val sections: List<ReportSection>, val date: String? = null, val week: String? = null,
    val month: String? = null, val lead: Lead? = null, val headline: String? = null,
    val overview: String? = null, val flashes: List<Citation> = emptyList())
@Serializable data class ReportPayload(val schemaVersion: Int, val report: Report)
@Serializable data class Category(val key: String, val label: String)
@Serializable data class ChartPage(val group: String, val slug: String, val cardTitle: String, val cardBlurb: String, val chartNote: String)
@Serializable data class ChartMeta(val name: String, val type: String, val source: String? = null, val updatedAt: String? = null, val status: String? = null)
@Serializable data class ChartPoint(val date: String, val value: Double)
@Serializable private data class ChartWire(val meta: ChartMeta, val series: JsonElement)
@Serializable private data class ChartLines(val dates: List<String>, val seriesData: Map<String, List<Double?>>)
data class ChartPayload(val meta: ChartMeta, val dates: List<String>, val lines: Map<String, List<Double?>>)

fun decodeChart(json: JsonElement): ChartPayload {
    val wire = wireJson.decodeFromJsonElement<ChartWire>(json)
    if (wire.meta.type == "multi-line" && wire.series is JsonObject) {
        val data = wireJson.decodeFromJsonElement<ChartLines>(wire.series)
        require(data.seriesData.values.all { it.size == data.dates.size })
        return ChartPayload(wire.meta, data.dates, data.seriesData.toSortedMap())
    }
    val points = wireJson.decodeFromJsonElement<List<ChartPoint>>(wire.series)
    return ChartPayload(wire.meta, points.map { it.date }, mapOf(wire.meta.name to points.map { it.value }))
}
@Serializable data class Topic(val slug: String, val name: String, val definition: String, val total: Int)
@Serializable data class TopicDirectory(val topics: List<Topic>)
@Serializable data class TopicPage(val items: List<Article>, val page: Int, val pageCount: Int)

@Serializable data class Checkpoint(val fingerprint: String, val blockID: String)
@Serializable data class Library(val bookmarks: List<String> = emptyList(), val readIDs: List<String> = emptyList(),
    val positions: Map<String, Checkpoint> = emptyMap(), val textSize: Int = 18) {
    fun toggleBookmark(id: String) = copy(bookmarks = if (id in bookmarks) bookmarks - id else listOf(id) + bookmarks)
    fun markRead(id: String): Library {
        val ids = (listOf(id) + readIDs.filterNot { it == id }).take(5000)
        return copy(readIDs = ids, positions = positions.filterKeys { it in ids })
    }
    fun markUnread(id: String) = copy(readIDs = readIDs - id, positions = positions - id)
    fun savePosition(id: String, fingerprint: String, block: String) =
        if (id in readIDs) copy(positions = positions + (id to Checkpoint(fingerprint, block))) else this
}
data class FeedQuery(val mode: String = "selected", val category: String = "", val search: String = "")
data class FeedWindow(val items: List<Article> = emptyList(), val cursor: String? = null, val hasMore: Boolean = false,
    val pages: Int = 0, val validUntil: Long = 0) {
    fun append(page: ItemsPage, deadline: Long): FeedWindow {
        val rows = linkedMapOf<String, Article>()
        items.forEach { rows[it.id] = it }; page.items.forEach { rows[it.id] = it }
        return FeedWindow(rows.values.toList(), page.page.nextCursor, page.page.hasMore && page.page.nextCursor != null,
            pages + 1, if (pages == 0) deadline else minOf(validUntil, deadline))
    }
}
fun restoredAnchor(preferred: String?, previous: List<String>, visible: List<String>): String? {
    if (preferred in visible) return preferred
    val index = previous.indexOf(preferred)
    if (index >= 0) {
        previous.drop(index + 1).firstOrNull { it in visible }?.let { return it }
        previous.take(index).lastOrNull { it in visible }?.let { return it }
    }
    return visible.firstOrNull()
}
fun routeID(url: String?, prefix: String): String? = runCatching {
    val path = java.net.URI(url ?: return@runCatching null).path ?: return@runCatching null
    if (!path.startsWith(prefix)) return@runCatching null
    path.removePrefix(prefix).takeIf { it.matches(Regex("[a-zA-Z0-9_-]{1,80}")) }
}.getOrNull()
fun fingerprint(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
data class ReadingBlock(val id: String, val html: String? = null, val imageURL: String? = null)
class ReadingDocument(item: ArticleDetail, base: String) {
    val fingerprint = fingerprint(wireJson.encodeToString(ArticleDetail.serializer(), item))
    val blocks: List<ReadingBlock>
    init {
        val output = mutableListOf<ReadingBlock>()
        if (item.readingMode != "summary-only") {
            val blockTags = setOf("p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "table", "div", "figure", "ul", "ol", "section", "article")
            fun appendHtml(html: String) {
                if (Jsoup.parseBodyFragment(html).text().isNotBlank()) output += ReadingBlock("body-${output.size}", html = html)
            }
            fun walk(node: Node) {
                if (node is TextNode) { appendHtml(node.outerHtml()); return }
                if (node !is Element) return
                if (node.tagName() == "img") {
                    node.absUrl("src").takeIf { it.startsWith("https://") || it.startsWith("http://") }
                        ?.let { output += ReadingBlock("body-${output.size}", imageURL = it) }
                    return
                }
                if (node.tagName() in blockTags && node.select("img").isEmpty()) { appendHtml(node.outerHtml()); return }
                val inline = StringBuilder()
                fun flush() { appendHtml(inline.toString()); inline.clear() }
                node.childNodes().forEach { child ->
                    if (child is Element && (child.tagName() in blockTags || child.tagName() == "img" || child.select("img").isNotEmpty())) {
                        flush(); walk(child)
                    } else inline.append(child.outerHtml())
                }
                flush()
            }
            val body = Jsoup.parse(item.body?.zh ?: item.body?.original.orEmpty(), base).body()
            body.childNodes().forEach(::walk)
            if (output.isEmpty() && body.text().isNotBlank()) output += ReadingBlock("body-0", html = body.html())
        }
        blocks = output
    }
}

fun displayDate(value: String?): String = value?.let {
    java.time.Instant.parse(it).atZone(java.time.ZoneId.of("Asia/Shanghai"))
        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
} ?: "时间未标注"
