/**
 * Discord Error Reporting Service — Web version.
 *
 * Same as errorReporting.ts but without native module dependencies.
 * Uses window.addEventListener for unhandled promise rejections.
 */

import { Platform } from "react-native";
import logger from "../utils/logger";

const TAG = "ErrorReporting";

// Error reports are sent to the Cloudflare Worker proxy (not directly to Discord)
// to avoid exposing the webhook URL in the client bundle.
const AGORA_TOKEN_SERVER_URL =
	process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL || "";
const ERROR_REPORT_URL = AGORA_TOKEN_SERVER_URL
	? `${AGORA_TOKEN_SERVER_URL.replace(/\/$/, "")}/report-error`
	: "";

export type ErrorSeverity = "critical" | "error" | "warning" | "info";

interface ErrorContext {
	severity: ErrorSeverity;
	source: "js" | "promise" | "native" | "manual";
	isFatal?: boolean;
	componentStack?: string;
	additionalInfo?: Record<string, unknown>;
}

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
		logger.error(TAG, "Failed to send error report:", e);
	}
}

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

export function initializeErrorReporting(): void {
	if (!ERROR_REPORT_URL) {
		logger.warn(
			TAG,
			"Error reporting not configured. Set EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL in .env",
		);
		return;
	}

	logger.debug(TAG, "Initializing error handlers (web)...");

	// 1. Handle uncaught JS errors via ErrorUtils if available, else window.onerror
	if (typeof ErrorUtils !== "undefined" && ErrorUtils) {
		originalErrorHandler = ErrorUtils.getGlobalHandler();
		ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
			sendErrorToDiscord(error, {
				severity: isFatal ? "critical" : "error",
				source: "js",
				isFatal,
			});
			if (originalErrorHandler) {
				originalErrorHandler(error, isFatal);
			}
		});
	}

	// 2. Handle unhandled promise rejections via browser API
	if (typeof window !== "undefined") {
		window.addEventListener("unhandledrejection", (event) => {
			const error =
				event.reason instanceof Error
					? event.reason
					: new Error(String(event.reason));
			sendErrorToDiscord(error, {
				severity: "error",
				source: "promise",
			});
		});
	}

	// 3. No native error listener on web

	logger.debug(TAG, "Error handlers initialized (web)");
}

export function handleNativeError(
	message: string,
	stackTrace: string,
	isFatal: boolean,
): void {
	sendErrorToDiscord(new Error(message), {
		severity: isFatal ? "critical" : "error",
		source: "native",
		isFatal,
		additionalInfo: { nativeStack: stackTrace },
	});
}
