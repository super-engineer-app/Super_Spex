/**
 * Agora RTC Token Server + Real-time Channel Management
 *
 * Uses Durable Objects for WebSocket connections (viewer tracking, future chat).
 * Uses KV for viewer presence with TTL (backup/fallback).
 */

import { RtcRole, RtcTokenBuilder } from "agora-token";

// ============================================================================
// Types
// ============================================================================

interface Env {
	AGORA_APP_ID: string;
	AGORA_APP_CERTIFICATE: string;
	DISCORD_WEBHOOK_URL: string;
	VIEWERS: KVNamespace;
	CHANNEL_ROOM: DurableObjectNamespace;
}

interface ErrorReport {
	level: string;
	message: string;
	context?: Record<string, unknown>;
}

// Simple in-memory rate limiter for error reporting (per-isolate)
const errorReportCounts = new Map<string, { count: number; resetAt: number }>();
const ERROR_REPORT_LIMIT = 10;
const ERROR_REPORT_WINDOW_MS = 60_000;

interface ViewerData {
	joinedAt: number;
	lastSeen: number;
}

interface Session {
	ws: WebSocket;
	role: string;
	name: string;
}

interface ChatMessage {
	type: "chat";
	text: string;
}

interface PingMessage {
	type: "ping";
}

type IncomingMessage = ChatMessage | PingMessage | { type: string };

interface NotifyPayload {
	event: "viewer_join" | "viewer_leave";
	viewerId: string;
}

// ============================================================================
// Constants
// ============================================================================

const VIEWER_TTL_SECONDS = 60;

// ============================================================================
// Main Worker - Routes requests
// ============================================================================

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders() });
		}

		// WebSocket upgrade for real-time channel connection
		if (path.startsWith("/ws/")) {
			return handleWebSocket(request, env, url);
		}

		// Viewer presence endpoints (KV-based, for web viewers without WebSocket)
		if (path === "/heartbeat" || path === "/heartbeat/") {
			return handleHeartbeat(url, env);
		}

		if (path === "/leave" || path === "/leave/") {
			return handleLeave(url, env);
		}

		if (path === "/viewers" || path === "/viewers/") {
			return handleViewerCount(url, env);
		}

		// Error reporting proxy (Discord webhook)
		if (
			(path === "/report-error" || path === "/report-error/") &&
			request.method === "POST"
		) {
			return handleErrorReport(request, env);
		}

		// Default: token generation
		return handleTokenRequest(env, url);
	},
};

// ============================================================================
// WebSocket Handler - Routes to Durable Object
// ============================================================================

async function handleWebSocket(
	request: Request,
	env: Env,
	url: URL,
): Promise<Response> {
	// URL format: /ws/{channelId}
	const pathParts = url.pathname.split("/");
	const channelId = pathParts[2];

	if (!channelId) {
		return jsonResponse({ error: "Missing channel ID in WebSocket path" }, 400);
	}

	// Check for WebSocket upgrade
	const upgradeHeader = request.headers.get("Upgrade");
	if (upgradeHeader !== "websocket") {
		return jsonResponse({ error: "Expected WebSocket upgrade" }, 426);
	}

	// Get the Durable Object for this channel
	const id = env.CHANNEL_ROOM.idFromName(channelId);
	const room = env.CHANNEL_ROOM.get(id);

	// Forward the WebSocket request to the Durable Object
	return room.fetch(request);
}

// ============================================================================
// Token Generation
// ============================================================================

async function handleTokenRequest(env: Env, url: URL): Promise<Response> {
	const appId = env.AGORA_APP_ID;
	const appCertificate = env.AGORA_APP_CERTIFICATE;

	if (!appId || !appCertificate) {
		return jsonResponse(
			{
				error:
					"Server misconfigured: Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE secrets",
			},
			500,
		);
	}

	const channel = url.searchParams.get("channel");
	const role = url.searchParams.get("role") ?? "subscriber";
	const uid = parseInt(url.searchParams.get("uid") ?? "0", 10);
	const viewerId = url.searchParams.get("viewerId");

	if (!channel) {
		return jsonResponse({ error: "Missing channel parameter" }, 400);
	}

	try {
		const expireTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
		const rtcRole =
			role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

		const token = RtcTokenBuilder.buildTokenWithUid(
			appId,
			appCertificate,
			channel,
			uid,
			rtcRole,
			expireTime,
			expireTime,
		);

		// Register viewer in KV (for web viewers that use heartbeat instead of WebSocket)
		if (role === "subscriber" && viewerId && env.VIEWERS) {
			await registerViewer(env.VIEWERS, channel, viewerId);
			// Also notify the Durable Object about the new viewer
			await notifyDurableObject(env, channel, "viewer_join", viewerId);
		}

		return jsonResponse({ token, appId, channel, uid });
	} catch (err) {
		console.error("Token generation error:", err);
		const message = err instanceof Error ? err.message : String(err);
		return jsonResponse({ error: message }, 500);
	}
}

