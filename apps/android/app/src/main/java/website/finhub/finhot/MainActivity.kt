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
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val colors = if (isSystemInDarkTheme()) {
                darkColorScheme(
                    primary = Color(0xff82d4d7), onPrimary = Color(0xff00373b),
                    secondaryContainer = Color(0xff25494c), onSecondaryContainer = Color(0xffc6f3f3),
                    background = Color(0xff111718), surface = Color(0xff111718),
                    surfaceContainer = Color(0xff192122), onSurfaceVariant = Color(0xffbdcbcc)
                )
            } else {
                lightColorScheme(
                    primary = Color(0xff176b75), onPrimary = Color.White,
                    secondaryContainer = Color(0xffd6edee), onSecondaryContainer = Color(0xff134f55),
                    background = Color(0xfffffdf9), surface = Color(0xfffffdf9),
                    surfaceContainer = Color(0xfff1f5f3), onSurfaceVariant = Color(0xff475759)
                )
            }
            MaterialTheme(colorScheme = colors) { FinHOTApp(viewModel()) }
        }
    }
}
