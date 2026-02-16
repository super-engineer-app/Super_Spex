/**
 * Error Reporting Service
 *
 * Captures and reports errors via the Cloudflare Worker proxy:
 * - JS uncaught exceptions
 * - Unhandled promise rejections
 * - Native (Kotlin) crashes
 *
 * Errors are sent to /report-error on the Worker (same as web version),
 * which forwards them to Discord. This avoids exposing the webhook URL
 * in the client bundle.
 */

import { Platform } from "react-native";
import {
	type NativeErrorEvent,
	XRGlassesNative,
} from "../../modules/xr-glasses";
import logger from "../utils/logger";

const TAG = "ErrorReporting";

// Type declaration for React Native's ErrorUtils global
declare const ErrorUtils:
	| {
			getGlobalHandler: () =>
				| ((error: Error, isFatal?: boolean) => void)
				| null;
			setGlobalHandler: (
				handler: (error: Error, isFatal?: boolean) => void,
			) => void;
	  }
	| undefined;

// Error reports go through the Cloudflare Worker proxy (not directly to Discord)
const AGORA_TOKEN_SERVER_URL =
	process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL || "";
const ERROR_REPORT_URL = AGORA_TOKEN_SERVER_URL
	? `${AGORA_TOKEN_SERVER_URL.replace(/\/$/, "")}/report-error`
	: "";

// Severity levels for error categorization
export type ErrorSeverity = "critical" | "error" | "warning" | "info";

// Error context for debugging
interface ErrorContext {
	severity: ErrorSeverity;
	source: "js" | "promise" | "native" | "manual";
	isFatal?: boolean;
	componentStack?: string;
	additionalInfo?: Record<string, unknown>;
}

/**
 * Send error report to the Cloudflare Worker proxy
 */
export async function sendErrorToDiscord(
	error: Error | string,
	context: ErrorContext,
): Promise<void> {
	if (!ERROR_REPORT_URL) {
		logger.warn(
			TAG,
			"Error report URL not configured (EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL missing)",
		);
		return;
	}

	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : undefined;

	// Build a context object with all details for the Worker proxy
	const reportContext: Record<string, unknown> = {
		source: context.source,
		platform: `${Platform.OS} ${Platform.Version}`,
		fatal: context.isFatal ?? false,
	};

	if (errorStack) {
		reportContext.stack = errorStack.substring(0, 1000);
	}

	if (context.componentStack) {
		reportContext.componentStack = context.componentStack.substring(0, 1000);
	}

	if (context.additionalInfo) {
		reportContext.additionalInfo = context.additionalInfo;
	}

	try {
		const response = await fetch(ERROR_REPORT_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				level: context.severity,
				message: errorMessage.substring(0, 2000),
				context: reportContext,
			}),
		});

		if (!response.ok) {
			logger.error(TAG, "Failed to send error report:", response.status);
		}
	} catch (e) {
		// Don't throw - we don't want error reporting to cause more errors
		logger.error(TAG, "Failed to send error report:", e);
	}
}

/**
 * Report an error manually with custom context
 */
export function reportError(
	error: Error | string,
	severity: ErrorSeverity = "error",
	additionalInfo?: Record<string, unknown>,
): void {
	sendErrorToDiscord(error, {
		severity,
		source: "manual",
		additionalInfo,
	});
}

// Store original error handler
let originalErrorHandler: ((error: Error, isFatal?: boolean) => void) | null =
	null;

/**
 * Initialize global error handlers
 * Call this once at app startup
 */
export function initializeErrorReporting(): void {
	if (!ERROR_REPORT_URL) {
		logger.warn(
			TAG,
			"Error reporting not configured. Set EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL in .env",
		);
		return;
	}

	logger.debug(TAG, "Initializing error handlers...");

	// 1. Handle uncaught JS errors
	if (ErrorUtils) {
		originalErrorHandler = ErrorUtils.getGlobalHandler();

		ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
			logger.debug(TAG, "Caught JS error:", error.message, "Fatal:", isFatal);

			sendErrorToDiscord(error, {
				severity: isFatal ? "critical" : "error",
				source: "js",
				isFatal,
			});

			// Call original handler so React Native can handle the error too
			if (originalErrorHandler) {
				originalErrorHandler(error, isFatal);
			}
		});
	}

	// 2. Handle unhandled promise rejections
	// React Native uses a polyfill that supports tracking
	const promiseRejectionTracking = require("promise/setimmediate/rejection-tracking");
	promiseRejectionTracking.enable({
		allRejections: true,
		onUnhandled: (id: number, error: Error) => {
			logger.debug(TAG, "Unhandled promise rejection:", error?.message);

			sendErrorToDiscord(error || new Error("Unknown promise rejection"), {
				severity: "error",
				source: "promise",
				additionalInfo: { promiseId: id },
			});
		},
		onHandled: () => {
			// Promise was eventually handled, no action needed
		},
	});

	// 3. Handle native (Kotlin) errors via XRGlassesNative events
	if (Platform.OS === "android") {
		try {
			XRGlassesNative.addListener(
				"onNativeError",
				(event: NativeErrorEvent) => {
					logger.debug(
						TAG,
						"Native error:",
						event.message,
						"Fatal:",
						event.isFatal,
					);

					sendErrorToDiscord(new Error(event.message), {
						severity: event.isFatal ? "critical" : "error",
						source: "native",
						isFatal: event.isFatal,
						additionalInfo: {
							stackTrace: event.stackTrace,
							threadName: event.threadName,
							deviceModel: event.deviceModel,
							androidVersion: event.androidVersion,
						},
					});
				},
			);
		} catch (e) {
			logger.warn(TAG, "Failed to subscribe to native errors:", e);
		}
	}

	logger.debug(TAG, "Error handlers initialized");
}

/**
 * Handle native errors forwarded from Kotlin
 * Called by the native module when a native crash is caught
 */
export function handleNativeError(
	message: string,
	stackTrace: string,
	isFatal: boolean,
): void {
	sendErrorToDiscord(new Error(message), {
		severity: isFatal ? "critical" : "error",
		source: "native",
		isFatal,
		additionalInfo: {
			nativeStack: stackTrace,
		},
	});
}
