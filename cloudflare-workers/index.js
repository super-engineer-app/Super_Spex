/**
 * Agora RTC Token Server + Real-time Channel Management
 *
 * Uses Durable Objects for WebSocket connections (viewer tracking, future chat).
 * Uses KV for viewer presence with TTL (backup/fallback).
 */

import { RtcTokenBuilder, RtcRole } from 'agora-token';

// Viewer heartbeat TTL in seconds
const VIEWER_TTL_SECONDS = 60;

// ============================================================
// Main Worker - Routes requests
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // WebSocket upgrade for real-time channel connection
    if (path.startsWith('/ws/')) {
      return handleWebSocket(request, env, url);
    }

    // Viewer presence endpoints (KV-based, for web viewers without WebSocket)
    if (path === '/heartbeat' || path === '/heartbeat/') {
      return handleHeartbeat(url, env);
    }

    if (path === '/leave' || path === '/leave/') {
      return handleLeave(url, env);
    }

    if (path === '/viewers' || path === '/viewers/') {
      return handleViewerCount(url, env);
    }

    // Default: token generation
    return handleTokenRequest(request, env, url);
  },
};

// ============================================================
// WebSocket Handler - Routes to Durable Object
// ============================================================

async function handleWebSocket(request, env, url) {
  // URL format: /ws/{channelId}
  const pathParts = url.pathname.split('/');
  const channelId = pathParts[2];

  if (!channelId) {
    return jsonResponse({ error: 'Missing channel ID in WebSocket path' }, 400);
  }

  // Check for WebSocket upgrade
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return jsonResponse({ error: 'Expected WebSocket upgrade' }, 426);
  }

  // Get the Durable Object for this channel
  const id = env.CHANNEL_ROOM.idFromName(channelId);
  const room = env.CHANNEL_ROOM.get(id);

  // Forward the WebSocket request to the Durable Object
  return room.fetch(request);
}

// ============================================================
// Token Generation
// ============================================================

