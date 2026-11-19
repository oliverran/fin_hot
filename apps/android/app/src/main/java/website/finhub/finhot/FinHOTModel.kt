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
    data class IssuePage(val kind: ReportKind, val key: String) : Screen {
        var firstRow = 0
        var scrollOffset = 0
    }
    data class Volume(val id: String) : Screen { val position = BookPosition() }
    data class Chapter(val volume: String, val id: String, val anchor: String? = null) : Screen { val position = BookPosition() }
    data object ChartIndex : Screen
    data class Chart(val page: ChartPage) : Screen
    data class TopicPage(val slug: String, val name: String) : Screen
    data object Topics : Screen
    data object Bookmarks : Screen
    data object History : Screen
    data class Policy(val file: String, val title: String) : Screen
}
private val tabEntries = listOf("/" to "资讯", "/hot" to "热点", "/daily" to "简报", "/chronicle" to "编年史", "/more" to "我的")

private fun Screen.entry(): Pair<String, String> = when (this) {
    is Screen.ArticlePage -> "/items" to "阅读资讯"
    is Screen.StoryPage -> "/story" to "事件追踪"
    is Screen.IssuePage -> "/${kind.path}/issue" to "阅读${kind.label}"
    is Screen.Volume -> "/chronicle/volume" to "打开分卷"
    is Screen.Chapter -> "/chronicle/chapter" to "阅读章节"
    Screen.ChartIndex -> "/chronicle/charts" to "图表索引"
    is Screen.Chart -> "/chronicle/chart" to "打开图表"
    is Screen.TopicPage -> "/topics/detail" to "阅读主题"
    Screen.Topics -> "/topics" to "金融主题"
    Screen.Bookmarks -> "/starred" to "我的收藏"
    Screen.History -> "/more/history" to "阅读记录"
    is Screen.Policy -> "/$file" to title
}

class FinHOTModel(application: Application) : AndroidViewModel(application) {
    val api = ApiClient()
    private val preferences = application.getSharedPreferences("reader-${fingerprint(api.base)}", 0)
    var library by mutableStateOf(preferences.getString("library", null)?.let { wireJson.decodeFromString<Library>(it) } ?: Library())
        private set
    val categories = wireJson.decodeFromString<List<Category>>(application.assets.open("categories.json").bufferedReader().use { it.readText() })
    val charts = wireJson.decodeFromString<List<ChartPage>>(application.assets.open("chronicle.json").bufferedReader().use { it.readText() })
    internal val marketCharts = MarketCharts({ path -> api.get(path) })
    val book by lazy { wireJson.decodeFromString<Chronicles>(application.assets.open("chronicle-reading.json").bufferedReader().use { it.readText() }) }
    val nativeCharts by lazy { (charts + usCharts).associateBy { "${it.group}/${it.slug}" } }
    val homePositions = listOf(BookPosition(), BookPosition())
    var usMarket by mutableStateOf(false)
    val stack = mutableStateListOf<Screen>()
    var tab by mutableStateOf(0)
        private set
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
    private val visitor = preferences.getString("analyticsVisitor", null) ?: java.util.UUID.randomUUID().toString().also {
        preferences.edit().putString("analyticsVisitor", it).apply()
    }
    private companion object { var countedLaunch = false }
    init {
        if (!countedLaunch) { countedLaunch = true; track("open", "/") }
        track("pageview", tabEntries[tab].first)
    }
    private fun track(kind: String, path: String, label: String? = null) {
        viewModelScope.launch { api.collect(kind, path, visitor, label) }
    }
    private fun entered(entry: Pair<String, String>) {
        track("click", entry.first, entry.second)
        track("pageview", entry.first)
    }
    fun selectTab(index: Int) {
        if (tab == index) return
        tab = index
        entered(tabEntries[index])
    }
    fun open(screen: Screen) {
        stack += screen
        entered(screen.entry())
    }
    fun returnToVolumes() { stack.clear(); entered(tabEntries[tab]) }
    fun back() {
        stack.removeLastOrNull() ?: return
        track("pageview", stack.lastOrNull()?.entry()?.first ?: tabEntries[tab].first)
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
    fun bookmark(id: String) {
        save(library.toggleBookmark(id))
        track("click", "/starred", if (id in library.bookmarks) "收藏" else "取消收藏")
    }
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
