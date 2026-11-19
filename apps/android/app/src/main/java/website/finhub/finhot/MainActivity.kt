package website.finhub.finhot

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val colors = if (isSystemInDarkTheme()) {
                darkColorScheme(
                    primary = Color(0xff80ced3), onPrimary = Color.Black,
                    background = Color(0xff101012), surface = Color(0xff101012),
                    onSurface = Color(0xfff5f5f7), onSurfaceVariant = Color(0xffb3b3ba),
                    surfaceContainer = Color(0xff232326), surfaceContainerHigh = Color(0xff323236),
                    secondaryContainer = Color(0xff153a3e), outlineVariant = Color(0xff36363b)
                )
            } else {
                lightColorScheme(
                    primary = Color(0xff176b75), onPrimary = Color.White,
                    background = Color.White, surface = Color.White,
                    onSurface = Color(0xff19191c), onSurfaceVariant = Color(0xff63636b),
                    surfaceContainer = Color(0xfff1f1f4), surfaceContainerHigh = Color(0xffe8e8ec),
                    secondaryContainer = Color(0xffe4f1f2), outlineVariant = Color(0xffdedee3)
                )
            }
            MaterialTheme(colorScheme = colors, typography = readingTypography) { FinHOTApp(viewModel()) }
        }
    }
}

private val readingTypography = Typography(
    headlineLarge = TextStyle(fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold),
    headlineSmall = TextStyle(fontSize = 22.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 19.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 17.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 17.sp, lineHeight = 25.sp),
    bodyMedium = TextStyle(fontSize = 15.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 15.sp)
)
