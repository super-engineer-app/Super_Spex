package expo.modules.xrglasses

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.xrglasses.glasses.GlassesActivity

/**
 * GlassesBroadcastReceiver - Receives broadcasts from GlassesActivity running on glasses.
 *
 * This receiver runs on the phone and forwards speech recognition events from the
 * glasses to the XRGlassesModule, which then emits them to React Native.
 *
 * Note: Remote View streaming events are NOT handled here - they are emitted
 * directly from XRGlassesService in the main process.
 */
class GlassesBroadcastReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "GlassesBroadcastReceiver"

        /**
         * Callback to forward events to XRGlassesModule.
         * Set by XRGlassesModule during initialization.
         */
        var moduleCallback: ((eventName: String, data: Map<String, Any?>) -> Unit)? = null

        /**
         * Callback to forward speech events to XRGlassesService for glasses-first ASR routing.
         * Set by XRGlassesModule during initialization.
         */
        var serviceCallback: ((eventName: String, data: Map<String, Any?>) -> Unit)? = null
    }

    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        Log.d(TAG, "Received broadcast: ${intent.action}")

        val callback = moduleCallback
        if (callback == null) {
            Log.w(TAG, "No module callback registered, dropping event")
            return
        }

        when (intent.action) {
            GlassesActivity.ACTION_SPEECH_RESULT -> {
                val text = intent.getStringExtra(GlassesActivity.EXTRA_TEXT) ?: ""
                val confidence = intent.getFloatExtra(GlassesActivity.EXTRA_CONFIDENCE, 0f)

                Log.d(TAG, "Speech result: '$text' (confidence: $confidence)")

                callback(
                    "onSpeechResult",
                    mapOf(
                        "text" to text,
                        "confidence" to confidence,
                        "isFinal" to true,
                        "timestamp" to System.currentTimeMillis(),
                    ),
                )
            }

            GlassesActivity.ACTION_SPEECH_PARTIAL -> {
                val text = intent.getStringExtra(GlassesActivity.EXTRA_TEXT) ?: ""

                Log.d(TAG, "Partial result: '$text'")

                callback(
                    "onPartialResult",
                    mapOf(
                        "text" to text,
                        "isFinal" to false,
                        "timestamp" to System.currentTimeMillis(),
                    ),
                )
            }

            GlassesActivity.ACTION_SPEECH_ERROR -> {
                val code = intent.getIntExtra(GlassesActivity.EXTRA_ERROR_CODE, -1)
                val message = intent.getStringExtra(GlassesActivity.EXTRA_ERROR_MESSAGE) ?: "Unknown error"

                Log.e(TAG, "Speech error: $message (code: $code)")

                val data =
                    mapOf<String, Any?>(
                        "code" to code,
                        "message" to message,
                        "timestamp" to System.currentTimeMillis(),
                    )
                callback("onSpeechError", data)
                serviceCallback?.invoke("onSpeechError", data)
            }

            GlassesActivity.ACTION_SPEECH_STATE -> {
                val isListening = intent.getBooleanExtra(GlassesActivity.EXTRA_IS_LISTENING, false)

                Log.d(TAG, "Speech state changed: isListening=$isListening")

                val data =
                    mapOf<String, Any?>(
                        "isListening" to isListening,
                        "timestamp" to System.currentTimeMillis(),
                    )
                callback("onSpeechStateChanged", data)
                serviceCallback?.invoke("onSpeechStateChanged", data)
            }

            NativeErrorHandler.ACTION_NATIVE_ERROR -> {
                val message = intent.getStringExtra(NativeErrorHandler.EXTRA_ERROR_MESSAGE) ?: "Unknown native error"
                val stackTrace = intent.getStringExtra(NativeErrorHandler.EXTRA_ERROR_STACK) ?: ""
                val isFatal = intent.getBooleanExtra(NativeErrorHandler.EXTRA_IS_FATAL, false)
                val threadName = intent.getStringExtra(NativeErrorHandler.EXTRA_THREAD_NAME) ?: "unknown"
                val deviceModel = intent.getStringExtra("device_model") ?: ""
                val androidVersion = intent.getIntExtra("android_version", 0)

                Log.e(TAG, "Native error: $message (fatal: $isFatal, thread: $threadName)")

                callback(
                    "onNativeError",
                    mapOf(
                        "message" to message,
                        "stackTrace" to stackTrace,
                        "isFatal" to isFatal,
                        "threadName" to threadName,
                        "deviceModel" to deviceModel,
                        "androidVersion" to androidVersion,
                        "timestamp" to System.currentTimeMillis(),
                    ),
                )
            }

            else -> {
                Log.w(TAG, "Unknown action: ${intent.action}")
            }
        }
    }
}
