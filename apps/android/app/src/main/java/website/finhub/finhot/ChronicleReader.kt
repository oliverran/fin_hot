package website.finhub.finhot

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable data class Chronicles(val a: Book, val us: Book)
@Serializable data class Book(val title: String, val intro: List<String>, val volumes: List<Volume>) {
    fun volume(id: String) = volumes.first { it.id == id }
    val chapters by lazy { volumes.flatMap { v -> v.chapters.map { v to it } } }
    val references by lazy {
        buildMap {
            for ((volume, chapter) in chapters) for (passage in chapter.passages)
                put(passage.id, Triple(volume, chapter, passage))
        }
    }
}
@Serializable data class Volume(val id: String, val title: String, val blurb: String, val intro: List<String>, val chapters: List<Chapter>)
@Serializable data class Chapter(val id: String, val title: String, val lead: String, val passages: List<Passage>,
    val comparisons: List<String> = emptyList(), val notes: List<ReadingNote> = emptyList())
@Serializable data class Passage(val id: String, val title: String, val intro: String, val caption: String? = null,
    val body: List<String> = emptyList(), val chart: String? = null, val path: String? = null, val related: List<String> = emptyList(),
    val notes: List<ReadingNote> = emptyList())
@Serializable data class ReadingNote(val title: String, val paragraphs: List<String>)

class BookPosition(var index: Int? = null, var offset: Int = 0)
internal fun FinHOTModel.currentBook() = if (usMarket) book.us else book.a

@Composable private fun savedList(position: BookPosition, start: Int = 0): LazyListState {
    val list = rememberLazyListState(position.index ?: start, position.offset)
    DisposableEffect(list) {
        onDispose {
            position.index = list.firstVisibleItemIndex
            position.offset = list.firstVisibleItemScrollOffset
        }
    }
    return list
}

@Composable private fun BookLink(title: String, detail: String? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            detail?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Icon(painterResource(R.drawable.ic_next), null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary)
    }
    HorizontalDivider()
}

@Composable private fun Body(vm: FinHOTModel, text: String) {
    Text(text, fontSize = vm.library.textSize.sp, lineHeight = (vm.library.textSize + 9).sp)
}

@Composable private fun Note(vm: FinHOTModel, note: ReadingNote) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(note.title, style = MaterialTheme.typography.titleMedium)
        note.paragraphs.forEach { Body(vm, it) }
    }
}

@Composable internal fun ChronicleScreen(vm: FinHOTModel) {
    val book = vm.currentBook()
    Column {
        ScopeSelector(listOf("A 股", "美股"), if (vm.usMarket) 1 else 0,
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp)) { vm.usMarket = it == 1 }
        key(vm.usMarket) {
            LazyColumn(state = savedList(vm.homePositions[if (vm.usMarket) 1 else 0]), contentPadding = PaddingValues(20.dp)) {
                item {
                    Text(book.title, style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(10.dp))
                    Body(vm, book.intro.first())
                    var expanded by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(false) }
                    if (expanded) book.intro.drop(1).forEach { Spacer(Modifier.height(8.dp)); Body(vm, it) }
                    Row {
                        TextButton({ expanded = !expanded }) { Text(if (expanded) "收起序言" else "完整序言") }
                        TextButton({ vm.open(Screen.ChartIndex) }) { Text("图表索引") }
                    }
                    HorizontalDivider()
                }
                items(book.volumes, key = { it.id }) { volume ->
                    BookLink(volume.title, volume.blurb) { vm.open(Screen.Volume(volume.id)) }
                }
                if (vm.usMarket) item { ExternalLink("编年史来源 · History of Market", "https://historyofmarket.com/") }
            }
        }
    }
}

@Composable internal fun ChronicleIndex(vm: FinHOTModel) {
    val charts = if (vm.usMarket) usCharts else vm.charts
    LazyColumn(contentPadding = PaddingValues(20.dp)) {
        items(charts, key = { it.slug }) { page -> BookLink(page.cardTitle, page.cardBlurb) { vm.open(Screen.Chart(page)) } }
    }
}

