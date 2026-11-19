package website.finhub.finhot

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable

@Serializable internal data class PolicyDocument(
    val title: String,
    val metadata: List<Field>,
    val intro: String,
    val sections: List<Section>
) {
    @Serializable data class Field(val label: String, val value: String)
    @Serializable data class Run(val text: String, val url: String? = null)
    @Serializable data class Section(val heading: String, val paragraphs: List<List<Run>>)
}

@Composable internal fun PolicyReader(document: PolicyDocument, textSize: Int) {
    val colors = MaterialTheme.colorScheme
    val body = MaterialTheme.typography.bodyLarge.copy(fontSize = textSize.sp, lineHeight = (textSize + 9).sp)
    val links = TextLinkStyles(style = SpanStyle(color = colors.primary, textDecoration = TextDecoration.Underline))
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 680.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Surface(shape = RoundedCornerShape(12.dp), color = colors.surfaceContainer) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    document.metadata.forEach { field ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(field.label, Modifier.weight(1f), color = colors.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                            Text(field.value, Modifier.weight(2f), textAlign = TextAlign.End, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            Text(document.intro, Modifier.drawBehind {
                drawRect(color = colors.primary, size = Size(3.dp.toPx(), size.height))
            }.padding(start = 12.dp), style = body, color = colors.onSurfaceVariant)
            document.sections.forEach { section ->
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(section.heading, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                    section.paragraphs.forEach { paragraph ->
                        val text = remember(paragraph, links) {
                            buildAnnotatedString {
                                for (run in paragraph) {
                                    if (run.url == null) append(run.text)
                                    else withLink(LinkAnnotation.Url(run.url, links)) { append(run.text) }
                                }
                            }
                        }
                        Text(text, style = body)
                    }
                }
            }
        }
    }
}
