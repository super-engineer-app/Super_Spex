import { useCallback, useEffect, useRef, useState } from "react";
import type {
	CameraErrorEvent,
	CameraStateEvent,
	ImageCapturedEvent,
} from "../../modules/xr-glasses";
import { getXRGlassesService } from "../../modules/xr-glasses";
import logger from "../utils/logger";

const TAG = "useGlassesCamera";

/**
 * Camera state interface.
 */
export interface CameraState {
	/** Whether camera is initialized and ready */
	isReady: boolean;
	/** Whether currently capturing an image */
	isCapturing: boolean;
	/** Last captured image as base64 JPEG */
	lastImage: string | null;
	/** Dimensions of last captured image */
	lastImageSize: { width: number; height: number } | null;
	/** Error message if camera operation failed */
	error: string | null;
	/** Whether running in emulation mode */
	isEmulated: boolean;
}

/**
 * Return type for useGlassesCamera hook.
 */
export interface UseGlassesCameraReturn extends CameraState {
	/** Initialize the camera. Call before capturing. */
	initializeCamera: (lowPowerMode?: boolean) => Promise<void>;
	/** Capture a single image. Result available via lastImage. */
	captureImage: () => Promise<void>;
	/** Release camera resources */
	releaseCamera: () => Promise<void>;
	/** Clear the last captured image */
	clearImage: () => void;
	/** History of captured images */
	imageHistory: ImageCapturedEvent[];
	/** Clear image history */
	clearHistory: () => void;
}

/**
 * React hook for glasses camera capture.
 *
 * Uses ProjectedContext to access the glasses camera from the phone app.
 * See: https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context
 *
 * Key points from Google docs:
 * - DEFAULT_BACK_CAMERA maps to glasses' outward-facing camera
 * - Optimize resolution/FPS for battery (use lowPowerMode for 640x480)
 * - Camera capture not available in emulator yet
 * - Auto-reconnects camera if it becomes unavailable
 *
 * @example
 * ```tsx
 * function CameraCapture() {
 *   const {
 *     isReady,
 *     isCapturing,
 *     lastImage,
 *     error,
 *     initializeCamera,
 *     captureImage,
 *     releaseCamera,
 *   } = useGlassesCamera();
 *
 *   useEffect(() => {
 *     // Initialize camera on mount
 *     initializeCamera(false); // false = high quality, true = low power mode
 *     return () => releaseCamera();
 *   }, []);
 *
 *   return (
 *     <View>
 *       {lastImage && (
 *         <Image
 *           source={{ uri: `data:image/jpeg;base64,${lastImage}` }}
 *           style={{ width: 300, height: 200 }}
 *         />
 *       )}
 *       <Button
 *         title={isCapturing ? 'Capturing...' : 'Capture'}
 *         onPress={captureImage}
 *         disabled={!isReady || isCapturing}
 *       />
 *       {error && <Text style={{ color: 'red' }}>{error}</Text>}
 *     </View>
 *   );
 * }
 * ```
 */
