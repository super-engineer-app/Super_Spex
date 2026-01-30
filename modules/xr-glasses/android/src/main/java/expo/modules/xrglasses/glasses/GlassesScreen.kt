package expo.modules.xrglasses.glasses

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Glasses-optimized color palette.
 * Black = transparent on additive displays, so we use dark grays for surfaces.
 */
private object GlassesColors {
    val primary = Color(0xFFA8C7FA)      // Light blue - primary accent
    val secondary = Color(0xFF4C88E9)    // Blue - secondary accent
    val positive = Color(0xFF4CE995)     // Green - success
    val negative = Color(0xFFF57084)     // Red - error
    val surface = Color(0xFF2A2A3A)      // Dark purple-gray for visibility
    val onSurface = Color(0xFFFFFFFF)    // White text for contrast
    val outline = Color(0xFF606480)      // Border color
    val background = Color(0xFF1A1A2A)   // Dark blue-gray (visible in emulator)
}

/**
 * Main screen composable for the glasses display.
 * Styled for AI glasses with high contrast and minimal UI.
 */
@Composable
fun GlassesScreen(
    uiState: GlassesUiState,
    onClose: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(GlassesColors.background)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Listening indicator
            AnimatedVisibility(
                visible = uiState.isListening,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                ListeningIndicator()
            }

            // Main content card
            MainContentCard(
                uiState = uiState,
                onClose = onClose
            )

            // Error display
            uiState.error?.let { error ->
                ErrorCard(error = error)
            }
        }
    }
}

@Composable
private fun ListeningIndicator() {
    Surface(
        shape = RoundedCornerShape(24.dp),
        color = GlassesColors.surface,
        modifier = Modifier.padding(8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Text(
                text = "● Listening...",
                color = GlassesColors.primary,
                fontSize = 16.sp
            )
        }
    }
}

@Composable
private fun MainContentCard(
    uiState: GlassesUiState,
    onClose: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = GlassesColors.surface,
        modifier = Modifier
            .fillMaxWidth(0.9f)
            .padding(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Title
            Text(
                text = "AI Assistant",
                color = GlassesColors.primary,
                fontSize = 24.sp
            )

            HorizontalDivider(color = GlassesColors.outline, thickness = 1.dp)

            // Show partial transcript while listening
            if (uiState.partialTranscript.isNotEmpty()) {
                TranscriptSection(
                    label = "You:",
                    text = uiState.partialTranscript,
                    isPartial = true
                )
            }

            // Show final transcript
            if (uiState.transcript.isNotEmpty() && uiState.partialTranscript.isEmpty()) {
                TranscriptSection(
                    label = "You:",
                    text = uiState.transcript,
                    isPartial = false
                )
            }

            // Show AI response
            if (uiState.aiResponse.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                TranscriptSection(
                    label = "AI:",
                    text = uiState.aiResponse,
                    isPartial = false,
                    isAi = true
                )
            }

            // Empty state
            if (uiState.transcript.isEmpty() &&
                uiState.partialTranscript.isEmpty() &&
                uiState.aiResponse.isEmpty() &&
                !uiState.isListening) {
                Text(
                    text = "Tap touchpad to start speaking",
                    color = GlassesColors.outline,
                    fontSize = 16.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // Close button
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                Button(
                    onClick = onClose,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GlassesColors.secondary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Close", color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun TranscriptSection(
    label: String,
    text: String,
    isPartial: Boolean,
    isAi: Boolean = false
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            color = if (isAi) GlassesColors.secondary else GlassesColors.outline,
            fontSize = 14.sp
        )
        Text(
            text = text,
            color = if (isPartial) GlassesColors.outline else GlassesColors.onSurface,
            fontSize = 18.sp
        )
    }
}

@Composable
private fun ErrorCard(error: String) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = GlassesColors.surface,
        modifier = Modifier
            .fillMaxWidth(0.9f)
            .padding(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "⚠ $error",
                color = GlassesColors.negative,
                fontSize = 14.sp
            )
        }
    }
}
