package expo.modules.xrglasses.stream

/**
 * StreamQuality - Quality presets for Remote View streaming.
 *
 * Each preset balances resolution, frame rate, and bitrate for different
 * network conditions and use cases.
 */
enum class StreamQuality(
    val displayName: String,
    val width: Int,
    val height: Int,
    val fps: Int,
    val bitrate: Int,
    val description: String
) {
    LOW_LATENCY(
        displayName = "Low Latency",
        width = 640,
        height = 480,
        fps = 10,
        bitrate = 300,
        description = "Fastest response, lower quality"
    ),
    BALANCED(
        displayName = "Balanced",
        width = 640,
        height = 480,
        fps = 15,
        bitrate = 500,
        description = "Good quality, recommended"
    ),
    HIGH_QUALITY(
        displayName = "High Quality",
        width = 640,
        height = 480,
        fps = 30,
        bitrate = 800,
        description = "Best quality, needs strong network"
    );

    companion object {
        /**
         * Parse quality from string (matches React Native quality names).
         */
        fun fromString(value: String): StreamQuality {
            return when (value.lowercase()) {
                "low_latency" -> LOW_LATENCY
                "balanced" -> BALANCED
                "high_quality" -> HIGH_QUALITY
                else -> BALANCED
            }
        }
    }
}
