/**
 * Agora RTC Token Server for Cloudflare Workers
 * Uses the official agora-token npm package
 */

import { RtcTokenBuilder, RtcRole } from 'agora-token';

const APP_ID = 'REDACTED_AGORA_APP_ID';
const APP_CERTIFICATE = 'REDACTED_AGORA_CERTIFICATE';

export default {
  async fetch(request, env) {
    const appId = env?.AGORA_APP_ID || APP_ID;
    const appCertificate = env?.AGORA_APP_CERTIFICATE || APP_CERTIFICATE;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const channel = url.searchParams.get('channel');
    const role = url.searchParams.get('role') || 'subscriber';
    const uid = parseInt(url.searchParams.get('uid') || '0', 10);

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

      return jsonResponse({ token, appId, channel, uid });
    } catch (err) {
      console.error('Token generation error:', err);
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
