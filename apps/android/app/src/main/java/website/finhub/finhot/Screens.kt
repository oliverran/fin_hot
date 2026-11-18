package website.finhub.finhot

import android.content.Intent
import android.text.Html
import android.text.method.LinkMovementMethod
import android.widget.TextView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.JsonElement
import java.net.URI

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun FinHOTApp(vm: FinHOTModel) {
    val titles = listOf("FinHOT", "热点事件", "金融简报", "编年史", "我的")
    val labels = listOf("资讯", "热点", "简报", "编年史", "我的")
    val icons = listOf(Icons.Default.Home, Icons.Default.Star, Icons.Default.DateRange, null, Icons.Default.Person)
    val route = vm.stack.lastOrNull()
    val context = LocalContext.current
    BackHandler(enabled = route != null) { vm.back() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) vm.onForeground() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    Scaffold(topBar = {
        TopAppBar(title = { Text(if (route == null) titles[vm.tab] else when (route) {
            is Screen.ArticlePage -> "阅读"; is Screen.StoryPage -> "事件追踪"; is Screen.IssuePage -> route.kind.label
            is Screen.Chart -> "历史图表"; is Screen.TopicPage -> route.name; Screen.Topics -> "金融主题"
            Screen.Bookmarks -> "我的收藏"; Screen.History -> "阅读记录"; is Screen.Policy -> route.title
        }) }, navigationIcon = { if (route != null) IconButton(onClick = vm::back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") } },
            actions = { if (route is Screen.ArticlePage) {
                var sizesOpen by remember { mutableStateOf(false) }
                Box {
                    TextButton(onClick = { sizesOpen = true }) { Text("字号") }
                    DropdownMenu(sizesOpen, { sizesOpen = false }) {
                        listOf(18 to "标准", 20 to "较大", 24 to "大号").forEach { (size, label) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                trailingIcon = {
                                    if (vm.library.textSize == size) Icon(Icons.Default.Check, "已选择")
                                },
                                onClick = {
                                    vm.textSize(size)
                                    sizesOpen = false
                                }
                            )
                        }
                    }
                }
                TextButton(onClick = { vm.bookmark(route.id) }) { Text(if (route.id in vm.library.bookmarks) "已收藏" else "收藏") }
                TextButton(onClick = { context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "${vm.api.base}/items/${route.id}") }, "分享资讯")) }) { Text("分享") }
            } })
    }, bottomBar = {
        if (route == null) NavigationBar { labels.forEachIndexed { index, label ->
            NavigationBarItem(selected = vm.tab == index, onClick = { vm.tab = index }, icon = {
                val icon = icons[index]
                if (icon != null) Icon(icon, null) else Icon(painterResource(R.drawable.ic_timeline), null)
            }, label = { Text(label) })
        } }
    }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (route == null) when (vm.tab) {
                0 -> FeedScreen(vm); 1 -> HotScreen(vm); 2 -> ReportsScreen(vm); 3 -> ChronicleScreen(vm); else -> MyScreen(vm)
            } else key(route) { when (route) {
                is Screen.ArticlePage -> Remote(route, { vm.api.siteGet<ArticleDetail>("items/${route.id}") }) { Reader(vm, it) }
                is Screen.StoryPage -> StoryScreen(vm, route.id)
                is Screen.IssuePage -> IssueScreen(vm, route.kind, route.key)
                is Screen.Chart -> ChartScreen(vm, route.page)
                is Screen.TopicPage -> TopicScreen(vm, route)
                Screen.Topics -> TopicsScreen(vm)
                Screen.Bookmarks -> SavedScreen(vm, vm.library.bookmarks, false)
                Screen.History -> SavedScreen(vm, vm.library.readIDs, true)
                is Screen.Policy -> {
                    val text = remember(route.file) { context.assets.open("${route.file}.md").bufferedReader().use { it.readText() } }
                    LazyColumn { item { Text(text, Modifier.padding(20.dp)) } }
                }
            } }
        }
    }
}
private data class RemoteState<T>(val value: T? = null, val error: String? = null)
@Composable private fun <T> Remote(key: Any, load: suspend () -> T, content: @Composable (T) -> Unit) {
    var retry by remember { mutableIntStateOf(0) }
    val state by produceState(RemoteState<T>(), key, retry) {
        value = RemoteState()
        try { val result = load(); coroutineContext.ensureActive(); value = RemoteState(value = result) }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { value = RemoteState(error = userMessage(error)) }
    }
    val current by rememberUpdatedState(state)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME && current.value != null) retry++ }
        lifecycle.addObserver(observer); onDispose { lifecycle.removeObserver(observer) }
    }
    when {
        state.value != null -> content(state.value!!)
        state.error != null -> Column(Modifier.padding(24.dp)) { Text(state.error!!); TextButton(onClick = { retry++ }) { Text("重试") } }
        else -> CircularProgressIndicator(Modifier.padding(24.dp))
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun FeedScreen(vm: FinHOTModel) {
    var search by rememberSaveable { mutableStateOf(vm.query.search) }
    var expanded by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val searching = vm.query.search.isNotEmpty()
    val visible = vm.visibleItems
    val currentIDs by rememberUpdatedState(visible.map { it.id })
    val start = visible.indexOfFirst { it.id == vm.feedAnchor }.let { if (it < 0) 0 else it + 1 }
    val list = rememberLazyListState(start, vm.feedOffset)
    DisposableEffect(Unit) { onDispose { vm.rememberFeed(list.firstVisibleItemIndex, list.firstVisibleItemScrollOffset, currentIDs) } }
    LaunchedEffect(Unit) {
        if (!vm.loading) {
            if (vm.feed.pages == 0) vm.refresh()
            else if (vm.feed.validUntil <= System.currentTimeMillis()) vm.refresh(restoring = true)
        }
    }
    LaunchedEffect(vm.restoreVersion) {
        val index = vm.visibleItems.indexOfFirst { it.id == vm.feedAnchor }
        list.scrollToItem(if (index < 0) 0 else index + 1, if (index < 0) 0 else vm.feedOffset)
    }
    PullToRefreshBox(isRefreshing = vm.loading, onRefresh = { vm.refresh() }) {
        LazyColumn(state = list, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
            item(key = "controls") {
                Text("最近 7 天", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FilterChip(!searching && vm.query.mode == "selected", { vm.updateQuery(vm.query.copy(mode = "selected")) }, { Text("精选") }, enabled = !searching)
                    FilterChip(searching || vm.query.mode == "all", { vm.updateQuery(vm.query.copy(mode = "all")) }, { Text("全部动态") }, enabled = !searching)
                    Box {
                        TextButton(onClick = { expanded = true }) { Text(vm.categories.firstOrNull { it.key == vm.query.category }?.label ?: "全部分类") }
                        DropdownMenu(expanded, { expanded = false }) {
                            DropdownMenuItem({ Text("全部分类") }, { expanded = false; vm.updateQuery(vm.query.copy(category = "")) })
                            vm.categories.forEach { category -> DropdownMenuItem({ Text(category.label) }, { expanded = false; vm.updateQuery(vm.query.copy(category = category.key)) }) }
                        }
                    }
                }
                OutlinedTextField(search, { search = it; if (it.isEmpty() && vm.query.search.isNotEmpty()) vm.updateQuery(vm.query.copy(search = "")) },
                    label = { Text("搜索全部动态") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = {
                        vm.updateQuery(vm.query.copy(search = search.trim()))
                        focus.clearFocus()
                    }))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Row(
                        Modifier.heightIn(min = 48.dp).toggleable(vm.unreadOnly, role = Role.Checkbox) { vm.unreadOnly = it },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Checkbox(vm.unreadOnly, onCheckedChange = null)
                        Text("只看未读", style = MaterialTheme.typography.bodyMedium)
                    }
                    TextButton(onClick = { vm.open(Screen.Topics) }) { Text("主题") }
                }
            }
            items(visible, key = { it.id }) { article -> ArticleCard(vm, article) {
                vm.rememberFeed(list.firstVisibleItemIndex, list.firstVisibleItemScrollOffset, currentIDs)
                vm.open(Screen.ArticlePage(article.id))
            } }
            if (vm.error != null) item { Text(vm.error!!); TextButton(onClick = { if (vm.restartRequired || vm.feed.items.isEmpty()) vm.refresh() else vm.more() }) { Text(if (vm.restartRequired) "刷新列表" else "重试") } }
            if (!vm.loading && vm.error == null && visible.isEmpty()) item {
                Text(if (vm.unreadOnly && vm.feed.items.isNotEmpty()) "这些资讯已经读过了，可以继续加载更早的资讯。" else "暂无资讯，试试其他分类或关键词。", Modifier.padding(vertical = 24.dp))
                if (vm.unreadOnly) TextButton(onClick = { vm.unreadOnly = false }) { Text("查看全部已加载资讯") }
            }
            if (vm.feed.hasMore) item { TextButton(onClick = vm::more, enabled = !vm.loading) { Text("加载更多") } }
        }
    }
}
@Composable private fun ArticleCard(vm: FinHOTModel, item: Article, onClick: () -> Unit = { vm.open(Screen.ArticlePage(item.id)) }) {
    val isRead = item.id in vm.library.readIDs
    val saved = item.id in vm.library.bookmarks
    var showActions by remember(item.id) { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(top = 10.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(item.source.name, Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            Text(if (isRead) "已读" else "未读", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box {
                IconButton(onClick = { showActions = true }) { Icon(Icons.Default.MoreVert, "文章操作") }
                DropdownMenu(showActions, { showActions = false }) {
                    DropdownMenuItem({ Text(if (saved) "取消收藏" else "收藏") }, {
                        showActions = false
                        vm.bookmark(item.id)
                    })
                    DropdownMenuItem({ Text(if (isRead) "标为未读" else "标为已读") }, {
                        showActions = false
                        if (isRead) vm.markUnread(item.id) else vm.markRead(item.id)
                    })
                }
            }
        }
        Text(item.title, style = MaterialTheme.typography.titleMedium)
        item.summary?.let {
            Text(it, maxLines = 3, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val metadata = listOfNotNull(vm.categories.firstOrNull { it.key == item.category }?.label,
            displayDate(item.publishedAt ?: item.discoveredAt).takeIf { it.isNotBlank() },
            "已收藏".takeIf { saved })
        Text(metadata.joinToString(" · "), style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider()
}
@Composable private fun Reader(vm: FinHOTModel, item: ArticleDetail) {
    val document = remember(item) { ReadingDocument(item, vm.api.base) }
    val keys = remember(document) { listOf("intro") + document.blocks.map { it.id } + "end" }
    val saved = vm.library.positions[item.id]?.takeIf { it.fingerprint == document.fingerprint }?.blockID
    val list = rememberLazyListState(keys.indexOf(saved).coerceAtLeast(0))
    LaunchedEffect(item.id, document.fingerprint) {
        vm.markRead(item.id)
        snapshotFlow { list.firstVisibleItemIndex }.distinctUntilChanged().collect { index -> keys.getOrNull(index)?.let { vm.position(item.id, document.fingerprint, it) } }
    }
    LazyColumn(state = list, contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item(key = "intro") {
            Text(item.source.name, color = MaterialTheme.colorScheme.primary)
            Text(item.title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(vertical = 18.dp))
            item.summary?.let { Text(it, fontSize = vm.library.textSize.sp, lineHeight = (vm.library.textSize + 8).sp) }
            item.reason?.let { Text("为什么值得关注\n$it", Modifier.padding(vertical = 16.dp), fontSize = vm.library.textSize.sp, lineHeight = (vm.library.textSize + 8).sp) }
            Text(if (item.readingMode == "summary-only") "本站提供摘要，完整报道请阅读原文。" else "正文依据网站授权范围展示。", style = MaterialTheme.typography.labelSmall)
        }
        items(document.blocks, key = { it.id }) { block ->
            block.html?.let { NativeHtml(it, vm.library.textSize) }
            block.imageURL?.let { AsyncImage(it, "报道配图", Modifier.fillMaxWidth()) }
        }
        item(key = "end") {
            ExternalLink("阅读来源原文", item.links.original)
            item.relatedStories.forEach { story -> TextButton(onClick = { vm.open(Screen.StoryPage(story.publicId)) }) { Text(story.title) } }
            Text("已读", style = MaterialTheme.typography.labelSmall)
        }
    }
}
@Composable private fun NativeHtml(html: String, size: Int = 18) {
    val textColor = MaterialTheme.colorScheme.onSurface.toArgb()
    val linkColor = MaterialTheme.colorScheme.primary.toArgb()
    val spanned = remember(html) { Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT) }
    AndroidView(factory = { context -> TextView(context).apply { setTextIsSelectable(true); movementMethod = LinkMovementMethod.getInstance() } },
        update = { it.text = spanned; it.textSize = size.toFloat(); it.setTextColor(textColor); it.setLinkTextColor(linkColor) }, modifier = Modifier.fillMaxWidth())
}
@Composable private fun ExternalLink(label: String, url: String) {
    val context = LocalContext.current
    if (runCatching { URI(url).scheme in listOf("https", "http") }.getOrDefault(false)) TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) }) { Text(label) }
}
@Composable private fun HotScreen(vm: FinHOTModel) {
    Remote("hot", { vm.api.publicGet<CollectionPayload<HotTopic>>("api/v1/hot-topics") }) { result ->
        LazyColumn(contentPadding = PaddingValues(20.dp)) {
            if (result.items.isEmpty()) item { Text("暂无热点事件") }
            items(result.items, key = { it.links.story ?: it.id }) { topic ->
                Column(Modifier.fillMaxWidth().clickable { routeID(topic.links.story, "/story/")?.let { vm.open(Screen.StoryPage(it)) } }.padding(vertical = 18.dp)) {
                    Text("${topic.rank.toString().padStart(2, '0')}  ${topic.title}", style = MaterialTheme.typography.titleLarge)
                    Text("${topic.sourceCount} 个报道来源", Modifier.padding(top = 10.dp), style = MaterialTheme.typography.labelMedium)
                }; HorizontalDivider()
            }
        }
    }
}
@Composable private fun StoryScreen(vm: FinHOTModel, id: String) {
    Remote(id, { vm.api.publicGet<StoryPayload>("api/v1/stories/$id").story }) { story ->
        LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item { Text(story.title, style = MaterialTheme.typography.headlineLarge); Text("${story.sourceCount} 个来源 · ${story.reportCount} 篇报道") }
            (story.digest ?: story.latest)?.let { item { Text(it) } }
            items(story.reports, key = { it.id }) { report -> TextButton(onClick = { vm.open(Screen.ArticlePage(report.id)) }) { Text("${report.title}\n${report.source.name} · ${displayDate(report.publishedAt)}") } }
        }
    }
}
@Composable private fun ReportsScreen(vm: FinHOTModel) {
    Column {
        Row(Modifier.padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ReportKind.entries.forEach { kind -> FilterChip(vm.reportKind == kind, { vm.reportKind = kind }, { Text(kind.label) }) }
        }
        val kind = vm.reportKind
        Remote(kind, { vm.api.publicGet<CollectionPayload<Issue>>("api/v1/${kind.collection}?limit=${if (kind == ReportKind.DAILY) 180 else 60}") }) { index ->
            LazyColumn(contentPadding = PaddingValues(20.dp)) {
                if (index.items.isEmpty()) item { Text("还没有发布${kind.label}") }
                items(index.items, key = { it.key(kind) }) { issue ->
                    Column(Modifier.fillMaxWidth().clickable { vm.open(Screen.IssuePage(kind, issue.key(kind))) }.padding(vertical = 18.dp)) {
                        Text(issue.key(kind), style = MaterialTheme.typography.labelMedium)
                        Text(issue.leadTitle ?: issue.headline ?: "金融${kind.label}", style = MaterialTheme.typography.titleLarge)
                    }; HorizontalDivider()
                }
            }
        }
    }
}
@Composable private fun IssueScreen(vm: FinHOTModel, kind: ReportKind, key: String) {
    Remote("$kind:$key", { vm.api.publicGet<ReportPayload>("api/v1/${kind.collection}/$key").report }) { report ->
        LazyColumn(contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            item { Text(report.lead?.title ?: report.headline ?: "金融${kind.label}", style = MaterialTheme.typography.headlineLarge); Text(key) }
            report.lead?.let { item { Text(it.leadParagraph) } }; report.overview?.let { item { Text(it) } }
            report.sections.forEach { section ->
                item { Text(section.label, style = MaterialTheme.typography.titleLarge); section.summary?.let { Text(it) } }
                items(section.items) { CitationRow(vm, it) }
            }
            if (report.flashes.isNotEmpty()) item { Text("快讯", style = MaterialTheme.typography.titleLarge) }
            items(report.flashes) { CitationRow(vm, it) }
        }
    }
}
@Composable private fun CitationRow(vm: FinHOTModel, citation: Citation) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val id = routeID(citation.links.aihot, "/items/")
        if (id != null) TextButton(onClick = { vm.open(Screen.ArticlePage(id)) }) { Text(citation.title) }
        else ExternalLink(citation.title, citation.links.original)
        citation.summary?.let { Text(it) }; Text(citation.source.name, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable private fun ChronicleScreen(vm: FinHOTModel) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("把新闻放回市场背景", style = MaterialTheme.typography.headlineSmall); Text("宽基、回撤与行业历史。实际来源与日期以每张图标注为准；美股和复杂专题后续迁移。") }
        items(vm.charts, key = { "${it.group}/${it.slug}" }) { page ->
            Column(Modifier.fillMaxWidth().clickable { vm.open(Screen.Chart(page)) }.padding(vertical = 12.dp)) {
                Text(page.cardTitle, style = MaterialTheme.typography.titleMedium); Text(page.cardBlurb, style = MaterialTheme.typography.bodyMedium)
            }; HorizontalDivider()
        }
    }
}
@Composable private fun ChartScreen(vm: FinHOTModel, page: ChartPage) {
    Remote(page.slug, { wireJson.decodeFromJsonElement(ChartPayload.serializer(), vm.api.get("api/chronicle/${page.group}/${page.slug}.json").json) }) { payload ->
        var count by remember { mutableIntStateOf(250) }
        val points = payload.series.takeLast(count)
        val color = MaterialTheme.colorScheme.primary
        LazyColumn(contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item {
                Text(page.cardTitle, style = MaterialTheme.typography.headlineLarge); Text(page.chartNote)
                Row { listOf(250, 750, Int.MAX_VALUE).forEach { size -> TextButton(onClick = { count = size }) { Text(if (size == Int.MAX_VALUE) "全部" else "近 $size 点") } } }
            }
            if (points.isEmpty()) item { Text("暂无可用数据，网站尚未同步这组数据。") }
            else item {
                Canvas(Modifier.fillMaxWidth().height(280.dp)) {
                    val min = if (payload.meta.type == "bar") minOf(0.0, points.minOf { it.value }) else points.minOf { it.value }
                    val max = if (payload.meta.type == "bar") maxOf(0.0, points.maxOf { it.value }) else points.maxOf { it.value }
                    val span = (max - min).takeIf { it > 0 } ?: 1.0
                    val path = Path()
                    points.forEachIndexed { index, point ->
                        val x = index.toFloat() / (points.size - 1).coerceAtLeast(1) * this.size.width
                        val y = this.size.height - ((point.value - min) / span * this.size.height).toFloat()
                        if (payload.meta.type == "bar") drawLine(color, androidx.compose.ui.geometry.Offset(x, (this.size.height - (0 - min) / span * this.size.height).toFloat()), androidx.compose.ui.geometry.Offset(x, y), strokeWidth = (this.size.width / points.size).coerceAtMost(18f))
                        else if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    if (payload.meta.type != "bar") drawPath(path, color, style = androidx.compose.ui.graphics.drawscope.Stroke(3f))
                }
                Text("${points.first().date} — ${points.last().date}", style = MaterialTheme.typography.labelMedium)
                Text("最新值 ${"%.2f".format(points.last().value)}", style = MaterialTheme.typography.titleLarge)
                Text("区间数值 ${"%.2f".format(points.minOf { it.value })} — ${"%.2f".format(points.maxOf { it.value })}", style = MaterialTheme.typography.labelSmall)
            }
            item { Text("来源：${payload.meta.source ?: "网站未标注"}"); payload.meta.updatedAt?.let { Text("更新：$it") }; Text("仅供历史研究，不构成投资建议。", style = MaterialTheme.typography.labelSmall) }
        }
    }
}
@Composable private fun MyScreen(vm: FinHOTModel) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Text("FinHOT", style = MaterialTheme.typography.headlineLarge); Text("把分散的金融资讯，整理成可追溯的事件与每日简报。") }
        vm.library.readIDs.firstOrNull()?.let { id -> item { Text("继续阅读", style = MaterialTheme.typography.titleMedium); SavedRow(vm, id) } }
        item { TextButton(onClick = { vm.open(Screen.Bookmarks) }) { Text("我的收藏 · ${vm.library.bookmarks.size}") } }
        item { TextButton(onClick = { vm.open(Screen.History) }) { Text("阅读记录") } }
        item { TextButton(onClick = { vm.open(Screen.Topics) }) { Text("金融主题") } }
        item { TextButton(onClick = { vm.open(Screen.Policy("terms", "使用规则")) }) { Text("使用规则") } }
        item { TextButton(onClick = { vm.open(Screen.Policy("privacy", "隐私说明")) }) { Text("隐私说明") } }
        item { Text("收藏、已读记录和段落位置仅保存在本机，不与网站或其他设备自动同步。", style = MaterialTheme.typography.bodySmall) }
        item { Text("资讯与 AI 摘要仅供阅读研究，重要信息请核对原文。行情可能有延迟，不构成投资建议。", style = MaterialTheme.typography.bodySmall) }
        item { Text("版本 ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelSmall) }
    }
}
@Composable private fun SavedScreen(vm: FinHOTModel, ids: List<String>, history: Boolean) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (ids.isEmpty()) item { Text(if (history) "还没有阅读记录。" else "还没有收藏，可以在文章右上角收藏。") }
        items(ids, key = { it }) { id ->
            SavedRow(vm, id)
            TextButton(onClick = { if (history) vm.markUnread(id) else vm.bookmark(id) }) { Text(if (history) "标为未读" else "移除收藏") }
            HorizontalDivider()
        }
    }
}
@Composable private fun SavedRow(vm: FinHOTModel, id: String) {
    Remote(id, { vm.api.siteGet<ArticleDetail>("items/$id") }) { item ->
        Column(Modifier.fillMaxWidth().clickable { vm.open(Screen.ArticlePage(id)) }.padding(vertical = 12.dp)) {
            Text(item.title, style = MaterialTheme.typography.titleMedium)
            Text("${item.source.name} · ${if (id in vm.library.readIDs) "已读" else "未读"}", style = MaterialTheme.typography.labelMedium)
        }
    }
}
@Composable private fun TopicsScreen(vm: FinHOTModel) {
    Remote("topics", { vm.api.siteGet<TopicDirectory>("topics") }) { directory ->
        LazyColumn(contentPadding = PaddingValues(20.dp)) {
            items(directory.topics, key = { it.slug }) { topic ->
                Column(Modifier.fillMaxWidth().clickable { vm.open(Screen.TopicPage(topic.slug, topic.name)) }.padding(vertical = 16.dp)) {
                    Text(topic.name, style = MaterialTheme.typography.titleMedium); Text(topic.definition); Text("${topic.total} 条精选", style = MaterialTheme.typography.labelSmall)
                }; HorizontalDivider()
            }
        }
    }
}
@Composable private fun TopicScreen(vm: FinHOTModel, route: Screen.TopicPage) {
    var page by rememberSaveable { mutableIntStateOf(1) }
    Remote("${route.slug}:$page", { vm.api.siteGet<TopicPage>("topics/${route.slug}", mapOf("page" to "$page")) }) { result ->
        LazyColumn(contentPadding = PaddingValues(20.dp)) {
            items(result.items, key = { it.id }) { ArticleCard(vm, it) }
            item { Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                TextButton(onClick = { page-- }, enabled = page > 1) { Text("上一页") }
                Text("$page / ${result.pageCount.coerceAtLeast(1)}", Modifier.padding(top = 12.dp))
                TextButton(onClick = { page++ }, enabled = page < result.pageCount) { Text("下一页") }
            } }
        }
    }
}
