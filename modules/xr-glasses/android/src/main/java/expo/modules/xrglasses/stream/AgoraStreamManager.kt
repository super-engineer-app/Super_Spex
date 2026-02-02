package expo.modules.xrglasses.stream

import android.content.Context
import android.util.Log
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig
import io.agora.rtc2.video.VideoEncoderConfiguration
import io.agora.rtc2.video.AgoraVideoFrame
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/**
 * AgoraStreamManager - Manages Agora RTC engine for Remote View streaming.
 *
 * This class runs in :xr_process and handles all Agora SDK interactions.
 * Key responsibilities:
 * - Initialize and configure RtcEngine with low-latency settings
 * - Manage streaming sessions (start/stop)
 * - Push video frames from camera to Agora
 * - Track connected viewers
 *
 * IMPORTANT: This must run in :xr_process to avoid IPC overhead for video frames.
 */
class AgoraStreamManager(
    private val context: Context,
    private val appId: String,
    private val onStreamStarted: (StreamSession) -> Unit,
    private val onStreamStopped: () -> Unit,
    private val onStreamError: (String) -> Unit,
    private val onViewerUpdate: (Int, ViewerInfo?) -> Unit
) {
    companion object {
        private const val TAG = "AgoraStreamManager"
        private const val HOST_UID = 0  // 0 = auto-assign UID

        // URLs loaded from BuildConfig (set via .env file)
        private val VIEWER_URL_BASE: String by lazy {
            try {
                val buildConfigClass = Class.forName("com.xrglasses.app.BuildConfig")
                val field = buildConfigClass.getField("SPEX_VIEWER_URL_BASE")
                field.get(null) as? String ?: "https://spex-viewer.pages.dev/view/"
            } catch (e: Exception) {
                "https://spex-viewer.pages.dev/view/"
            }
        }

        private val TOKEN_SERVER_URL: String by lazy {
            "https://agora-token.spex-remote.workers.dev/"
        }
    }

    private var rtcEngine: RtcEngine? = null
    private var currentSession: StreamSession? = null
    private var viewerCount = 0
    private val viewers = mutableMapOf<Int, ViewerInfo>()

    // Executor for network operations (avoids NetworkOnMainThreadException)
    private val networkExecutor = Executors.newSingleThreadExecutor()

    /**
     * Initialize the Agora RTC engine with all low-latency optimizations.
     */
    fun initialize(): Boolean {
        if (rtcEngine != null) {
            Log.w(TAG, "RtcEngine already initialized")
            return true
        }

        try {
            Log.d(TAG, "Initializing Agora RtcEngine with appId='$appId' (length=${appId.length})")

            // Get application context
            val appContext = try {
                context.applicationContext
            } catch (e: Exception) {
                Log.w(TAG, "Could not get applicationContext from activity, trying MainApplication")
                Class.forName("com.xrglasses.app.MainApplication")
                    .getMethod("getInstance")
                    .invoke(null) as? android.content.Context
            }

            if (appContext == null) {
                Log.e(TAG, "Could not obtain application context")
                onStreamError("Could not obtain application context for streaming")
                return false
            }
            Log.d(TAG, "Got appContext: ${appContext.javaClass.name}")

            // IMPORTANT: Create config with explicit assignments, NOT nested apply blocks
            // Nested apply blocks were causing mAppId to become empty (bug!)
            val config = RtcEngineConfig()
            config.mContext = appContext
            config.mAppId = appId
            config.mEventHandler = rtcEventHandler
            config.mChannelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING

            Log.d(TAG, "Config created - mAppId: '${config.mAppId}' (length=${config.mAppId?.length})")

            rtcEngine = RtcEngine.create(config)

            // Apply all latency optimizations
            applyLowLatencySettings()

            Log.d(TAG, "Agora RtcEngine initialized successfully")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Agora RtcEngine", e)
            onStreamError("Failed to initialize streaming: ${e.message}")
            return false
        }
    }

    /**
     * Apply all low-latency settings as specified in the implementation plan.
     */
    private fun applyLowLatencySettings() {
        val engine = rtcEngine ?: return

        // Set as broadcaster (host) role
        engine.setClientRole(Constants.CLIENT_ROLE_BROADCASTER)

        // Enable video
        engine.enableVideo()

        // Enable audio (for glasses mic)
        engine.enableAudio()

        // Configure external video source (buffer mode for NV21 frames from CameraX)
        // useTexture = false because we're pushing raw NV21 byte buffers, not GPU textures
        engine.setExternalVideoSource(
            true,   // enabled
            false,  // useTexture = false for buffer mode (NV21)
            Constants.ExternalVideoSourceType.VIDEO_FRAME
        )

        // Minimize playout delay (buffering)
        engine.setParameters("{\"rtc.video.playout_delay_min\":0}")
        engine.setParameters("{\"rtc.video.playout_delay_max\":100}")

        // Enable hardware encoding
        engine.setParameters("{\"che.hardware_encoding\":1}")
        engine.setParameters("{\"che.video.videoCodecIndex\":2}")  // H.264

        // Optimize for low latency
        engine.setParameters("{\"rtc.video.lowlatency\":1}")

        Log.d(TAG, "Low-latency settings applied")
    }

    /**
     * Fetch an Agora token from the Cloudflare Worker token server.
     * This method runs network I/O on a background thread.
     */
    private fun fetchToken(channelId: String, role: String = "publisher"): String? {
        return try {
            // Run network call on background thread to avoid NetworkOnMainThreadException
            val future = networkExecutor.submit<String?> {
                try {
                    val url = URL("$TOKEN_SERVER_URL?channel=$channelId&role=$role")
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.connectTimeout = 10000
                    connection.readTimeout = 10000

                    if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                        val response = connection.inputStream.bufferedReader().readText()
                        val json = JSONObject(response)
                        json.getString("token")
                    } else {
                        Log.e(TAG, "Token server returned error: ${connection.responseCode}")
                        null
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to fetch token (inner)", e)
                    null
                }
            }
            // Wait for result (with timeout)
            future.get(15, TimeUnit.SECONDS)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch token", e)
            null
        }
    }

    /**
     * Start streaming with the specified quality preset.
     */
    fun startStream(quality: StreamQuality): StreamSession? {
        val engine = rtcEngine
        if (engine == null) {
            Log.d(TAG, "RtcEngine not initialized, initializing now...")
            if (!initialize()) {
                return null
            }
        }

        if (currentSession != null) {
            Log.w(TAG, "Stream already active, stopping first")
            stopStream()
        }

        try {
            // Generate unique channel ID
            val channelId = UUID.randomUUID().toString()
            val viewerUrl = "$VIEWER_URL_BASE$channelId"

            Log.d(TAG, "Starting stream with quality: ${quality.displayName}, channel: $channelId")

            // Fetch token from token server
            val token = fetchToken(channelId, "publisher")
            if (token == null) {
                val errorMsg = "Failed to get stream token from server"
                Log.e(TAG, errorMsg)
                onStreamError(errorMsg)
                return null
            }
            Log.d(TAG, "Token fetched successfully")

            // Apply quality preset to video encoder
            applyQualityPreset(quality)

            // Join channel with token
            val result = rtcEngine?.joinChannel(token, channelId, "", HOST_UID) ?: -1

            if (result != 0) {
                val errorMsg = "Failed to join channel: error code $result"
                Log.e(TAG, errorMsg)
                onStreamError(errorMsg)
                return null
            }

            // Create session
            val session = StreamSession(
                channelId = channelId,
                viewerUrl = viewerUrl,
                quality = quality
            )
            currentSession = session
            viewerCount = 0
            viewers.clear()

            Log.d(TAG, "Stream started successfully")
            onStreamStarted(session)

            return session

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start stream", e)
            onStreamError("Failed to start stream: ${e.message}")
            return null
        }
    }

    /**
     * Apply video encoder configuration based on quality preset.
     */
    private fun applyQualityPreset(quality: StreamQuality) {
        val engine = rtcEngine ?: return

        val frameRate = when (quality.fps) {
            15 -> VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_15
            30 -> VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_30
            else -> VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_15
        }

        val config = VideoEncoderConfiguration(
            VideoEncoderConfiguration.VideoDimensions(quality.width, quality.height),
            frameRate,
            quality.bitrate,
            VideoEncoderConfiguration.ORIENTATION_MODE.ORIENTATION_MODE_FIXED_PORTRAIT
        ).apply {
            minBitrate = 200  // Floor to prevent unwatchable quality
        }

        engine.setVideoEncoderConfiguration(config)
        Log.d(TAG, "Applied quality preset: ${quality.displayName} (${quality.width}x${quality.height} @ ${quality.fps}fps, ${quality.bitrate}kbps)")
    }

    /**
     * Stop the current stream.
     */
    fun stopStream() {
        Log.d(TAG, "Stopping stream...")

        rtcEngine?.leaveChannel()
        currentSession = null
        viewerCount = 0
        viewers.clear()

        onStreamStopped()
        Log.d(TAG, "Stream stopped")
    }

    /**
     * Update quality while streaming.
     */
    fun setQuality(quality: StreamQuality) {
        if (currentSession == null) {
            Log.w(TAG, "No active stream to update quality")
            return
        }

        applyQualityPreset(quality)
        currentSession = currentSession?.copy(quality = quality)
        Log.d(TAG, "Quality updated to: ${quality.displayName}")
    }

    /**
     * Push a video frame to Agora (texture mode).
     *
     * @param textureId OpenGL texture ID
     * @param width Frame width
     * @param height Frame height
     * @param transformMatrix 4x4 transformation matrix
     * @param eglContext EGL14 context (android.opengl.EGLContext)
     * @param timestampMs Frame timestamp in milliseconds
     */
    fun pushVideoFrame(
        textureId: Int,
        width: Int,
        height: Int,
        transformMatrix: FloatArray,
        eglContext: android.opengl.EGLContext?,
        timestampMs: Long
    ): Boolean {
        val engine = rtcEngine ?: return false
        if (currentSession == null) return false

        val frame = AgoraVideoFrame().apply {
            format = AgoraVideoFrame.FORMAT_TEXTURE_OES
            this.textureID = textureId
            this.transform = transformMatrix
            this.stride = width
            this.height = height
            eglContext?.let { this.eglContext14 = it }
            this.timeStamp = timestampMs
        }

        return engine.pushExternalVideoFrame(frame)
    }

    // Frame counter for periodic logging
    private var pushFrameCount = 0
    private var lastPushLogTime = 0L

    /**
     * Push a video frame to Agora (buffer mode).
     *
     * @param buffer NV21 buffer from CameraX (Y + interleaved VU)
     * @param width Frame width
     * @param height Frame height
     * @param rotation Rotation in degrees
     * @param timestampMs Frame timestamp
     */
    fun pushVideoFrameBuffer(
        buffer: ByteArray,
        width: Int,
        height: Int,
        rotation: Int,
        timestampMs: Long
    ): Boolean {
        val engine = rtcEngine ?: return false
        if (currentSession == null) return false

        val frame = AgoraVideoFrame().apply {
            format = AgoraVideoFrame.FORMAT_NV21  // NV21 is standard Android camera format
            this.buf = buffer
            this.stride = width
            this.height = height
            this.rotation = rotation
            this.timeStamp = timestampMs
        }

        val success = engine.pushExternalVideoFrame(frame)

        // Log periodically (every 5 seconds) for monitoring
        pushFrameCount++
        val now = System.currentTimeMillis()
        if (now - lastPushLogTime > 5000) {
            Log.d(TAG, "Streaming: pushed $pushFrameCount frames, latest ${width}x${height}")
            lastPushLogTime = now
        }

        return success
    }

    /**
     * Check if currently streaming.
     */
    fun isStreaming(): Boolean = currentSession != null

    /**
     * Get the current session info.
     */
    fun getCurrentSession(): StreamSession? = currentSession

    /**
     * Get the current viewer count.
     */
    fun getViewerCount(): Int = viewerCount

    /**
     * Release all resources.
     */
    fun destroy() {
        Log.d(TAG, "Destroying AgoraStreamManager")
        stopStream()
        networkExecutor.shutdown()
        RtcEngine.destroy()
        rtcEngine = null
    }

    /**
     * Agora RTC event handler for connection and viewer events.
     */
    private val rtcEventHandler = object : IRtcEngineEventHandler() {

        override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
            Log.d(TAG, "Joined channel successfully: $channel, uid: $uid")
        }

        override fun onLeaveChannel(stats: RtcStats?) {
            Log.d(TAG, "Left channel")
        }

        override fun onUserJoined(uid: Int, elapsed: Int) {
            Log.d(TAG, "Viewer joined: uid=$uid")
            viewerCount++
            val viewerInfo = ViewerInfo(uid = uid)
            viewers[uid] = viewerInfo
            onViewerUpdate(viewerCount, viewerInfo)
        }

        override fun onUserOffline(uid: Int, reason: Int) {
            val reasonStr = when (reason) {
                Constants.USER_OFFLINE_QUIT -> "quit"
                Constants.USER_OFFLINE_DROPPED -> "dropped"
                else -> "unknown"
            }
            Log.d(TAG, "Viewer left: uid=$uid, reason=$reasonStr")

            viewerCount = maxOf(0, viewerCount - 1)
            viewers.remove(uid)
            onViewerUpdate(viewerCount, null)
        }

        override fun onRemoteAudioStateChanged(
            uid: Int,
            state: Int,
            reason: Int,
            elapsed: Int
        ) {
            // Track when viewer is speaking (unmuted their mic)
            val isSpeaking = state == Constants.REMOTE_AUDIO_STATE_DECODING
            viewers[uid]?.let { viewer ->
                val updatedViewer = viewer.copy(isSpeaking = isSpeaking)
                viewers[uid] = updatedViewer
                onViewerUpdate(viewerCount, updatedViewer)
            }
        }

        override fun onError(err: Int) {
            val errorMsg = when (err) {
                Constants.ERR_INVALID_TOKEN -> "Invalid token"
                Constants.ERR_TOKEN_EXPIRED -> "Token expired"
                Constants.ERR_NOT_INITIALIZED -> "Engine not initialized"
                Constants.ERR_INVALID_CHANNEL_NAME -> "Invalid channel name"
                else -> "Error code: $err"
            }
            Log.e(TAG, "Agora error: $errorMsg")
            onStreamError(errorMsg)
        }

        override fun onConnectionStateChanged(state: Int, reason: Int) {
            val stateStr = when (state) {
                Constants.CONNECTION_STATE_DISCONNECTED -> "DISCONNECTED"
                Constants.CONNECTION_STATE_CONNECTING -> "CONNECTING"
                Constants.CONNECTION_STATE_CONNECTED -> "CONNECTED"
                Constants.CONNECTION_STATE_RECONNECTING -> "RECONNECTING"
                Constants.CONNECTION_STATE_FAILED -> "FAILED"
                else -> "UNKNOWN"
            }
            Log.d(TAG, "Connection state: $stateStr, reason: $reason")

            if (state == Constants.CONNECTION_STATE_FAILED) {
                onStreamError("Connection failed")
            }
        }

        override fun onNetworkQuality(uid: Int, txQuality: Int, rxQuality: Int) {
            // Could emit network quality events for UI feedback
            // Quality ranges from 0 (unknown) to 5 (very bad)
            if (txQuality > 3) {
                Log.w(TAG, "Poor network quality: tx=$txQuality")
            }
        }
    }
}
