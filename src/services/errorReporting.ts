/**
 * Discord Error Reporting Service
 *
 * Captures and reports errors to Discord via webhook:
 * - JS uncaught exceptions
 * - Unhandled promise rejections
 * - Native (Kotlin) crashes
 */

import { Platform } from 'react-native';
import { XRGlassesNative, NativeErrorEvent } from '../../modules/xr-glasses';
import logger from '../utils/logger';

const TAG = 'ErrorReporting';

// Type declaration for React Native's ErrorUtils global
declare const ErrorUtils: {
  getGlobalHandler: () => ((error: Error, isFatal?: boolean) => void) | null;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
} | undefined;

// Discord webhook URL - set via environment or configure here
// To get a webhook URL: Discord Server Settings > Integrations > Webhooks > New Webhook
const DISCORD_WEBHOOK_URL = process.env.EXPO_PUBLIC_DISCORD_WEBHOOK_URL || '';

// Severity levels for error categorization
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

// Error context for debugging
interface ErrorContext {
  severity: ErrorSeverity;
  source: 'js' | 'promise' | 'native' | 'manual';
  isFatal?: boolean;
  componentStack?: string;
  additionalInfo?: Record<string, unknown>;
}

// Color codes for Discord embeds
const SEVERITY_COLORS: Record<ErrorSeverity, number> = {
  critical: 0xFF0000, // Red
  error: 0xFF6B6B,    // Light red
  warning: 0xFFAA00,  // Orange
  info: 0x0099FF,     // Blue
};

// Emoji prefixes for severity
const SEVERITY_EMOJI: Record<ErrorSeverity, string> = {
  critical: '🔴',
  error: '🟠',
  warning: '🟡',
  info: '🔵',
};

/**
 * Send error to Discord webhook
 */
export async function sendErrorToDiscord(
  error: Error | string,
  context: ErrorContext
): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    logger.warn(TAG, 'Discord webhook URL not configured');
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  const embed = {
    title: `${SEVERITY_EMOJI[context.severity]} ${context.severity.toUpperCase()}: ${context.source.toUpperCase()} Error`,
    description: errorMessage.substring(0, 2000), // Discord limit
    color: SEVERITY_COLORS[context.severity],
    fields: [
      {
        name: 'Source',
        value: context.source,
        inline: true,
      },
      {
        name: 'Platform',
        value: `${Platform.OS} ${Platform.Version}`,
        inline: true,
      },
      {
        name: 'Fatal',
        value: context.isFatal ? 'Yes' : 'No',
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  // Add stack trace if available
  if (errorStack) {
    embed.fields.push({
      name: 'Stack Trace',
      value: `\`\`\`\n${errorStack.substring(0, 1000)}\n\`\`\``,
      inline: false,
    });
  }

  // Add component stack if available (React error boundaries)
  if (context.componentStack) {
    embed.fields.push({
      name: 'Component Stack',
      value: `\`\`\`\n${context.componentStack.substring(0, 1000)}\n\`\`\``,
      inline: false,
    });
  }

  // Add additional info if provided
  if (context.additionalInfo) {
    embed.fields.push({
      name: 'Additional Info',
      value: `\`\`\`json\n${JSON.stringify(context.additionalInfo, null, 2).substring(0, 1000)}\n\`\`\``,
      inline: false,
    });
  }

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'SPEX Error Reporter',
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      logger.error(TAG, 'Failed to send to Discord:', response.status);
    }
  } catch (e) {
    // Don't throw - we don't want error reporting to cause more errors
    logger.error(TAG, 'Failed to send to Discord:', e);
  }
}

/**
 * Report an error manually with custom context
 */
export function reportError(
  error: Error | string,
  severity: ErrorSeverity = 'error',
  additionalInfo?: Record<string, unknown>
): void {
  sendErrorToDiscord(error, {
    severity,
    source: 'manual',
    additionalInfo,
  });
}

// Store original error handler
let originalErrorHandler: ((error: Error, isFatal?: boolean) => void) | null = null;

/**
 * Initialize global error handlers
 * Call this once at app startup
 */
export function initializeErrorReporting(): void {
  if (!DISCORD_WEBHOOK_URL) {
    logger.warn(TAG, 'Discord webhook URL not configured. Set EXPO_PUBLIC_DISCORD_WEBHOOK_URL in .env');
    return;
  }

  logger.debug(TAG, 'Initializing error handlers...');

  // 1. Handle uncaught JS errors
  if (ErrorUtils) {
    originalErrorHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      logger.debug(TAG, 'Caught JS error:', error.message, 'Fatal:', isFatal);

      sendErrorToDiscord(error, {
        severity: isFatal ? 'critical' : 'error',
        source: 'js',
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
  const promiseRejectionTracking = require('promise/setimmediate/rejection-tracking');
  promiseRejectionTracking.enable({
    allRejections: true,
    onUnhandled: (id: number, error: Error) => {
      logger.debug(TAG, 'Unhandled promise rejection:', error?.message);

      sendErrorToDiscord(error || new Error('Unknown promise rejection'), {
        severity: 'error',
        source: 'promise',
        additionalInfo: { promiseId: id },
      });
    },
    onHandled: () => {
      // Promise was eventually handled, no action needed
    },
  });

  // 3. Handle native (Kotlin) errors via XRGlassesNative events
  if (Platform.OS === 'android') {
    try {
      XRGlassesNative.addListener('onNativeError', (event: NativeErrorEvent) => {
        logger.debug(TAG, 'Native error:', event.message, 'Fatal:', event.isFatal);

        sendErrorToDiscord(new Error(event.message), {
          severity: event.isFatal ? 'critical' : 'error',
          source: 'native',
          isFatal: event.isFatal,
          additionalInfo: {
            stackTrace: event.stackTrace,
            threadName: event.threadName,
            deviceModel: event.deviceModel,
            androidVersion: event.androidVersion,
          },
        });
      });
    } catch (e) {
      logger.warn(TAG, 'Failed to subscribe to native errors:', e);
    }
  }

  logger.debug(TAG, 'Error handlers initialized');
}

/**
 * Handle native errors forwarded from Kotlin
 * Called by the native module when a native crash is caught
 */
export function handleNativeError(
  message: string,
  stackTrace: string,
  isFatal: boolean
): void {
  sendErrorToDiscord(new Error(message), {
    severity: isFatal ? 'critical' : 'error',
    source: 'native',
    isFatal,
    additionalInfo: {
      nativeStack: stackTrace,
    },
  });
}

