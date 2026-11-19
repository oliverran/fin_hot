package website.finhub.finhot

import android.content.Intent
import android.text.Html
import android.text.method.LinkMovementMethod
import android.widget.TextView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.draw.drawWithCache
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
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import java.net.URI

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun FinHOTApp(vm: FinHOTModel) {
    val titles = listOf("FinHOT", "热点事件", "金融简报", "编年史", "我的")
    val labels = listOf("资讯", "热点", "简报", "编年史", "我的")
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
        if (route == null && vm.tab != 0) {
            Text(titles[vm.tab], Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, top = 12.dp, bottom = 10.dp),
                style = MaterialTheme.typography.headlineLarge)
        } else CenterAlignedTopAppBar(expandedHeight = 50.dp, title = { Text(when (route) {
            null -> titles[vm.tab]
            is Screen.ArticlePage -> ""
            is Screen.StoryPage -> "事件追踪"; is Screen.IssuePage -> route.kind.label
            is Screen.Volume -> "分卷目录"
            is Screen.Chapter -> vm.currentBook().volume(route.volume).title
            Screen.ChartIndex -> "图表索引"
            is Screen.Chart -> "历史图表"; is Screen.TopicPage -> route.name; Screen.Topics -> "金融主题"
            Screen.Bookmarks -> "我的收藏"; Screen.History -> "阅读记录"; is Screen.Policy -> route.title
        }, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = { if (route != null) IconButton(onClick = vm::back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") } },
            actions = { if (route == null && vm.tab == 0) {
                IconButton(onClick = { vm.open(Screen.Topics) }) {
                    Icon(painterResource(R.drawable.ic_topics), "主题", Modifier.size(21.dp), tint = MaterialTheme.colorScheme.primary)
                }
            } else if (route is Screen.ArticlePage) {
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
                val bookmarkLabel = if (route.id in vm.library.bookmarks) "已收藏" else "收藏"
                val share = {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "${vm.api.base}/items/${route.id}")
                    }
                    context.startActivity(Intent.createChooser(intent, "分享资讯"))
                }
                if (LocalDensity.current.fontScale > 1.3f) {
                    var actionsOpen by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { actionsOpen = true }) { Icon(Icons.Default.MoreVert, "阅读操作") }
                        DropdownMenu(actionsOpen, { actionsOpen = false }) {
                            DropdownMenuItem({ Text(bookmarkLabel) }, { actionsOpen = false; vm.bookmark(route.id) })
                            DropdownMenuItem({ Text("分享") }, { actionsOpen = false; share() })
                        }
                    }
                } else {
                    IconButton(onClick = { vm.bookmark(route.id) }) {
                        Icon(painterResource(if (route.id in vm.library.bookmarks) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
                            bookmarkLabel, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary)
                    }
                    IconButton(onClick = share) { Icon(painterResource(R.drawable.ic_share), "分享", Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary) }
                }
            } })
    }, bottomBar = {
        if (route == null) BoxWithConstraints(Modifier.fillMaxWidth()) {
            if (LocalDensity.current.fontScale > 1.3f && maxWidth < 480.dp) {
                var choosingTab by remember { mutableStateOf(false) }
                Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
                    Box(Modifier.fillMaxWidth().navigationBarsPadding()) {
                        TextButton(onClick = { choosingTab = true }, modifier = Modifier.fillMaxWidth()) {
                            Text("${labels[vm.tab]} · 切换栏目")
                            Icon(Icons.Default.ArrowDropDown, null)
                        }
                        DropdownMenu(choosingTab, { choosingTab = false }) {
                            labels.forEachIndexed { index, label ->
                                DropdownMenuItem(text = { Text(label) }, onClick = {
                                    vm.selectTab(index)
                                    choosingTab = false
                                })
                            }
                        }
                    }
                }
            } else {
                ReadingTabs(labels, vm.tab) { vm.selectTab(it) }
            }
        }
    }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (route == null) when (vm.tab) {
                0 -> FeedScreen(vm); 1 -> HotScreen(vm); 2 -> ReportsScreen(vm); 3 -> ChronicleScreen(vm); else -> MyScreen(vm)
            } else key(route) { when (route) {
                is Screen.ArticlePage -> Remote(route, { vm.api.siteGet<ArticleDetail>("items/${route.id}") }) { Reader(vm, it) }
                is Screen.StoryPage -> StoryScreen(vm, route.id)
                is Screen.IssuePage -> IssueScreen(vm, route)
                is Screen.Volume -> VolumeReader(vm, route)
                is Screen.Chapter -> ChapterReader(vm, route)
                Screen.ChartIndex -> ChronicleIndex(vm)
                is Screen.Chart -> IndexedChart(vm, route.page)
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
@Composable private fun <T> Remote(requestKey: Any, load: suspend () -> T, content: @Composable (T) -> Unit) = key(requestKey) {
    var retry by remember { mutableIntStateOf(0) }
    val state by produceState(RemoteState<T>(), retry) {
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
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, list) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE) {
                vm.rememberFeed(list.firstVisibleItemIndex, list.firstVisibleItemScrollOffset, currentIDs)
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(Unit) {
        if (!vm.loading && vm.error == null) {
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
                val colors = MaterialTheme.colorScheme
                val type = MaterialTheme.typography
                val hint = "搜索金融资讯"
                Row(Modifier.fillMaxWidth().padding(bottom = 12.dp).background(colors.surfaceContainer, RoundedCornerShape(24.dp))
                    .heightIn(min = 44.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Search, null, Modifier.size(20.dp), tint = colors.onSurfaceVariant)
                    Spacer(Modifier.width(8.dp))
                    BasicTextField(search, { search = it; if (it.isEmpty() && searching) vm.updateQuery(vm.query.copy(search = "")) },
                        modifier = Modifier.weight(1f).semantics { contentDescription = hint }, singleLine = true,
                        textStyle = type.bodyMedium.copy(color = colors.onSurface), cursorBrush = SolidColor(colors.primary),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = {
                            vm.updateQuery(vm.query.copy(search = search.trim()))
                            focus.clearFocus()
                        }), decorationBox = { field ->
                            Box(Modifier.fillMaxWidth().heightIn(min = 44.dp), contentAlignment = Alignment.CenterStart) {
                                if (search.isEmpty()) Text(hint, style = type.bodyMedium, color = colors.onSurfaceVariant)
                                field()
                            }
                        })
                    if (search.isNotEmpty()) IconButton(onClick = {
                        search = ""
                        if (searching) vm.updateQuery(vm.query.copy(search = ""))
                    }) { Icon(Icons.Default.Close, "清除搜索") }
                }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("最近 7 天", color = colors.onSurfaceVariant, style = type.bodyMedium)
                    ScopeSelector(listOf("精选", "全部动态"), if (searching || vm.query.mode == "all") 1 else 0,
                        Modifier.weight(1f), !searching) { vm.updateQuery(vm.query.copy(mode = if (it == 0) "selected" else "all")) }
                }
                HorizontalDivider()
                Box {
                    Row(Modifier.fillMaxWidth().clickable { expanded = true }.heightIn(min = 48.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text("分类", Modifier.weight(1f))
                        Text(vm.categories.firstOrNull { it.key == vm.query.category }?.label ?: "全部分类", color = colors.primary)
                        Icon(Icons.Default.ArrowDropDown, null, Modifier.size(18.dp), tint = colors.primary)
                    }
                    DropdownMenu(expanded, { expanded = false }) {
                        DropdownMenuItem({ Text("全部分类") }, { expanded = false; vm.updateQuery(vm.query.copy(category = "")) })
                        vm.categories.forEach { category ->
                            DropdownMenuItem({ Text(category.label) }, { expanded = false; vm.updateQuery(vm.query.copy(category = category.key)) })
                        }
                    }
                }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .toggleable(vm.unreadOnly, role = Role.Switch) { vm.unreadOnly = it }, verticalAlignment = Alignment.CenterVertically) {
                    Text("只看未读", Modifier.weight(1f))
                    Switch(vm.unreadOnly, onCheckedChange = null, thumbContent = {}, colors = SwitchDefaults.colors(
                        uncheckedTrackColor = colors.outlineVariant, uncheckedThumbColor = androidx.compose.ui.graphics.Color.White,
                        uncheckedBorderColor = colors.outlineVariant, checkedTrackColor = colors.primary,
                        checkedThumbColor = androidx.compose.ui.graphics.Color.White
                    ))
                }
                HorizontalDivider()

            }
            items(visible, key = { it.id }) { article -> ArticleCard(vm, article) {
                vm.rememberFeed(list.firstVisibleItemIndex, list.firstVisibleItemScrollOffset, currentIDs)
                vm.open(Screen.ArticlePage(article.id))
            } }
            if (vm.error != null) item { Text(vm.error!!); TextButton(onClick = vm::retryFeed) { Text(if (vm.restartRequired) "刷新列表" else "重试") } }
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
    val colors = MaterialTheme.colorScheme
    val type = MaterialTheme.typography
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.source.name, Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis,
                    color = colors.primary, style = type.labelLarge)
                if (saved) Icon(painterResource(R.drawable.ic_bookmark_filled), "已收藏", Modifier.size(14.dp), tint = colors.primary)
                Text(if (isRead) "已读" else "未读", style = type.labelSmall, color = colors.onSurfaceVariant)
                if (item.selected) Text("精选", style = type.labelSmall, color = colors.onSurfaceVariant)
            }
            Text(item.title, style = type.titleMedium)
            item.summary?.takeIf { it.isNotBlank() }?.let {
                Text(it, maxLines = 3, overflow = TextOverflow.Ellipsis, style = type.bodyMedium, color = colors.onSurfaceVariant)
            }
            val metadata = listOfNotNull(vm.categories.firstOrNull { it.key == item.category }?.label,
                displayDate(item.publishedAt ?: item.discoveredAt).takeIf { it.isNotBlank() })
            if (metadata.isNotEmpty()) Text(metadata.joinToString("  "), style = type.labelMedium, color = colors.onSurfaceVariant)
        }
        Box {
            IconButton(onClick = { showActions = true }, modifier = Modifier.width(32.dp)) {
                Icon(Icons.Default.MoreVert, "文章操作", Modifier.size(18.dp), tint = colors.onSurfaceVariant)
            }
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
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(item.source.name, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(item.title, style = MaterialTheme.typography.headlineLarge)
                item.summary?.let { Text(it, fontSize = vm.library.textSize.sp, lineHeight = (vm.library.textSize + 9).sp) }
                item.reason?.let {
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("为什么值得关注", style = MaterialTheme.typography.titleMedium)
                            Text(it, fontSize = vm.library.textSize.sp, lineHeight = (vm.library.textSize + 8).sp)
                        }
                    }
                }
                Text(if (item.readingMode == "summary-only" || document.blocks.isEmpty()) "本站提供摘要，完整报道请阅读原文。" else "正文依据网站授权范围展示。",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                HorizontalDivider()
            }
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
@Composable internal fun ExternalLink(label: String, url: String) {
    val context = LocalContext.current
    if (runCatching { URI(url).scheme in listOf("https", "http") }.getOrDefault(false)) TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) }) { Text(label) }
}
@Composable private fun HotScreen(vm: FinHOTModel) {
    Remote("hot", { vm.api.publicGet<CollectionPayload<HotTopic>>("api/v1/hot-topics") }) { result ->
        LazyColumn(contentPadding = PaddingValues(20.dp)) {
            if (result.items.isEmpty()) item { Text("暂无热点事件") }
            items(result.items, key = { it.links.story ?: it.id }) { topic ->
                Row(Modifier.fillMaxWidth().clickable { routeID(topic.links.story, "/story/")?.let { vm.open(Screen.StoryPage(it)) } }
                    .padding(vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(topic.rank.toString().padStart(2, '0'), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(topic.title, style = MaterialTheme.typography.titleMedium)
                        Text("${topic.sourceCount} 个报道来源", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
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
        ScopeSelector(ReportKind.entries.map { it.label }, vm.reportKind.ordinal,
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp)) { vm.reportKind = ReportKind.entries[it] }
        val kind = vm.reportKind
        Remote(kind, { vm.api.publicGet<CollectionPayload<Issue>>("api/v1/${kind.collection}?limit=${if (kind == ReportKind.DAILY) 180 else 60}") }) { index ->
            LazyColumn(contentPadding = PaddingValues(20.dp)) {
                if (index.items.isEmpty()) item { Text("还没有发布${kind.label}") }
                items(index.items, key = { it.key(kind) }) { issue ->
                    Column(Modifier.fillMaxWidth().clickable { vm.open(Screen.IssuePage(kind, issue.key(kind))) }.padding(vertical = 18.dp)) {
                        Text(issue.key(kind), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(8.dp))
                        Text(issue.leadTitle ?: issue.headline ?: "金融${kind.label}", style = MaterialTheme.typography.titleMedium)
                    }; HorizontalDivider()
                }
            }
        }
    }
}
@Composable private fun IssueScreen(vm: FinHOTModel, page: Screen.IssuePage) {
    val kind = page.kind
    Remote(page, { vm.api.publicGet<ReportPayload>("api/v1/${kind.collection}/${page.key}").report }) { report ->
        val list = rememberLazyListState(page.firstRow, page.scrollOffset)
        DisposableEffect(list) {
            onDispose {
                page.firstRow = list.firstVisibleItemIndex
                page.scrollOffset = list.firstVisibleItemScrollOffset
            }
        }
        val scope = rememberCoroutineScope()
        val sections = remember(report) {
            report.sections.filter { it.items.isNotEmpty() || !it.summary.isNullOrBlank() } +
                if (report.flashes.isEmpty()) emptyList() else listOf(ReportSection("快讯", report.flashes))
        }
        val type = MaterialTheme.typography
        val colors = MaterialTheme.colorScheme
        val size = vm.library.textSize
        LazyColumn(state = list, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp)) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("${page.key}  ·  金融${kind.label}", style = type.labelLarge, color = colors.primary)
                    Text(report.lead?.title ?: report.headline ?: "本期导读", style = type.headlineSmall)
                    listOfNotNull(report.lead?.leadParagraph, report.overview)
                        .filter(String::isNotBlank).distinct().forEach {
                            Text(it, fontSize = size.sp, lineHeight = (size + 10).sp)
                        }
                    if (sections.isNotEmpty()) {
                        HorizontalDivider()
                        Text("本期版面", style = type.titleMedium)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            var headerIndex = 1
                            sections.forEach { section ->
                                val target = headerIndex
                                AssistChip(onClick = { scope.launch { list.scrollToItem(target) } },
                                    label = { Text(section.label) })
                                headerIndex += 1 + section.items.size
                            }
                        }
                    }
                }
            }
            sections.forEach { section ->
                item {
                    Column(Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(section.label, style = type.titleLarge, color = colors.primary)
                        section.summary?.takeIf(String::isNotBlank)?.let { Text(it, style = type.bodyLarge) }
                    }
                }
                items(section.items) { citation ->
                    val repeatsLead = citation.title == report.lead?.title && citation.summary == report.lead.leadParagraph
                    CitationRow(vm, citation, showSummary = !repeatsLead)
                }
            }
        }
    }
}

