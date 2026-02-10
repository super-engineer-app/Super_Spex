/**
 * Web camera capture — uses getUserMedia with a fullscreen overlay preview.
 * Returns a PickedImage-compatible object or null if cancelled.
 */
export function captureFromCamera(): Promise<{
	base64: string;
	uri: string;
} | null> {
	return new Promise((resolve) => {
		let stream: MediaStream | null = null;

		// --- build overlay UI ---
		const overlay = document.createElement("div");
		Object.assign(overlay.style, {
			position: "fixed",
			inset: "0",
			zIndex: "99999",
			background: "rgba(0,0,0,0.9)",
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
		});

		const video = document.createElement("video");
		video.setAttribute("playsinline", "true");
		video.setAttribute("autoplay", "true");
		Object.assign(video.style, {
			maxWidth: "100%",
			maxHeight: "70vh",
			borderRadius: "12px",
		});

		const btnRow = document.createElement("div");
		Object.assign(btnRow.style, {
			marginTop: "20px",
			display: "flex",
			gap: "16px",
		});

		const captureBtn = document.createElement("button");
		captureBtn.textContent = "Capture";
		Object.assign(captureBtn.style, {
			padding: "12px 32px",
			fontSize: "18px",
			borderRadius: "24px",
			border: "none",
			background: "#4CAF50",
			color: "#fff",
			cursor: "pointer",
			fontWeight: "600",
		});

		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "Cancel";
		Object.assign(cancelBtn.style, {
			padding: "12px 32px",
			fontSize: "18px",
			borderRadius: "24px",
			border: "2px solid #888",
			background: "transparent",
			color: "#fff",
			cursor: "pointer",
			fontWeight: "600",
		});

		btnRow.appendChild(captureBtn);
		btnRow.appendChild(cancelBtn);
		overlay.appendChild(video);
		overlay.appendChild(btnRow);
		document.body.appendChild(overlay);

		function cleanup() {
			if (stream) {
				for (const track of stream.getTracks()) track.stop();
			}
			overlay.remove();
		}

		cancelBtn.onclick = () => {
			cleanup();
			resolve(null);
		};

		captureBtn.onclick = () => {
			const canvas = document.createElement("canvas");
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				cleanup();
				resolve(null);
				return;
			}
			ctx.drawImage(video, 0, 0);
			const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
			const base64 = dataUrl.split(",")[1];
			cleanup();
			resolve({ base64, uri: dataUrl });
		};

		// --- start camera ---
		navigator.mediaDevices
			.getUserMedia({ video: { facingMode: "environment" } })
			.then((s) => {
				stream = s;
				video.srcObject = s;
			})
			.catch(() => {
				cleanup();
				resolve(null);
			});
	});
}