// ============================================================================
// KV-based Viewer Presence (for web viewers)
// ============================================================================

async function registerViewer(
	kv: KVNamespace,
	channel: string,
	viewerId: string,
): Promise<void> {
	const key = `viewer:${channel}:${viewerId}`;
	const now = Date.now();
	await kv.put(key, JSON.stringify({ joinedAt: now, lastSeen: now }), {
		expirationTtl: VIEWER_TTL_SECONDS,
	});
}

async function handleHeartbeat(url: URL, env: Env): Promise<Response> {
	const channel = url.searchParams.get("channel");
	const viewerId = url.searchParams.get("viewerId");

	if (!channel || !viewerId) {
		return jsonResponse(
			{ error: "Missing channel or viewerId parameter" },
			400,
		);
	}

	if (env.VIEWERS) {
		const key = `viewer:${channel}:${viewerId}`;
		const existing = await env.VIEWERS.get<ViewerData>(key, { type: "json" });
		const now = Date.now();
		const data: ViewerData = existing
			? { ...existing, lastSeen: now }
			: { joinedAt: now, lastSeen: now };
		await env.VIEWERS.put(key, JSON.stringify(data), {
			expirationTtl: VIEWER_TTL_SECONDS,
		});
	}

	return jsonResponse({ success: true });
}

async function handleLeave(url: URL, env: Env): Promise<Response> {
	const channel = url.searchParams.get("channel");
	const viewerId = url.searchParams.get("viewerId");

	if (!channel || !viewerId) {
		return jsonResponse(
			{ error: "Missing channel or viewerId parameter" },
			400,
		);
	}

	if (env.VIEWERS) {
		const key = `viewer:${channel}:${viewerId}`;
		await env.VIEWERS.delete(key);
	}

	// Notify Durable Object
	await notifyDurableObject(env, channel, "viewer_leave", viewerId);

	return jsonResponse({ success: true });
}

async function handleViewerCount(url: URL, env: Env): Promise<Response> {
	const channel = url.searchParams.get("channel");

	if (!channel) {
		return jsonResponse({ error: "Missing channel parameter" }, 400);
	}

	// Get count from Durable Object (most accurate)
	try {
		const id = env.CHANNEL_ROOM.idFromName(channel);
		const room = env.CHANNEL_ROOM.get(id);
		const response = await room.fetch(new Request("http://internal/count"));
		const data = (await response.json()) as { count: number };
		return jsonResponse({ channel, viewerCount: data.count });
	} catch {
		// Fallback to KV count
		if (env.VIEWERS) {
			const prefix = `viewer:${channel}:`;
			const list = await env.VIEWERS.list({ prefix });
			return jsonResponse({ channel, viewerCount: list.keys.length });
		}
		return jsonResponse({ channel, viewerCount: 0 });
	}
}

async function notifyDurableObject(
	env: Env,
	channel: string,
	event: "viewer_join" | "viewer_leave",
	viewerId: string,
): Promise<void> {
	try {
		const id = env.CHANNEL_ROOM.idFromName(channel);
		const room = env.CHANNEL_ROOM.get(id);
		await room.fetch(
			new Request("http://internal/notify", {
				method: "POST",
				body: JSON.stringify({ event, viewerId }),
			}),
		);
	} catch (e) {
		console.error("Failed to notify Durable Object:", e);
	}
}

// ============================================================================
// Durable Object - Channel Room
// ============================================================================

export class ChannelRoom implements DurableObject {
	private sessions: Map<string, Session>;
	private viewers: Set<string>;

	constructor(_state: DurableObjectState, _env: Env) {
		this.sessions = new Map();
		this.viewers = new Set();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Internal: get viewer count
		if (url.pathname === "/count") {
			const wsViewers = Array.from(this.sessions.values()).filter(
				(s) => s.role === "viewer",
			).length;
			const kvViewers = this.viewers.size;
			return jsonResponse({ count: wsViewers + kvViewers });
		}

		// Internal: notify of viewer join/leave (from KV)
		if (url.pathname === "/notify") {
			const data = (await request.json()) as NotifyPayload;
			if (data.event === "viewer_join" && data.viewerId) {
				this.viewers.add(data.viewerId);
				this.broadcast({ type: "viewer_count", count: this.getViewerCount() });
			} else if (data.event === "viewer_leave" && data.viewerId) {
				this.viewers.delete(data.viewerId);
				this.broadcast({ type: "viewer_count", count: this.getViewerCount() });
			}
			return jsonResponse({ success: true });
		}

		// WebSocket upgrade
		const upgradeHeader = request.headers.get("Upgrade");
		if (upgradeHeader === "websocket") {
			return this.handleWebSocketUpgrade(url);
		}

		return jsonResponse({ error: "Expected WebSocket" }, 400);
	}

