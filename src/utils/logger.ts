/**
 * Logger utility that gates debug/warn output behind __DEV__.
 *
 * - debug: only logs in development builds
 * - warn:  only logs in development builds
 * - error: always logs (errors should never be silenced)
 */

const logger = {
	debug(tag: string, ...args: unknown[]): void {
		if (__DEV__) {
			console.log(`[${tag}]`, ...args);
		}
	},

	warn(tag: string, ...args: unknown[]): void {
		if (__DEV__) {
			console.warn(`[${tag}]`, ...args);
		}
	},

	error(tag: string, ...args: unknown[]): void {
		console.error(`[${tag}]`, ...args);
	},
};

export default logger;