@Composable internal fun IndexedChart(vm: FinHOTModel, page: ChartPage) {
    val book = vm.currentBook()
    val chartKey = "${page.group}/${page.slug}"
    val location = remember(book, page) {
        book.chapters.firstOrNull { (_, chapter) ->
            chapter.passages.any { it.chart == chartKey } || (page.group == "us" && page.slug in chapter.comparisons)
        }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        location?.let { (volume, chapter) ->
            item {
                BookLink("在章节中阅读 · ${chapter.title}", volume.title) {
                    val anchor = chapter.passages.firstOrNull { it.chart == chartKey }?.id
                    vm.open(Screen.Chapter(volume.id, chapter.id, anchor))
                }
            }
        }
        item { ChartFigure(vm, page) }
    }
}

@Composable internal fun VolumeReader(vm: FinHOTModel, route: Screen.Volume) {
    val volume = vm.currentBook().volume(route.id)
    LazyColumn(state = savedList(route.position), contentPadding = PaddingValues(20.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(volume.title, style = MaterialTheme.typography.headlineLarge)
                (volume.intro.ifEmpty { listOf(volume.blurb) }).forEach { Body(vm, it) }
                Text("卷内目录", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
        }
        itemsIndexed(volume.chapters, key = { _, c -> c.id }) { index, chapter ->
            BookLink("${index + 1}　${chapter.title}") { vm.open(Screen.Chapter(volume.id, chapter.id)) }
        }
    }
}

@Composable internal fun ChapterReader(vm: FinHOTModel, route: Screen.Chapter) {
    val book = vm.currentBook()
    val volume = book.volume(route.volume)
    val chapter = volume.chapters.first { it.id == route.id }
    val anchor = chapter.passages.indexOfFirst { it.id == route.anchor }
    val list = savedList(route.position, if (anchor < 0) 0 else anchor + 1)
    val scope = rememberCoroutineScope()
    LazyColumn(state = list, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${book.title} · ${volume.title}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(chapter.title, style = MaterialTheme.typography.headlineLarge)
                Body(vm, chapter.lead)
                if (chapter.passages.size > 1) {
                    var choose by remember { mutableStateOf(false) }
                    Box {
                        TextButton({ choose = true }) { Text("本章目录") }
                        DropdownMenu(choose, { choose = false }) {
                            chapter.passages.forEachIndexed { index, passage ->
                                DropdownMenuItem(text = { Text(passage.title) }, onClick = {
                                    choose = false
                                    scope.launch { list.scrollToItem(index + 1) }
                                })
                            }
                        }
                    }
                }
            }
        }
        items(chapter.passages, key = { it.id }) { passage ->
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                HorizontalDivider()
                passage.caption?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
                Text(passage.title, style = MaterialTheme.typography.titleLarge)
                Body(vm, passage.intro)
                passage.chart?.let { ChartFigure(vm, vm.nativeCharts.getValue(it), fullHistory = true) }
                passage.body.forEach { Body(vm, it) }
                passage.notes.forEach { Note(vm, it) }
                passage.path?.let { ExternalLink("在官网查看本节原图", vm.api.base + it) }
                passage.related.forEach { ref ->
                    book.references[ref]?.let { (v, c, p) ->
                        TextButton({ vm.open(Screen.Chapter(v.id, c.id, p.id)) }) { Text("关联阅读 · ${p.title}") }
                    }
                }
            }
        }
        items(chapter.notes) { Note(vm, it) }
        if (chapter.comparisons.isNotEmpty()) item {
            Text("对照阅读", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            chapter.comparisons.forEach { slug ->
                val page = vm.nativeCharts.getValue("us/$slug")
                ChartFigure(vm, page, fullHistory = true)
            }
        }
        item {
            val next = book.chapters.getOrNull(book.chapters.indexOfFirst { it.first.id == volume.id && it.second.id == chapter.id } + 1)
            when {
                next == null -> Text("全书读毕", style = MaterialTheme.typography.titleMedium)
                next.first.id == volume.id -> BookLink("接着读 · ${next.second.title}", volume.title) {
                    vm.open(Screen.Chapter(volume.id, next.second.id))
                }
                else -> BookLink("接着读 · ${next.first.title}", next.first.blurb) { vm.open(Screen.Volume(next.first.id)) }
            }
            TextButton({ vm.returnToVolumes() }) { Text("返回分卷目录") }
        }
    }
}
