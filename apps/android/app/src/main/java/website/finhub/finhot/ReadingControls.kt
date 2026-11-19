package website.finhub.finhot

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable internal fun ScopeSelector(labels: List<String>, selected: Int, modifier: Modifier = Modifier,
                                      enabled: Boolean = true, onSelect: (Int) -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    val colors = MaterialTheme.colorScheme
    Row(modifier.selectableGroup().clip(shape).background(colors.surfaceContainer).padding(3.dp),
        verticalAlignment = Alignment.CenterVertically) {
        labels.forEachIndexed { index, label ->
            val active = index == selected
            Box(Modifier.weight(1f).clip(shape)
                .background(if (active) colors.surface else Color.Transparent)
                .selectable(active, enabled, role = Role.Tab) { onSelect(index) }
                .heightIn(min = 34.dp).padding(horizontal = 3.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center) {
                Text(label, style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                    color = if (enabled) colors.onSurface else colors.onSurfaceVariant)
            }
        }
    }
}

@Composable internal fun ReadingTabs(labels: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val icons = listOf(R.drawable.ic_news, R.drawable.ic_heat, R.drawable.ic_report,
        R.drawable.ic_timeline, R.drawable.ic_profile)
    val colors = MaterialTheme.colorScheme
    val capsule = RoundedCornerShape(36.dp)
    Surface(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 14.dp, vertical = 6.dp),
        shape = capsule, color = colors.surface, shadowElevation = 6.dp) {
        Row(Modifier.selectableGroup().padding(4.dp)) {
            labels.forEachIndexed { index, label ->
                val active = index == selected
                val tint = if (active) colors.primary else colors.onSurface
                Column(Modifier.weight(1f).clip(capsule)
                    .background(if (active) colors.secondaryContainer else Color.Transparent)
                    .selectable(active, role = Role.Tab) { onSelect(index) }
                    .heightIn(min = 50.dp).padding(vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(painterResource(icons[index]), null, Modifier.size(21.dp), tint = tint)
                    Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = tint)
                }
            }
        }
    }
}

@Composable internal fun LibraryLink(label: String, icon: Int, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 52.dp).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(painterResource(icon), null, Modifier.size(21.dp), tint = MaterialTheme.colorScheme.primary)
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Icon(painterResource(R.drawable.ic_next), null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
