package expo.modules.xrglasses

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Events emitted by the recording lifecycle.
 */
sealed class RecordingEvent {
    data object Started : RecordingEvent()

    data class Stopped(val uri: Uri, val durationMs: Long) : RecordingEvent()

    data class Error(val message: String) : RecordingEvent()
}

/**
 * Recording state machine.
 */
enum class RecordingState {
    IDLE,
    PREPARING,
    RECORDING,
    STOPPING,
    STOPPED,
}

/**
 * VideoRecordingManager - Manages CameraX VideoCapture use case lifecycle.
 *
 * Isolated from service logic. Handles creating the VideoCapture use case,
 * starting/stopping recordings, and managing output files.
 *
 * Recordings are saved to the app-private cache directory as MP4 files.
 * The user can then explicitly save/share them via the UI.
 */
class VideoRecordingManager(
    private val context: Context,
) {
    companion object {
        private const val TAG = "VideoRecordingManager"
    }

    private var activeRecording: Recording? = null
    private var outputUri: Uri? = null
    private var outputFile: File? = null
    private var state: RecordingState = RecordingState.IDLE
    private var recordingStartTimeMs: Long = 0

    // Separate audio recorder for WebM/Opus (required by transcription endpoint)
    private var audioRecorder: MediaRecorder? = null
    private var audioOutputFile: File? = null

    /**
     * Build a VideoCapture use case with a Recorder configured for high quality.
     * The returned use case should be bound to CameraX via SharedCameraProvider.
     */
    fun buildVideoCapture(): VideoCapture<Recorder> {
        Log.d(TAG, "Building VideoCapture use case")

        val recorder =
            Recorder.Builder()
                .setQualitySelector(QualitySelector.from(Quality.HD))
                .build()

        return VideoCapture.withOutput(recorder)
    }

    /**
     * Start recording video using the provided VideoCapture use case.
     *
     * @param videoCapture The CameraX VideoCapture use case (must be bound to camera)
     * @param audioEnabled Whether to record audio (requires RECORD_AUDIO permission)
     * @param onEvent Callback for recording lifecycle events
     */
    fun startRecording(
        videoCapture: VideoCapture<Recorder>,
        audioEnabled: Boolean,
        onEvent: (RecordingEvent) -> Unit,
    ) {
        if (state == RecordingState.RECORDING || state == RecordingState.STOPPING) {
            Log.w(TAG, "Cannot start recording in state: $state")
            onEvent(RecordingEvent.Error("Recording already in progress"))
            return
        }

        state = RecordingState.PREPARING

        // Create output file in app cache directory
        val timestamp = System.currentTimeMillis()
        val file = File(context.cacheDir, "spex-recording-$timestamp.mp4")
        outputFile = file

        Log.d(TAG, "Starting recording to: ${file.absolutePath}")

        val fileOutputOptions = FileOutputOptions.Builder(file).build()

        val pendingRecording =
            videoCapture.output
                .prepareRecording(context, fileOutputOptions)

        // Enable audio if requested and permission is granted
        if (audioEnabled) {
            val hasAudioPermission =
                ContextCompat.checkSelfPermission(
                    context, Manifest.permission.RECORD_AUDIO,
                ) == PackageManager.PERMISSION_GRANTED

            if (hasAudioPermission) {
                pendingRecording.withAudioEnabled()
                Log.d(TAG, "Audio recording enabled")
            } else {
                Log.w(TAG, "RECORD_AUDIO permission not granted, recording video only")
            }
        }

        recordingStartTimeMs = System.currentTimeMillis()

        activeRecording =
            pendingRecording.start(
                ContextCompat.getMainExecutor(context),
            ) { event ->
                handleRecordingEvent(event, onEvent)
            }

        // Start separate audio recording as WebM/Opus for transcription
        if (audioEnabled) {
            startAudioRecording()
        }

        state = RecordingState.RECORDING
        onEvent(RecordingEvent.Started)
        Log.d(TAG, "Recording started")
    }

    /**
     * Stop the active recording. The finalize event will provide the output URI.
     */
    fun stopRecording() {
        val recording = activeRecording
        if (recording == null) {
            Log.w(TAG, "No active recording to stop")
            return
        }

        if (state != RecordingState.RECORDING) {
            Log.w(TAG, "Cannot stop recording in state: $state")
            return
        }

        state = RecordingState.STOPPING
        Log.d(TAG, "Stopping recording...")

        // Stop audio recorder first
        stopAudioRecording()

        recording.stop()
    }

    /**
     * Get the URI of the last completed recording.
     */
    fun getOutputUri(): Uri? = outputUri

    /**
     * Get the file path of the last completed recording (MP4 video).
     */
    fun getOutputFilePath(): String? = outputFile?.absolutePath

    /**
     * Get the file path of the separate audio recording (WebM/Opus).
     * This is the file sent to the transcription endpoint.
     */
    fun getAudioFilePath(): String? = audioOutputFile?.absolutePath

    /**
     * Get the current recording state.
     */
    fun getState(): RecordingState = state

    /**
     * Delete the recording output file and reset state to IDLE.
     */
    fun dismiss() {
        Log.d(TAG, "Dismissing recording")

        activeRecording?.stop()
        activeRecording = null

        stopAudioRecording()

        outputFile?.let { file ->
            if (file.exists()) {
                val deleted = file.delete()
                Log.d(TAG, "Deleted video file: $deleted (${file.absolutePath})")
            }
        }
        outputFile = null
        outputUri = null

        audioOutputFile?.let { file ->
            if (file.exists()) {
                val deleted = file.delete()
                Log.d(TAG, "Deleted audio file: $deleted (${file.absolutePath})")
            }
        }
        audioOutputFile = null

        state = RecordingState.IDLE
    }

    /**
     * Release all resources.
     */
    fun release() {
        Log.d(TAG, "Releasing VideoRecordingManager")
        dismiss()
    }

    /**
     * Start a separate MediaRecorder for audio-only WebM/Opus recording.
     * The transcription endpoint requires WebM/Opus format, while CameraX produces MP4.
     * Both recordings run simultaneously: CameraX for video, MediaRecorder for audio.
     */
    @Suppress("MissingPermission") // Permission already checked in startRecording
    private fun startAudioRecording() {
        val hasAudioPermission =
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.RECORD_AUDIO,
            ) == PackageManager.PERMISSION_GRANTED

        if (!hasAudioPermission) {
            Log.w(TAG, "No RECORD_AUDIO permission for separate audio recording")
            return
        }

        try {
            val timestamp = System.currentTimeMillis()
            val audioFile = File(context.cacheDir, "spex-audio-$timestamp.webm")
            audioOutputFile = audioFile

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
            recorder.setAudioSamplingRate(16_000) // 16kHz is good for speech
            recorder.setOutputFile(audioFile.absolutePath)

            recorder.prepare()
            recorder.start()

            audioRecorder = recorder
            Log.d(TAG, "Audio-only WebM/Opus recording started: ${audioFile.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start audio recording (non-fatal): ${e.message}", e)
            // Non-fatal: video recording continues without separate audio track
            audioRecorder = null
            audioOutputFile = null
        }
    }

    /**
     * Stop the separate audio MediaRecorder.
     */
    private fun stopAudioRecording() {
        val recorder = audioRecorder ?: return

        try {
            recorder.stop()
            recorder.release()
            Log.d(TAG, "Audio-only recording stopped: ${audioOutputFile?.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping audio recorder: ${e.message}", e)
            try {
                recorder.release()
            } catch (releaseError: Exception) {
                Log.e(TAG, "Error releasing audio recorder: ${releaseError.message}", releaseError)
            }
        } finally {
            audioRecorder = null
        }
    }

    /**
     * Handle CameraX VideoRecordEvent callbacks.
     */
    private fun handleRecordingEvent(
        event: VideoRecordEvent,
        onEvent: (RecordingEvent) -> Unit,
    ) {
        when (event) {
            is VideoRecordEvent.Start -> {
                Log.d(TAG, "Recording event: Start")
                // Already handled in startRecording
            }
            is VideoRecordEvent.Finalize -> {
                val error = event.error
                if (error != VideoRecordEvent.Finalize.ERROR_NONE) {
                    val errorMsg = "Recording finalize error: code=$error, cause=${event.cause?.message}"
                    Log.e(TAG, errorMsg)
                    state = RecordingState.IDLE
                    activeRecording = null
                    onEvent(RecordingEvent.Error(errorMsg))
                } else {
                    val uri = event.outputResults.outputUri
                    val durationMs = System.currentTimeMillis() - recordingStartTimeMs
                    outputUri = uri
                    state = RecordingState.STOPPED
                    activeRecording = null
                    Log.d(TAG, "Recording finalized: uri=$uri, duration=${durationMs}ms")
                    onEvent(RecordingEvent.Stopped(uri, durationMs))
                }
            }
            is VideoRecordEvent.Status -> {
                // Periodic status updates during recording - can be used for duration tracking
            }
            is VideoRecordEvent.Pause -> {
                Log.d(TAG, "Recording event: Pause")
            }
            is VideoRecordEvent.Resume -> {
                Log.d(TAG, "Recording event: Resume")
            }
        }
    }
}
