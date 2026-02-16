package expo.modules.xrglasses.stream

import android.content.Context
import android.util.Log
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig
import io.agora.rtc2.video.AgoraVideoFrame
import io.agora.rtc2.video.VideoEncoderConfiguration
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * AgoraStreamManager - Manages Agora RTC engine for Remote View streaming.
 *
 * This class runs in the MAIN PROCESS and handles all Agora SDK interactions.
 * Key responsibilities:
 * - Initialize and configure RtcEngine with low-latency settings
 * - Manage streaming sessions (start/stop)
 * - Push video frames from camera to Agora
 * - Track connected viewers
 *
 * NOTE: This runs in the main process because StreamingCameraManager needs
 * ProjectedContext to access the glasses camera, which only works from the main process.
 * Video frames are pushed directly without IPC overhead since both are in the same process.
 *
 * Thread Safety: This class is thread-safe. Event handlers from Agora SDK run on
 * background threads, while public methods may be called from the main thread.
 */
class AgoraStreamManager(
    private val context: Context,
    private val appId: String,
    private val onStreamStarted: (StreamSession) -> Unit,
    private val onStreamStopped: () -> Unit,
    private val onStreamError: (String) -> Unit,
    private val onViewerUpdate: (Int, ViewerInfo?) -> Unit,
) {
    companion object {
        private const val TAG = "AgoraStreamManager"
        private const val HOST_UID = 0 // 0 = auto-assign UID

        // Network timeouts
        private const val CONNECT_TIMEOUT_MS = 10000
        private const val READ_TIMEOUT_MS = 10000
        private const val TOKEN_FETCH_TIMEOUT_SECONDS = 15L

        // Video encoding
        private const val MIN_BITRATE_KBPS = 200 // Floor to prevent unwatchable quality

        // Logging intervals
        private const val LOG_INTERVAL_MS = 5000L
        private const val DROPPED_FRAME_LOG_INTERVAL = 30

        // URLs loaded from BuildConfig (set via .env file)
        private val VIEWER_URL_BASE: String by lazy {
            try {
                val buildConfigClass = Class.forName("com.xrglasses.app.BuildConfig")
                val field = buildConfigClass.getField("SPEX_VIEWER_URL_BASE")
                field.get(null) as? String ?: "https://REDACTED_VIEWER_URL/view/"
            } catch (e: Exception) {
                "https://REDACTED_VIEWER_URL/view/"
            }
        }

        private val TOKEN_SERVER_URL: String by lazy {
            try {
                val buildConfigClass = Class.forName("com.xrglasses.app.BuildConfig")
                val field = buildConfigClass.getField("AGORA_TOKEN_SERVER_URL")
                field.get(null) as? String ?: "https://REDACTED_TOKEN_SERVER/"
            } catch (e: Exception) {
                "https://REDACTED_TOKEN_SERVER/"
            }
        }
    }

    @Volatile private var rtcEngine: RtcEngine? = null
    private val currentSessionRef = AtomicReference<StreamSession?>(null)
    private val viewerCountAtomic = AtomicInteger(0)
    private val viewers = ConcurrentHashMap<Int, ViewerInfo>()

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
            val appContext =
                try {
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

        // Enable audio (for glasses mic via Bluetooth)
        // When glasses are connected as Bluetooth audio device, audio routes automatically
        engine.enableAudio()

        // Disable speakerphone to prefer Bluetooth/headset over phone speaker
        // This makes Agora use Bluetooth headset (glasses) if connected
        engine.setEnableSpeakerphone(false)
        Log.d(TAG, "Audio enabled - speakerphone disabled to prefer Bluetooth headset (glasses)")

        // Configure external video source (buffer mode for NV21 frames from CameraX)
        // useTexture = false because we're pushing raw NV21 byte buffers, not GPU textures
        // Configure external video source (useTexture = false for NV21 buffer mode)
        engine.setExternalVideoSource(
            true,
            false,
            Constants.ExternalVideoSourceType.VIDEO_FRAME,
        )

        // Minimize playout delay (buffering)
        engine.setParameters("{\"rtc.video.playout_delay_min\":0}")
        engine.setParameters("{\"rtc.video.playout_delay_max\":100}")

        // Enable hardware encoding
        engine.setParameters("{\"che.hardware_encoding\":1}")
        engine.setParameters("{\"che.video.videoCodecIndex\":2}") // H.264

        // Optimize for low latency
        engine.setParameters("{\"rtc.video.lowlatency\":1}")

        Log.d(TAG, "Low-latency settings applied")
    }

    /**
     * Fetch an Agora token from the Cloudflare Worker token server.
     * This method runs network I/O on a background thread.
     */
    private fun fetchToken(
        channelId: String,
        role: String = "publisher",
    ): String? {
        return try {
            // Run network call on background thread to avoid NetworkOnMainThreadException
            val future =
                networkExecutor.submit<String?> {
                    try {
                        val url = URL("$TOKEN_SERVER_URL?channel=$channelId&role=$role")
                        val connection = url.openConnection() as HttpURLConnection
                        connection.requestMethod = "GET"
                        connection.connectTimeout = CONNECT_TIMEOUT_MS
                        connection.readTimeout = READ_TIMEOUT_MS

                        // Add API key for worker authentication
                        val apiKey = try {
                            val buildConfigClass = Class.forName("com.xrglasses.app.BuildConfig")
                            val field = buildConfigClass.getField("WORKER_API_KEY")
                            field.get(null) as? String ?: ""
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to read WORKER_API_KEY from BuildConfig", e)
                            ""
                        }
                        Log.d(TAG, "fetchToken: apiKey length=${apiKey.length}, empty=${apiKey.isEmpty()}")
                        if (apiKey.isNotEmpty()) {
                            connection.setRequestProperty("X-API-Key", apiKey)
                        }

                        val responseCode = connection.responseCode
                        Log.d(TAG, "fetchToken: HTTP $responseCode")
                        if (responseCode == HttpURLConnection.HTTP_OK) {
                            val response = connection.inputStream.bufferedReader().readText()
                            val json = JSONObject(response)
                            json.getString("token")
                        } else {
                            val errorBody = try {
                                connection.errorStream?.bufferedReader()?.readText() ?: "no body"
                            } catch (_: Exception) { "unreadable" }
                            Log.e(TAG, "Token server error: HTTP $responseCode — $errorBody")
                            null
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to fetch token (inner)", e)
                        null
                    }
                }
            // Wait for result (with timeout)
            future.get(TOKEN_FETCH_TIMEOUT_SECONDS, TimeUnit.SECONDS)
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

        if (currentSessionRef.get() != null) {
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
            val session =
                StreamSession(
                    channelId = channelId,
                    viewerUrl = viewerUrl,
                    quality = quality,
                )
            currentSessionRef.set(session)
            viewerCountAtomic.set(0)
            viewers.clear()

            // Log audio device info
            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> STREAM STARTED - Audio Info:")
            Log.d(TAG, ">>> Audio is ENABLED and will be transmitted")
            Log.d(TAG, ">>> If glasses are connected via Bluetooth,")
            Log.d(TAG, ">>> audio will use glasses mic/speaker")
            Log.d(TAG, ">>> Check onAudioRouteChanged for actual route")
            Log.d(TAG, "========================================")

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

        val frameRate =
            when (quality.fps) {
                15 -> VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_15
                30 -> VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_30
                else -> VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_15
            }

        val config =
            VideoEncoderConfiguration(
                VideoEncoderConfiguration.VideoDimensions(quality.width, quality.height),
                frameRate,
                quality.bitrate,
                VideoEncoderConfiguration.ORIENTATION_MODE.ORIENTATION_MODE_FIXED_PORTRAIT,
            ).apply {
                minBitrate = MIN_BITRATE_KBPS
            }

        engine.setVideoEncoderConfiguration(config)
        Log.d(
            TAG,
            "Applied quality preset: ${quality.displayName} (${quality.width}x${quality.height} @ ${quality.fps}fps, ${quality.bitrate}kbps)",
        )
    }

    /**
     * Stop the current stream.
     */
    fun stopStream() {
        Log.d(TAG, "Stopping stream...")

        rtcEngine?.leaveChannel()
        currentSessionRef.set(null)
        viewerCountAtomic.set(0)
        viewers.clear()

        onStreamStopped()
        Log.d(TAG, "Stream stopped")
    }

    /**
     * Update quality while streaming.
     */
    fun setQuality(quality: StreamQuality) {
        val session = currentSessionRef.get()
        if (session == null) {
            Log.w(TAG, "No active stream to update quality")
            return
        }

        applyQualityPreset(quality)
        currentSessionRef.set(session.copy(quality = quality))
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
        timestampMs: Long,
    ): Boolean {
        val engine = rtcEngine ?: return false
        if (currentSessionRef.get() == null) return false

        val frame =
            AgoraVideoFrame().apply {
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

    // Frame counter for periodic logging - accessed from multiple threads
    @Volatile private var pushFrameCount = 0

    @Volatile private var pushFailCount = 0

    @Volatile private var lastPushLogTime = 0L

    @Volatile private var droppedBeforeSessionCount = 0

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
        timestampMs: Long,
    ): Boolean {
        val engine = rtcEngine
        if (engine == null) {
            Log.w(TAG, "Cannot push frame - RTC engine is null")
            return false
        }
        if (currentSessionRef.get() == null) {
            droppedBeforeSessionCount++
            // Only log occasionally to avoid spam
            if (droppedBeforeSessionCount == 1 || droppedBeforeSessionCount % DROPPED_FRAME_LOG_INTERVAL == 0) {
                Log.w(TAG, "Frame dropped - session not ready yet (dropped: $droppedBeforeSessionCount)")
            }
            return false
        }

        val frame =
            AgoraVideoFrame().apply {
                format = AgoraVideoFrame.FORMAT_NV21 // NV21 is standard Android camera format
                this.buf = buffer
                this.stride = width
                this.height = height
                this.rotation = rotation
                this.timeStamp = timestampMs
            }

        val success = engine.pushExternalVideoFrame(frame)

        if (success) {
            pushFrameCount++
        } else {
            pushFailCount++
        }

        // Log periodically for monitoring
        val now = System.currentTimeMillis()
        if (now - lastPushLogTime > LOG_INTERVAL_MS) {
            Log.d(
                TAG,
                "Streaming: pushed $pushFrameCount frames " +
                    "(failed: $pushFailCount, dropped: $droppedBeforeSessionCount), " +
                    "latest ${width}x$height",
            )
            lastPushLogTime = now
        }

        return success
    }

    /**
     * Check if the session is ready for receiving frames.
     */
    fun isSessionReady(): Boolean = currentSessionRef.get() != null

    /**
     * Check if currently streaming.
     */
    fun isStreaming(): Boolean = currentSessionRef.get() != null

    /**
     * Get the current session info.
     */
    fun getCurrentSession(): StreamSession? = currentSessionRef.get()

    /**
     * Get the current viewer count.
     */
    fun getViewerCount(): Int = viewerCountAtomic.get()

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
    private val rtcEventHandler =
        object : IRtcEngineEventHandler() {
            override fun onJoinChannelSuccess(
                channel: String?,
                uid: Int,
                elapsed: Int,
            ) {
                Log.d(TAG, "Joined channel successfully: $channel, uid: $uid")
            }

            override fun onAudioRouteChanged(routing: Int) {
                // Audio route constants (using raw values for compatibility)
                val routeName =
                    when (routing) {
                        -1 -> "DEFAULT"
                        0 -> "HEADSET (wired)"
                        1 -> "EARPIECE"
                        2 -> "HEADSET_NO_MIC"
                        3 -> "SPEAKERPHONE"
                        4 -> "LOUDSPEAKER"
                        5 -> "BLUETOOTH HEADSET" // This is what glasses should use!
                        6 -> "USB"
                        7 -> "HDMI"
                        8 -> "DISPLAYPORT"
                        9 -> "AIRPLAY"
                        else -> "UNKNOWN ($routing)"
                    }
                Log.d(TAG, "========================================")
                Log.d(TAG, ">>> AUDIO ROUTE CHANGED: $routeName")
                if (routing == 5) {
                    Log.d(TAG, ">>> BLUETOOTH AUDIO ACTIVE - Using glasses mic/speaker!")
                }
                Log.d(TAG, "========================================")
            }

            override fun onLeaveChannel(stats: RtcStats?) {
                Log.d(TAG, "Left channel")
            }

            override fun onUserJoined(
                uid: Int,
                elapsed: Int,
            ) {
                Log.d(TAG, "Viewer joined: uid=$uid")
                val newCount = viewerCountAtomic.incrementAndGet()
                val viewerInfo = ViewerInfo(uid = uid)
                viewers[uid] = viewerInfo
                onViewerUpdate(newCount, viewerInfo)
            }

            override fun onUserOffline(
                uid: Int,
                reason: Int,
            ) {
                val reasonStr =
                    when (reason) {
                        Constants.USER_OFFLINE_QUIT -> "quit"
                        Constants.USER_OFFLINE_DROPPED -> "dropped"
                        else -> "unknown"
                    }
                Log.d(TAG, "Viewer left: uid=$uid, reason=$reasonStr")

                val newCount = viewerCountAtomic.updateAndGet { count -> maxOf(0, count - 1) }
                viewers.remove(uid)
                onViewerUpdate(newCount, null)
            }

            override fun onRemoteAudioStateChanged(
                uid: Int,
                state: Int,
                reason: Int,
                elapsed: Int,
            ) {
                // Track when viewer is speaking (unmuted their mic)
                val isSpeaking = state == Constants.REMOTE_AUDIO_STATE_DECODING
                viewers[uid]?.let { viewer ->
                    val updatedViewer = viewer.copy(isSpeaking = isSpeaking)
                    viewers[uid] = updatedViewer
                    onViewerUpdate(viewerCountAtomic.get(), updatedViewer)
                }
            }

            override fun onRemoteVideoStateChanged(
                uid: Int,
                state: Int,
                reason: Int,
                elapsed: Int,
            ) {
                // Track when viewer is streaming video (enabled their camera)
                val isStreaming = state == Constants.REMOTE_VIDEO_STATE_DECODING
                Log.d(TAG, ">>> REMOTE VIDEO STATE: uid=$uid, streaming=$isStreaming, state=$state")
                viewers[uid]?.let { viewer ->
                    val updatedViewer = viewer.copy(isStreaming = isStreaming)
                    viewers[uid] = updatedViewer
                    onViewerUpdate(viewerCountAtomic.get(), updatedViewer)
                }
            }

            override fun onError(err: Int) {
                val errorMsg =
                    when (err) {
                        Constants.ERR_INVALID_TOKEN -> "Invalid token"
                        Constants.ERR_TOKEN_EXPIRED -> "Token expired"
                        Constants.ERR_NOT_INITIALIZED -> "Engine not initialized"
                        Constants.ERR_INVALID_CHANNEL_NAME -> "Invalid channel name"
                        else -> "Error code: $err"
                    }
                Log.e(TAG, "Agora error: $errorMsg")
                onStreamError(errorMsg)
            }

            override fun onConnectionStateChanged(
                state: Int,
                reason: Int,
            ) {
                val stateStr =
                    when (state) {
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

            override fun onNetworkQuality(
                uid: Int,
                txQuality: Int,
                rxQuality: Int,
            ) {
                // Could emit network quality events for UI feedback
                // Quality ranges from 0 (unknown) to 5 (very bad)
                if (txQuality > 3) {
                    Log.w(TAG, "Poor network quality: tx=$txQuality")
                }
            }
        }
}
