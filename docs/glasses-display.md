# Glasses Display - Jetpack Compose Glimmer

## Overview

To display content on AI glasses, you need two libraries:
- **Jetpack Projected** (`androidx.xr.projected`) - Bridges phone ↔ glasses communication
- **Jetpack Compose Glimmer** (`androidx.xr.glimmer`) - UI toolkit optimized for glasses displays

## Architecture

```
Phone App (React Native)
    ↓ launches via
ProjectedContext.createProjectedActivityOptions()
    ↓
GlassesActivity (runs on glasses with xr_projected display category)
    ↓ uses
Jetpack Compose Glimmer UI Components
    ↓ renders to
Glasses Display (additive/transparent)
```

**Key concept**: The activity runs on the phone but its UI is *projected* to the glasses display.

## Dependencies (build.gradle.kts)

```kotlin
dependencies {
    // Jetpack Projected - phone ↔ glasses bridge
    implementation("androidx.xr.projected:projected:1.0.0-alpha04")

    // Jetpack Compose Glimmer - glasses UI toolkit
    implementation("androidx.xr.glimmer:glimmer:1.0.0-alpha05")

    // Required: Compose foundation
    implementation("androidx.compose.ui:ui:1.7.0")
    implementation("androidx.compose.foundation:foundation:1.7.0")
    implementation("androidx.compose.material3:material3:1.3.0")
    implementation("androidx.activity:activity-compose:1.9.0")

    // XR Extensions (MUST be compileOnly!)
    compileOnly("com.android.extensions.xr:extensions-xr:1.1.0")
}
```

## Manifest Configuration

```xml
<activity
    android:name=".glasses.GlassesActivity"
    android:exported="true"
    android:requiredDisplayCategory="xr_projected"
    android:label="Glasses Display">
    <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
    </intent-filter>
</activity>
```

The `android:requiredDisplayCategory="xr_projected"` attribute is what makes the activity render on glasses.

## GlassesActivity with Compose Glimmer

```kotlin
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.xr.glimmer.*
import androidx.xr.glimmer.theme.GlimmerTheme

class GlassesActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GlimmerTheme {
                GlassesScreen(onClose = { finish() })
            }
        }
    }
}

@Composable
fun GlassesScreen(onClose: () -> Unit) {
    Box(
        modifier = Modifier
            .surface(focusable = false)
            .fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Card(
            title = { Text("AI Assistant") },
            action = {
                Button(onClick = onClose) {
                    Text("Close")
                }
            }
        ) {
            Text("Hello from the glasses!")
        }
    }
}
```

## Glimmer Theme System

### Colors (7-color palette)
| Color | Hex | Purpose |
|-------|-----|---------|
| `primary` | #A8C7FA | Primary accent |
| `secondary` | #4C88E9 | Secondary accent |
| `positive` | #4CE995 | Success states |
| `negative` | #F57084 | Error states |
| `surface` | #000000 | Background (transparent on glasses!) |
| `outline` | #606460 | Borders |
| `outlineVariant` | #42434A | Secondary borders |

**Important**: Black (#000000) appears **transparent** on glasses displays because they use additive light technology.

### Typography
- 6 styles with bolder weights and wider letter spacing
- Optimized for glasses display legibility
- Access via `GlimmerTheme.typography`

### Available Components
- `Text` - Typography
- `Button` - Interactive buttons
- `Card` - Container cards
- `ListItem` - List items with depth
- `TitleChip` - Chip-style elements
- `Icon` - Material icons

## Launching the Glasses Activity

From phone code (e.g., XRGlassesService):

```kotlin
import androidx.xr.projected.ProjectedContext

fun launchGlassesActivity(context: Context) {
    val options = ProjectedContext.createProjectedActivityOptions(context)
    val intent = Intent(context, GlassesActivity::class.java)
    context.startActivity(intent, options.toBundle())
}
```

## Checking Connection Status

```kotlin
// Returns Flow<Boolean> for real-time updates
ProjectedContext.isProjectedDeviceConnected(context, coroutineContext)
```

## Emulator Testing

### YES - You can test glasses display on the emulator!

1. **Start AI Glasses emulator** (emulator-5554)
2. **Start Phone emulator** with CANARY image (emulator-5556)
3. **Pair them** via the Glasses app on phone
4. **Install app** on phone emulator
5. **Launch** - the GlassesActivity UI will appear on the glasses emulator!

### Emulator Features
- **Display**: Glasses emulator shows your Glimmer UI
- **Touchpad**: Simulated below the display - use mouse to tap/swipe
- **Voice**: Toggle microphone in emulator controls
- **Audio-only mode**: Test displayless glasses scenarios

### Emulator Limitations
- ❌ Camera capture not supported
- ❌ Some hardware sensors not available

## Design Principles for Glasses

1. **Glanceable**: Users primarily engage with the real world
2. **Minimal**: Less is more - avoid clutter
3. **High contrast**: Black = transparent, use bright colors
4. **Focus-based**: Depth indicates focus state automatically
5. **No ripples**: Glimmer uses outline-based focus feedback

## Input Methods

Glimmer components automatically handle:
- **Tap**: Single touch on touchpad
- **Swipe**: Scroll gestures
- **Voice**: Via SpeechRecognizer

## Sources

- [Create your first activity for AI glasses](https://developer.android.com/develop/xr/jetpack-xr-sdk/ai-glasses/first-activity)
- [Build UI with Jetpack Compose Glimmer](https://developer.android.com/develop/xr/jetpack-xr-sdk/jetpack-compose-glimmer)
- [What's included in Glimmer](https://developer.android.com/develop/xr/jetpack-xr-sdk/jetpack-compose-glimmer/whats-included)
- [Projected Context API](https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context)
- [AI Glasses Emulator](https://developer.android.com/develop/xr/jetpack-xr-sdk/run/emulator/ai-glasses)
- [xr-glimmer releases](https://developer.android.com/jetpack/androidx/releases/xr-glimmer)
- [xr-projected releases](https://developer.android.com/jetpack/androidx/releases/xr-projected)