export function useGlassesCamera(): UseGlassesCameraReturn {
	const [isReady, setIsReady] = useState(false);
	const [isCapturing, setIsCapturing] = useState(false);
	const [lastImage, setLastImage] = useState<string | null>(null);
	const [lastImageSize, setLastImageSize] = useState<{
		width: number;
		height: number;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isEmulated, setIsEmulated] = useState(false);
	const [imageHistory, setImageHistory] = useState<ImageCapturedEvent[]>([]);

	// Track if component is mounted
	const mountedRef = useRef(true);

	// Track if camera was initialized (for auto-reconnect)
	const wasInitializedRef = useRef(false);
	const lastLowPowerModeRef = useRef(false);

	useEffect(() => {
		mountedRef.current = true;

		const service = getXRGlassesService();

		// Subscribe to camera events
		const imageSub = service.onImageCaptured((event: ImageCapturedEvent) => {
			if (!mountedRef.current) return;

			logger.debug(
				TAG,
				`onImageCaptured: ${event.width}x${event.height}, base64Len=${event.imageBase64?.length ?? 0}`,
			);

			setLastImage(event.imageBase64);
			setLastImageSize({ width: event.width, height: event.height });
			setIsEmulated(event.isEmulated);
			setIsCapturing(false);
			setError(null);

			// Add to history
			setImageHistory((prev) => [...prev, event]);
		});

		const errorSub = service.onCameraError((event: CameraErrorEvent) => {
			if (!mountedRef.current) return;

			logger.debug(TAG, `onCameraError: ${event.message}`);
			setError(event.message);
			setIsCapturing(false);
		});

		const stateSub = service.onCameraStateChanged((event: CameraStateEvent) => {
			if (!mountedRef.current) return;

			logger.debug(
				TAG,
				`onCameraStateChanged: isReady=${event.isReady}, isEmulated=${event.isEmulated}`,
			);
			setIsReady(event.isReady);
			setIsEmulated(event.isEmulated);
		});

		return () => {
			mountedRef.current = false;
			imageSub.remove();
			errorSub.remove();
			stateSub.remove();
		};
	}, []);

	const initializeCamera = useCallback(
		async (lowPowerMode: boolean = false) => {
			setError(null);
			lastLowPowerModeRef.current = lowPowerMode;

			try {
				const service = getXRGlassesService();
				await service.initializeCamera(lowPowerMode);
				wasInitializedRef.current = true;
				// State will be updated via onCameraStateChanged event
			} catch (e) {
				const errorMessage =
					e instanceof Error ? e.message : "Failed to initialize camera";
				setError(errorMessage);
				setIsReady(false);
			}
		},
		[],
	);

	const captureImage = useCallback(async () => {
		logger.debug(
			TAG,
			`captureImage called: isReady=${isReady}, isCapturing=${isCapturing}`,
		);

		if (isCapturing) {
			return; // Already capturing
		}

		const service = getXRGlassesService();

		// Always ensure camera is initialized before capturing
		if (!isReady) {
			logger.debug(TAG, "Camera not ready, initializing before capture...");
			setError(null);
			try {
				await service.initializeCamera(lastLowPowerModeRef.current);
				wasInitializedRef.current = true;
				// Wait for camera to become ready (onCameraStateChanged event)
				await new Promise<void>((resolve, reject) => {
					let resolved = false;
					const sub = service.onCameraStateChanged(() => {
						if (!resolved) {
							resolved = true;
							sub.remove();
							resolve();
						}
					});
					// Timeout after 3s
					setTimeout(() => {
						if (!resolved) {
							resolved = true;
							sub.remove();
							reject(new Error("Camera initialization timed out"));
						}
					}, 3000);
				});
			} catch (e) {
				const errorMessage =
					e instanceof Error ? e.message : "Failed to initialize camera";
				setError(errorMessage);
				return;
			}
		}

		setIsCapturing(true);
		setError(null);

		try {
			await service.captureImage();
			// Result will be delivered via onImageCaptured event
		} catch (e) {
			const errorMessage =
				e instanceof Error ? e.message : "Failed to capture image";
			setError(errorMessage);
			setIsCapturing(false);
		}
	}, [isReady, isCapturing]);

	const releaseCamera = useCallback(async () => {
		// User explicitly releasing - don't auto-reconnect
		wasInitializedRef.current = false;
		try {
			const service = getXRGlassesService();
			await service.releaseCamera();
			setIsReady(false);
		} catch (e) {
			const errorMessage =
				e instanceof Error ? e.message : "Failed to release camera";
			setError(errorMessage);
		}
	}, []);

	const clearImage = useCallback(() => {
		setLastImage(null);
		setLastImageSize(null);
		setError(null);
	}, []);

	const clearHistory = useCallback(() => {
		setImageHistory([]);
	}, []);

	return {
		isReady,
		isCapturing,
		lastImage,
		lastImageSize,
		error,
		isEmulated,
		initializeCamera,
		captureImage,
		releaseCamera,
		clearImage,
		imageHistory,
		clearHistory,
	};
}
