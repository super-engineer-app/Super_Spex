/**
 * Typed interface for React Native's FormData file objects.
 *
 * React Native's FormData doesn't use Blob; instead it accepts
 * plain objects with {uri, type, name}. This interface documents
 * that shape explicitly so we avoid `as any` casts.
 */
export interface ReactNativeFile {
	uri: string;
	type: string;
	name: string;
}