@Composable private fun CitationRow(vm: FinHOTModel, citation: Citation, showSummary: Boolean) {
    val id = routeID(citation.links.aihot, "/items/")
    val uri = androidx.compose.ui.platform.LocalUriHandler.current
    val external = citation.links.original.takeIf {
        runCatching { URI(it).scheme in listOf("https", "http") }.getOrDefault(false)
    }
    val open = when {
        id != null -> Modifier.clickable { vm.open(Screen.ArticlePage(id)) }
        external != null -> Modifier.clickable { uri.openUri(external) }
        else -> Modifier
    }
    Column(Modifier.fillMaxWidth().then(open).padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(citation.title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            if (id != null || external != null) Icon(painterResource(R.drawable.ic_next), "阅读报道", Modifier.size(15.dp))
        }
        citation.summary?.takeIf { showSummary && it.isNotBlank() }?.let {
            Text(it, fontSize = vm.library.textSize.sp, lineHeight = (vm.library.textSize + 9).sp)
        }
        Text(citation.source.name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider()
}

@Composable internal fun ChartFigure(vm: FinHOTModel, page: ChartPage, fullHistory: Boolean = false) {
    Remote(page, { vm.marketCharts.load(page) }) { payload ->
        var count by rememberSaveable(page.slug, fullHistory) { mutableIntStateOf(if (fullHistory) Int.MAX_VALUE else 250) }
        val dates = remember(payload, count) { payload.dates.takeLast(count) }
        val lines = remember(payload, count) { payload.lines.mapValues { it.value.takeLast(count) } }
        val colors = listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary)
        val bounds = remember(lines) {
            val values = lines.values.asSequence().flatten().filterNotNull()
            values.minOrNull()?.let { low -> low to values.max() }
        }
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column {
                Text(page.cardTitle, style = MaterialTheme.typography.titleLarge)
                Text(page.chartNote)
                if (payload.dates.size > 250) {
                    val ranges = if (payload.dates.size > 750) listOf(250, 750, Int.MAX_VALUE) else listOf(250, Int.MAX_VALUE)
                    ScopeSelector(ranges.map { if (it == Int.MAX_VALUE) "全部" else "近 $it 点" }, ranges.indexOf(count),
                        Modifier.fillMaxWidth().padding(top = 12.dp)) { count = ranges[it] }
                }
            }
            if (bounds == null) Text("暂无可用数据，网站尚未同步这组数据。")
            else Column {
                val bars = payload.meta.type == "bar"
                val minimum = bounds.first
                val maximum = bounds.second
                Box(Modifier.fillMaxWidth().height(280.dp).drawWithCache {
                    val low = if (bars) minOf(0.0, minimum) else minimum
                    val high = if (bars) maxOf(0.0, maximum) else maximum
                    val span = (high - low).takeIf { it > 0 } ?: 1.0
                    fun y(value: Double) = size.height * (1 - (value - low) / span).toFloat()
                    val paths = lines.values.map { values ->
                        Path().apply {
                            values.forEachIndexed { index, value ->
                                if (value != null) {
                                    val x = if (bars) size.width * (index + 0.5f) / dates.size
                                        else size.width * index / (dates.size - 1).coerceAtLeast(1)
                                    if (bars) {
                                        moveTo(x, y(0.0))
                                        lineTo(x, y(value))
                                    } else if (values.getOrNull(index - 1) == null) moveTo(x, y(value))
                                    else lineTo(x, y(value))
                                }
                            }
                        }
                    }
                    val stroke = androidx.compose.ui.graphics.drawscope.Stroke(
                        if (bars) (size.width / dates.size).coerceAtMost(18f) else 3f)
                    onDrawBehind {
                        paths.forEachIndexed { index, path -> drawPath(path, colors[index % colors.size], style = stroke) }
                    }
                })
                Text("${dates.first()} — ${dates.last()} · ${dates.size} 个观测期", style = MaterialTheme.typography.labelMedium)
                lines.entries.forEachIndexed { index, (name, values) ->
                    Text("${if (lines.size == 1) "最新值" else name} ${values.last()?.let { "%.2f".format(it) } ?: "暂无观测"}",
                        color = colors[index % colors.size], style = MaterialTheme.typography.titleMedium)
                }
                Text("区间数值 ${"%.2f".format(minimum)} — ${"%.2f".format(maximum)}", style = MaterialTheme.typography.labelSmall)
            }
            Column {
                if (dates.isNotEmpty()) {
                    Text("数据覆盖：${payload.dates.first()} — ${payload.dates.last()}")
                    if (payload.meta.status == "stale") Text("数据延迟 · 最新观测 ${dates.last()}", color = MaterialTheme.colorScheme.error)
                }
                if (page.group == "us") ExternalLink(payload.meta.source ?: "History of Market（数据来源）", "https://historyofmarket.com/")
                else Text("来源：${payload.meta.source ?: "网站未标注"}")
                payload.meta.updatedAt?.let { Text("数据更新时间：$it") }
                Text("仅供历史研究，不构成投资建议。", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
@Composable private fun MyScreen(vm: FinHOTModel) {
    val colors = MaterialTheme.colorScheme
    LazyColumn(Modifier.fillMaxSize().background(colors.surfaceContainer), contentPadding = PaddingValues(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = colors.surface) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("FinHOT", style = MaterialTheme.typography.headlineLarge)
                    Text("把分散的金融资讯，整理成可追溯的事件与每日简报。", color = colors.onSurfaceVariant)
                }
            }
        }
        vm.library.readIDs.firstOrNull()?.let { id -> item {
            Text("继续阅读", style = MaterialTheme.typography.labelLarge, color = colors.onSurfaceVariant)
            SavedRow(vm, id)
        } }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = colors.surface) {
                Column {
                    LibraryLink("阅读记录", R.drawable.ic_history) { vm.open(Screen.History) }
                    HorizontalDivider(Modifier.padding(start = 48.dp))
                    LibraryLink("我的收藏 · ${vm.library.bookmarks.size}", R.drawable.ic_bookmark) { vm.open(Screen.Bookmarks) }
                    HorizontalDivider(Modifier.padding(start = 48.dp))
                    LibraryLink("金融主题", R.drawable.ic_topics) { vm.open(Screen.Topics) }
                    HorizontalDivider(Modifier.padding(start = 48.dp))
                    LibraryLink("使用规则", R.drawable.ic_report) { vm.open(Screen.Policy("terms", "使用规则")) }
                    HorizontalDivider(Modifier.padding(start = 48.dp))
                    LibraryLink("隐私说明", R.drawable.ic_profile) { vm.open(Screen.Policy("privacy", "隐私说明")) }
                }
            }
        }
        item { Text("阅读说明", style = MaterialTheme.typography.labelLarge, color = colors.onSurfaceVariant) }
        item { Text("资讯与 AI 摘要仅供阅读研究，重要信息请核对原文。行情可能有延迟，不构成投资建议。", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant) }
        item { Text("收藏、已读记录和阅读位置仅保存在本机，不与网站或其他设备自动同步。", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant) }
        item { Text("版本 ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant) }
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