async function handleTokenRequest(request, env, url) {
  const appId = env?.AGORA_APP_ID;
  const appCertificate = env?.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return jsonResponse({
      error: 'Server misconfigured: Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE secrets'
    }, 500);
  }

  const channel = url.searchParams.get('channel');
  const role = url.searchParams.get('role') || 'subscriber';
  const uid = parseInt(url.searchParams.get('uid') || '0', 10);
  const viewerId = url.searchParams.get('viewerId');

  if (!channel) {
    return jsonResponse({ error: 'Missing channel parameter' }, 400);
  }

  try {
    const expireTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      rtcRole,
      expireTime,
      expireTime
    );

    // Register viewer in KV (for web viewers that use heartbeat instead of WebSocket)
    if (role === 'subscriber' && viewerId && env.VIEWERS) {
      await registerViewer(env.VIEWERS, channel, viewerId);
      // Also notify the Durable Object about the new viewer
      await notifyDurableObject(env, channel, 'viewer_join', { viewerId });
    }

    return jsonResponse({ token, appId, channel, uid });
  } catch (err) {
    console.error('Token generation error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ============================================================
// KV-based Viewer Presence (for web viewers)
// ============================================================

async function registerViewer(kv, channel, viewerId) {
  const key = `viewer:${channel}:${viewerId}`;
  const now = Date.now();
  await kv.put(key, JSON.stringify({ joinedAt: now, lastSeen: now }), {
    expirationTtl: VIEWER_TTL_SECONDS
  });
}

async function handleHeartbeat(url, env) {
  const channel = url.searchParams.get('channel');
  const viewerId = url.searchParams.get('viewerId');

  if (!channel || !viewerId) {
    return jsonResponse({ error: 'Missing channel or viewerId parameter' }, 400);
  }

  if (env.VIEWERS) {
    const key = `viewer:${channel}:${viewerId}`;
    const existing = await env.VIEWERS.get(key, { type: 'json' });
    const now = Date.now();
    const data = existing ? { ...existing, lastSeen: now } : { joinedAt: now, lastSeen: now };
    await env.VIEWERS.put(key, JSON.stringify(data), { expirationTtl: VIEWER_TTL_SECONDS });
  }

  return jsonResponse({ success: true });
}

async function handleLeave(url, env) {
  const channel = url.searchParams.get('channel');
  const viewerId = url.searchParams.get('viewerId');

  if (!channel || !viewerId) {
    return jsonResponse({ error: 'Missing channel or viewerId parameter' }, 400);
  }

  if (env.VIEWERS) {
    const key = `viewer:${channel}:${viewerId}`;
    await env.VIEWERS.delete(key);
  }

  // Notify Durable Object
  await notifyDurableObject(env, channel, 'viewer_leave', { viewerId });

  return jsonResponse({ success: true });
}

async function handleViewerCount(url, env) {
  const channel = url.searchParams.get('channel');

  if (!channel) {
    return jsonResponse({ error: 'Missing channel parameter' }, 400);
  }

  // Get count from Durable Object (most accurate)
  try {
    const id = env.CHANNEL_ROOM.idFromName(channel);
    const room = env.CHANNEL_ROOM.get(id);
    const response = await room.fetch(new Request('http://internal/count'));
    const data = await response.json();
    return jsonResponse({ channel, viewerCount: data.count });
  } catch (e) {
    // Fallback to KV count
    if (env.VIEWERS) {
      const prefix = `viewer:${channel}:`;
      const list = await env.VIEWERS.list({ prefix });
      return jsonResponse({ channel, viewerCount: list.keys.length });
    }
    return jsonResponse({ channel, viewerCount: 0 });
  }
}

async function notifyDurableObject(env, channel, event, data) {
  try {
    const id = env.CHANNEL_ROOM.idFromName(channel);
    const room = env.CHANNEL_ROOM.get(id);
    await room.fetch(new Request('http://internal/notify', {
      method: 'POST',
      body: JSON.stringify({ event, ...data })
    }));
  } catch (e) {
    console.error('Failed to notify Durable Object:', e);
  }
}

// ============================================================
// Durable Object - Channel Room
// ============================================================

export class ChannelRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // WebSocket sessions: id -> { ws, role, name }
    this.viewers = new Set();  // Viewer IDs (from KV heartbeats)
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Internal: get viewer count
    if (url.pathname === '/count') {
      const wsViewers = Array.from(this.sessions.values()).filter(s => s.role === 'viewer').length;
      const kvViewers = this.viewers.size;
      return jsonResponse({ count: wsViewers + kvViewers });
    }

    // Internal: notify of viewer join/leave (from KV)
    if (url.pathname === '/notify') {
      const data = await request.json();
      if (data.event === 'viewer_join' && data.viewerId) {
        this.viewers.add(data.viewerId);
        this.broadcast({ type: 'viewer_count', count: this.getViewerCount() });
      } else if (data.event === 'viewer_leave' && data.viewerId) {
        this.viewers.delete(data.viewerId);
        this.broadcast({ type: 'viewer_count', count: this.getViewerCount() });
      }
      return jsonResponse({ success: true });
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return this.handleWebSocketUpgrade(request, url);
    }

    return jsonResponse({ error: 'Expected WebSocket' }, 400);
  }

  async handleWebSocketUpgrade(request, url) {
    const role = url.searchParams.get('role') || 'viewer'; // 'host' or 'viewer'
    const name = url.searchParams.get('name') || 'Anonymous';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { ws: server, role, name });

    server.accept();

    // Send initial state
    server.send(JSON.stringify({
      type: 'connected',
      sessionId,
      viewerCount: this.getViewerCount()
    }));

    // Broadcast updated viewer count
    this.broadcast({ type: 'viewer_count', count: this.getViewerCount() });

    // Handle messages
    server.addEventListener('message', (event) => {
      this.handleMessage(sessionId, event.data);
    });

    // Handle close
    server.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      this.broadcast({ type: 'viewer_count', count: this.getViewerCount() });
    });

    server.addEventListener('error', () => {
      this.sessions.delete(sessionId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  handleMessage(sessionId, data) {
    try {
      const message = JSON.parse(data);
      const session = this.sessions.get(sessionId);

      switch (message.type) {
        case 'chat':
          // Broadcast chat message to all
          this.broadcast({
            type: 'chat',
            from: session?.name || 'Anonymous',
            role: session?.role || 'viewer',
            text: message.text,
            timestamp: Date.now()
          });
          break;

        case 'ping':
          // Respond with pong
          session?.ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (e) {
      console.error('Failed to handle message:', e);
    }
  }

  getViewerCount() {
    const wsViewers = Array.from(this.sessions.values()).filter(s => s.role === 'viewer').length;
    const kvViewers = this.viewers.size;
    return wsViewers + kvViewers;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      try {
        session.ws.send(data);
      } catch (e) {
        // Connection might be closed
      }
    }
  }
}

// ============================================================
// Utilities
// ============================================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
