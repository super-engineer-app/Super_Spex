package expo.modules.xrglasses.stream

/**
 * StreamSession - Data class representing an active streaming session.
 *
 * Contains all information needed to identify and share a streaming session.
 */
data class StreamSession(
    val channelId: String,
    val viewerUrl: String,
    val quality: StreamQuality,
    val startTimeMs: Long = System.currentTimeMillis()
)

/**
 * ViewerInfo - Data class representing a connected viewer.
 */
data class ViewerInfo(
    val uid: Int,
    val displayName: String? = null,
    val isSpeaking: Boolean = false
)
