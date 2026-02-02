package expo.modules.xrglasses

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import kotlinx.coroutines.CoroutineExceptionHandler
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Native Error Handler for capturing uncaught exceptions in Kotlin/Android.
 * Forwards errors to JS layer via broadcast for Discord reporting.
 */
object NativeErrorHandler {
    private const val TAG = "NativeErrorHandler"

    // Broadcast action for native errors
    const val ACTION_NATIVE_ERROR = "expo.modules.xrglasses.NATIVE_ERROR"
    const val EXTRA_ERROR_MESSAGE = "error_message"
    const val EXTRA_ERROR_STACK = "error_stack"
    const val EXTRA_IS_FATAL = "is_fatal"
    const val EXTRA_THREAD_NAME = "thread_name"

    private var originalHandler: Thread.UncaughtExceptionHandler? = null
    private var isInitialized = false
    private var appContext: Context? = null

    /**
     * Initialize the native error handler.
     * Call this once from Application.onCreate() or Module.initialize()
     */
    fun initialize(context: Context) {
        if (isInitialized) {
            Log.d(TAG, "Already initialized")
            return
        }

        appContext = context.applicationContext

        // Store original handler
        originalHandler = Thread.getDefaultUncaughtExceptionHandler()

        // Set our custom handler
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "Uncaught exception in thread ${thread.name}", throwable)

            // Send error to JS via broadcast
            sendErrorBroadcast(
                message = throwable.message ?: "Unknown native error",
                stackTrace = getStackTraceString(throwable),
                isFatal = true,
                threadName = thread.name
            )

            // Call original handler to ensure proper crash handling
            originalHandler?.uncaughtException(thread, throwable)
        }

        isInitialized = true
        Log.d(TAG, "Native error handler initialized")
    }

    /**
     * Coroutine exception handler for use with coroutine scopes.
     * Use this when creating CoroutineScope:
     *
     * val scope = CoroutineScope(Dispatchers.Main + SupervisorJob() + NativeErrorHandler.coroutineExceptionHandler)
     */
    val coroutineExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        Log.e(TAG, "Uncaught coroutine exception", throwable)

        sendErrorBroadcast(
            message = throwable.message ?: "Unknown coroutine error",
            stackTrace = getStackTraceString(throwable),
            isFatal = false, // Coroutine exceptions are typically non-fatal
            threadName = "coroutine"
        )
    }

    /**
     * Manually report a non-fatal error.
     * Use this for caught exceptions that should still be reported.
     */
    fun reportError(throwable: Throwable, context: String? = null) {
        val message = if (context != null) {
            "$context: ${throwable.message}"
        } else {
            throwable.message ?: "Unknown error"
        }

        Log.e(TAG, "Reported error: $message", throwable)

        sendErrorBroadcast(
            message = message,
            stackTrace = getStackTraceString(throwable),
            isFatal = false,
            threadName = Thread.currentThread().name
        )
    }

    /**
     * Manually report an error with a custom message.
     */
    fun reportError(message: String, isFatal: Boolean = false) {
        Log.e(TAG, "Reported error: $message")

        sendErrorBroadcast(
            message = message,
            stackTrace = "No stack trace available",
            isFatal = isFatal,
            threadName = Thread.currentThread().name
        )
    }

    private fun sendErrorBroadcast(
        message: String,
        stackTrace: String,
        isFatal: Boolean,
        threadName: String
    ) {
        val context = appContext ?: run {
            Log.e(TAG, "Cannot send error broadcast: context not initialized")
            return
        }

        try {
            val intent = Intent(ACTION_NATIVE_ERROR).apply {
                putExtra(EXTRA_ERROR_MESSAGE, message)
                putExtra(EXTRA_ERROR_STACK, stackTrace)
                putExtra(EXTRA_IS_FATAL, isFatal)
                putExtra(EXTRA_THREAD_NAME, threadName)
                // Add device info for debugging
                putExtra("device_model", Build.MODEL)
                putExtra("android_version", Build.VERSION.SDK_INT)
                setPackage(context.packageName)
            }

            context.sendBroadcast(intent)
            Log.d(TAG, "Error broadcast sent: $message")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send error broadcast", e)
        }
    }

    private fun getStackTraceString(throwable: Throwable): String {
        return try {
            val sw = StringWriter()
            val pw = PrintWriter(sw)
            throwable.printStackTrace(pw)
            sw.toString()
        } catch (e: Exception) {
            "Failed to get stack trace: ${e.message}"
        }
    }
}