	private handleWebSocketUpgrade(url: URL): Response {
		const role = url.searchParams.get("role") ?? "viewer";
		const name = url.searchParams.get("name") ?? "Anonymous";

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		const sessionId = crypto.randomUUID();
		this.sessions.set(sessionId, { ws: server, role, name });

		server.accept();

		// Send initial state
		server.send(
			JSON.stringify({
				type: "connected",
				sessionId,
				viewerCount: this.getViewerCount(),
			}),
		);

		// Broadcast updated viewer count
		this.broadcast({ type: "viewer_count", count: this.getViewerCount() });

		// Handle messages
		server.addEventListener("message", (event) => {
			const data = typeof event.data === "string" ? event.data : "";
			this.handleMessage(sessionId, data);
		});

		// Handle close
		server.addEventListener("close", () => {
			this.sessions.delete(sessionId);
			this.broadcast({ type: "viewer_count", count: this.getViewerCount() });
		});

		server.addEventListener("error", () => {
			this.sessions.delete(sessionId);
		});

		return new Response(null, { status: 101, webSocket: client });
	}

	private handleMessage(sessionId: string, data: string): void {
		try {
			const message = JSON.parse(data) as IncomingMessage;
			const session = this.sessions.get(sessionId);

			switch (message.type) {
				case "chat":
					// Broadcast chat message to all
					this.broadcast({
						type: "chat",
						from: session?.name ?? "Anonymous",
						role: session?.role ?? "viewer",
						text: (message as ChatMessage).text,
						timestamp: Date.now(),
					});
					break;

				case "ping":
					// Respond with pong
					session?.ws.send(JSON.stringify({ type: "pong" }));
					break;

				default:
					console.log("Unknown message type:", message.type);
			}
		} catch (e) {
			console.error("Failed to handle message:", e);
		}
	}

	private getViewerCount(): number {
		const wsViewers = Array.from(this.sessions.values()).filter(
			(s) => s.role === "viewer",
		).length;
		const kvViewers = this.viewers.size;
		return wsViewers + kvViewers;
	}

	private broadcast(message: Record<string, unknown>): void {
		const data = JSON.stringify(message);
		for (const session of this.sessions.values()) {
			try {
				session.ws.send(data);
			} catch {
				// Connection might be closed
			}
		}
	}
}

// ============================================================================
// Error Reporting Proxy (Discord Webhook)
// ============================================================================

async function handleErrorReport(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!env.DISCORD_WEBHOOK_URL) {
		return jsonResponse({ error: "Error reporting not configured" }, 503);
	}

	// Rate limit by client IP
	const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
	const now = Date.now();
	const entry = errorReportCounts.get(clientIp);

	if (entry && now < entry.resetAt) {
		if (entry.count >= ERROR_REPORT_LIMIT) {
			return jsonResponse({ error: "Rate limit exceeded" }, 429);
		}
		entry.count++;
	} else {
		errorReportCounts.set(clientIp, {
			count: 1,
			resetAt: now + ERROR_REPORT_WINDOW_MS,
		});
	}

	let body: ErrorReport;
	try {
		body = (await request.json()) as ErrorReport;
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	if (!body.message) {
		return jsonResponse({ error: "Missing message field" }, 400);
	}

	// Forward to Discord as an embed
	const severityColors: Record<string, number> = {
		critical: 0xff0000,
		error: 0xff6b6b,
		warning: 0xffaa00,
		info: 0x0099ff,
	};

	const severityEmoji: Record<string, string> = {
		critical: "\u{1F534}",
		error: "\u{1F7E0}",
		warning: "\u{1F7E1}",
		info: "\u{1F535}",
	};

	const level = body.level ?? "error";
	const emoji = severityEmoji[level] ?? "\u{1F7E0}";
	const color = severityColors[level] ?? 0xff6b6b;

	const embed: Record<string, unknown> = {
		title: `${emoji} ${level.toUpperCase()}: Web Error Report`,
		description: body.message.substring(0, 2000),
		color,
		fields: [] as Array<Record<string, unknown>>,
		timestamp: new Date().toISOString(),
	};

	if (body.context) {
		(embed.fields as Array<Record<string, unknown>>).push({
			name: "Context",
			value: `\`\`\`json\n${JSON.stringify(body.context, null, 2).substring(0, 1000)}\n\`\`\``,
			inline: false,
		});
	}

	try {
		const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "SPEX Web Error Reporter",
				embeds: [embed],
			}),
		});

		if (!discordResponse.ok) {
			console.error("Discord webhook failed:", discordResponse.status);
			return jsonResponse({ error: "Failed to forward error report" }, 502);
		}

		return jsonResponse({ success: true });
	} catch (err) {
		console.error("Discord webhook error:", err);
		return jsonResponse({ error: "Failed to forward error report" }, 502);
	}
}

// ============================================================================
// Utilities
// ============================================================================

function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection",
	};
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...corsHeaders() },
	});
}
