/**
 * Discord Error Reporting Service — Web version.
 *
 * Same as errorReporting.ts but without native module dependencies.
 * Uses window.addEventListener for unhandled promise rejections.
 */

import { Platform } from "react-native";
import logger from "../utils/logger";

const TAG = "ErrorReporting";

const DISCORD_WEBHOOK_URL = process.env.EXPO_PUBLIC_DISCORD_WEBHOOK_URL || "";

export type ErrorSeverity = "critical" | "error" | "warning" | "info";

interface ErrorContext {
	severity: ErrorSeverity;
	source: "js" | "promise" | "native" | "manual";
	isFatal?: boolean;
	componentStack?: string;
	additionalInfo?: Record<string, unknown>;
}

const SEVERITY_COLORS: Record<ErrorSeverity, number> = {
	critical: 0xff0000,
	error: 0xff6b6b,
	warning: 0xffaa00,
	info: 0x0099ff,
};

const SEVERITY_EMOJI: Record<ErrorSeverity, string> = {
	critical: "\u{1F534}",
	error: "\u{1F7E0}",
	warning: "\u{1F7E1}",
	info: "\u{1F535}",
};

export async function sendErrorToDiscord(
	error: Error | string,
	context: ErrorContext,
): Promise<void> {
	if (!DISCORD_WEBHOOK_URL) {
		logger.warn(TAG, "Discord webhook URL not configured");
		return;
	}

	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : undefined;

	const embed = {
		title: `${SEVERITY_EMOJI[context.severity]} ${context.severity.toUpperCase()}: ${context.source.toUpperCase()} Error`,
		description: errorMessage.substring(0, 2000),
		color: SEVERITY_COLORS[context.severity],
		fields: [
			{ name: "Source", value: context.source, inline: true },
			{
				name: "Platform",
				value: `${Platform.OS} ${Platform.Version}`,
				inline: true,
			},
			{ name: "Fatal", value: context.isFatal ? "Yes" : "No", inline: true },
		],
		timestamp: new Date().toISOString(),
	};

	if (errorStack) {
		embed.fields.push({
			name: "Stack Trace",
			value: `\`\`\`\n${errorStack.substring(0, 1000)}\n\`\`\``,
			inline: false,
		});
	}

	if (context.componentStack) {
		embed.fields.push({
			name: "Component Stack",
			value: `\`\`\`\n${context.componentStack.substring(0, 1000)}\n\`\`\``,
			inline: false,
		});
	}

	if (context.additionalInfo) {
		embed.fields.push({
			name: "Additional Info",
			value: `\`\`\`json\n${JSON.stringify(context.additionalInfo, null, 2).substring(0, 1000)}\n\`\`\``,
			inline: false,
		});
	}

	try {
		const response = await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "SPEX Error Reporter",
				embeds: [embed],
			}),
		});

		if (!response.ok) {
			logger.error(TAG, "Failed to send to Discord:", response.status);
		}
	} catch (e) {
		logger.error(TAG, "Failed to send to Discord:", e);
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
	if (!DISCORD_WEBHOOK_URL) {
		logger.warn(
			TAG,
			"Discord webhook URL not configured. Set EXPO_PUBLIC_DISCORD_WEBHOOK_URL in .env",
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
