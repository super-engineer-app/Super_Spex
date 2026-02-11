package expo.modules.xrglasses

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * NetworkSpeechRecognizer - Fallback speech recognizer that uses the network transcription API.
 *
 * When Android's built-in SpeechRecognizer is unavailable (e.g. on emulators without Google
 * services), this class provides speech recognition by:
 * 1. Recording 3-second audio chunks as WebM/Opus via MediaRecorder
 * 2. POSTing each chunk to the /transcribe-dia endpoint
 * 3. Parsing the response and emitting speech events through the module
 *
 * Uses the same audio format (WebM/Opus, 16kHz, 64kbps) and HTTP multipart pattern as
 * VideoRecordingManager and XRGlassesService.sendRecordingForTranscription().
 */
class NetworkSpeechRecognizer(
    private val context: Context,
    private val module: XRGlassesModule,
) {
    companion object {
        private const val TAG = "NetworkSpeechRecognizer"
        private const val CHUNK_DURATION_MS = 3000L
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var audioRecorder: MediaRecorder? = null
    private var currentChunkFile: File? = null
    private var isListening = false
    private var continuousMode = false
    private var chunkJob: Job? = null
    private var chunkIndex = 0

    // Transcription API URL (loaded from BuildConfig via reflection)
    private val transcriptionApiUrl: String? by lazy {
        try {
            val buildConfigClass = Class.forName("com.xrglasses.app.BuildConfig")
            val field = buildConfigClass.getField("TRANSCRIPTION_API_URL")
            val value = field.get(null) as? String
            if (value.isNullOrBlank()) null else value
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get TRANSCRIPTION_API_URL: ${e.message}")
            null
        }
    }

    /**
     * Check if network speech recognition is available.
     * Requires RECORD_AUDIO permission and a configured transcription API URL.
     */
    fun isAvailable(): Boolean {
        val hasPermission =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO,
            ) == PackageManager.PERMISSION_GRANTED
        val hasUrl = !transcriptionApiUrl.isNullOrBlank()
        Log.d(TAG, "isAvailable: permission=$hasPermission, hasUrl=$hasUrl")
        return hasPermission && hasUrl
    }

    /**
     * Start recording and transcribing speech.
     */
    fun start(continuous: Boolean) {
        if (isListening) {
            Log.w(TAG, "Already listening")
            return
        }

        continuousMode = continuous
        isListening = true
        chunkIndex = 0

        Log.d(TAG, "Starting network speech recognition (continuous=$continuous)")

        module.emitEvent(
            "onSpeechStateChanged",
            mapOf(
                "isListening" to true,
                "timestamp" to System.currentTimeMillis(),
            ),
        )

        startNextChunk()
    }

    /**
     * Stop recording and transcribing.
     */
    fun stop() {
        if (!isListening) return

        Log.d(TAG, "Stopping network speech recognition")
        isListening = false
        continuousMode = false
        chunkJob?.cancel()
        chunkJob = null
        stopRecorder()

        module.emitEvent(
            "onSpeechStateChanged",
            mapOf(
                "isListening" to false,
                "timestamp" to System.currentTimeMillis(),
            ),
        )
    }

    /**
     * Release all resources.
     */
    fun release() {
        stop()
        scope.cancel()
    }

    /**
     * Start recording the next audio chunk.
     */
    private fun startNextChunk() {
        if (!isListening) return

        chunkJob =
            scope.launch {
                try {
                    val chunkFile = startRecording()
                    if (chunkFile == null) {
                        emitError("Failed to start audio recording")
                        return@launch
                    }

                    // Wait for chunk duration
                    delay(CHUNK_DURATION_MS)

                    // Stop recording this chunk
                    stopRecorder()
                    val file = currentChunkFile ?: return@launch
                    currentChunkFile = null

                    // Start next chunk immediately if continuous (overlaps with HTTP request)
                    if (isListening && continuousMode) {
                        startNextChunk()
                    }

                    // Send for transcription on IO thread
                    val text = sendChunkForTranscription(file)

                    // Clean up chunk file
                    file.delete()

                    if (!text.isNullOrBlank()) {
                        module.emitEvent(
                            "onSpeechResult",
                            mapOf(
                                "text" to text,
                                "confidence" to 0.9,
                                "isFinal" to true,
                                "timestamp" to System.currentTimeMillis(),
                            ),
                        )
                    }

                    // If single-shot mode, stop after first result
                    if (!continuousMode && isListening) {
                        stop()
                    }
                } catch (e: CancellationException) {
                    // Normal cancellation, ignore
                } catch (e: Exception) {
                    Log.e(TAG, "Chunk processing error: ${e.message}", e)
                    emitError("Speech recognition error: ${e.message}")
                    // Continue listening in continuous mode despite errors
                    if (isListening && continuousMode) {
                        delay(1000) // Brief backoff
                        startNextChunk()
                    }
                }
            }
    }

    /**
     * Start a MediaRecorder for a single audio chunk.
     */
    @Suppress("MissingPermission") // Permission checked in isAvailable()
    private fun startRecording(): File? {
        try {
            val timestamp = System.currentTimeMillis()
            val file = File(context.cacheDir, "speech-chunk-$timestamp-$chunkIndex.webm")
            chunkIndex++

            val recorder =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    MediaRecorder(context)
                } else {
                    @Suppress("DEPRECATION")
                    MediaRecorder()
                }

            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.WEBM)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
            recorder.setAudioEncodingBitRate(64_000)
            recorder.setAudioSamplingRate(16_000)
            recorder.setOutputFile(file.absolutePath)

            recorder.prepare()
            recorder.start()

            audioRecorder = recorder
            currentChunkFile = file
            Log.d(TAG, "Recording chunk: ${file.name}")
            return file
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording: ${e.message}", e)
            return null
        }
    }

    /**
     * Stop the current MediaRecorder.
     */
    private fun stopRecorder() {
        val recorder = audioRecorder ?: return
        try {
            recorder.stop()
            recorder.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recorder: ${e.message}", e)
            try {
                recorder.release()
            } catch (releaseError: Exception) {
                Log.e(TAG, "Error releasing recorder: ${releaseError.message}", releaseError)
            }
        } finally {
            audioRecorder = null
        }
    }

    /**
     * Send an audio chunk to the transcription API and return the transcribed text.
     */
    private suspend fun sendChunkForTranscription(file: File): String? =
        withContext(Dispatchers.IO) {
            val baseUrl = transcriptionApiUrl ?: return@withContext null

            if (!file.exists() || file.length() == 0L) {
                Log.w(TAG, "Chunk file is empty or missing: ${file.name}")
                return@withContext null
            }

            Log.d(TAG, "Sending chunk for transcription: ${file.name} (${file.length()} bytes)")

            val url = URL("$baseUrl/transcribe-dia")
            val boundary = "----SpexSpeechBoundary${System.currentTimeMillis()}"

            val connection = url.openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                connection.doOutput = true
                connection.connectTimeout = 10_000
                connection.readTimeout = 15_000

                val outputStream: OutputStream = connection.outputStream

                // user_id field
                outputStream.write("--$boundary\r\n".toByteArray())
                outputStream.write("Content-Disposition: form-data; name=\"user_id\"\r\n\r\n".toByteArray())
                outputStream.write("mobile-app\r\n".toByteArray())

                // language field
                outputStream.write("--$boundary\r\n".toByteArray())
                outputStream.write("Content-Disposition: form-data; name=\"language\"\r\n\r\n".toByteArray())
                outputStream.write("en\r\n".toByteArray())

                // audio file field
                outputStream.write("--$boundary\r\n".toByteArray())
                outputStream.write(
                    "Content-Disposition: form-data; name=\"audio\"; filename=\"${file.name}\"\r\n".toByteArray(),
                )
                outputStream.write("Content-Type: audio/webm\r\n\r\n".toByteArray())

                file.inputStream().use { inputStream ->
                    inputStream.copyTo(outputStream)
                }

                outputStream.write("\r\n--$boundary--\r\n".toByteArray())
                outputStream.flush()
                outputStream.close()

                val responseCode = connection.responseCode
                if (responseCode != 200) {
                    val errorBody = connection.errorStream?.bufferedReader()?.readText() ?: "Unknown error"
                    Log.e(TAG, "Transcription failed (HTTP $responseCode): $errorBody")
                    return@withContext null
                }

                val responseBody = connection.inputStream.bufferedReader().readText()
                Log.d(TAG, "Transcription response: ${responseBody.take(200)}")

                // Parse { "segments": [{ "text": "..." }] }
                parseTranscriptionText(responseBody)
            } catch (e: Exception) {
                Log.e(TAG, "HTTP request failed: ${e.message}", e)
                null
            } finally {
                connection.disconnect()
            }
        }

    /**
     * Extract concatenated text from transcription response segments.
     */
    private fun parseTranscriptionText(json: String): String? {
        return try {
            val jsonObj = org.json.JSONObject(json)
            val segmentsArray = jsonObj.optJSONArray("segments") ?: return null

            val textParts = mutableListOf<String>()
            for (i in 0 until segmentsArray.length()) {
                val segment = segmentsArray.getJSONObject(i)
                val text = segment.optString("text", "").trim()
                if (text.isNotEmpty()) {
                    textParts.add(text)
                }
            }

            val combined = textParts.joinToString(" ")
            if (combined.isBlank()) null else combined
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse transcription: ${e.message}", e)
            null
        }
    }

    private fun emitError(message: String) {
        module.emitEvent(
            "onSpeechError",
            mapOf(
                "code" to -1,
                "message" to message,
                "timestamp" to System.currentTimeMillis(),
            ),
        )
    }
}
