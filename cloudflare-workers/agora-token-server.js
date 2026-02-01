/**
 * Agora RTC Token Server for Cloudflare Workers
 *
 * This implements Agora's official RtcTokenBuilder2 algorithm for generating
 * RTC tokens compatible with Agora SDK 4.x+
 *
 * Deploy this to Cloudflare Workers and set your APP_ID and APP_CERTIFICATE
 * as environment variables (secrets) in the Cloudflare dashboard.
 */

// These should be set as environment variables in Cloudflare Workers
// For testing, you can hardcode them, but use env vars in production
const APP_ID = 'REDACTED_AGORA_APP_ID';
const APP_CERTIFICATE = 'REDACTED_AGORA_CERTIFICATE';

// Privilege constants
const PRIVILEGES = {
  JOIN_CHANNEL: 1,
  PUBLISH_AUDIO_STREAM: 2,
  PUBLISH_VIDEO_STREAM: 3,
  PUBLISH_DATA_STREAM: 4,
};

export default {
  async fetch(request, env) {
    // Use env vars if available, fallback to constants
    const appId = env?.AGORA_APP_ID || APP_ID;
    const appCertificate = env?.AGORA_APP_CERTIFICATE || APP_CERTIFICATE;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const channel = url.searchParams.get('channel');
    const role = url.searchParams.get('role') || 'subscriber';
    const uidParam = url.searchParams.get('uid');

    if (!channel) {
      return jsonResponse({ error: 'Missing channel parameter' }, 400);
    }

    // UID: 0 means Agora will assign one, or use provided UID
    const uid = uidParam ? parseInt(uidParam, 10) : 0;
    const expireSeconds = 3600; // 1 hour

    try {
      const token = await buildTokenWithUid(
        appId,
        appCertificate,
        channel,
        uid,
        role === 'publisher' ? 'publisher' : 'subscriber',
        expireSeconds
      );

      return jsonResponse({
        token: token,
        appId: appId,
        channel: channel,
        uid: uid
      });
    } catch (err) {
      console.error('Token generation error:', err);
      return jsonResponse({ error: err.message, stack: err.stack }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Build RTC token with UID (Agora RtcTokenBuilder2 equivalent)
 */
async function buildTokenWithUid(appId, appCertificate, channelName, uid, role, tokenExpireSeconds) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const tokenExpireTs = currentTimestamp + tokenExpireSeconds;
  const privilegeExpireTs = tokenExpireTs; // Same as token expiry

  // Create AccessToken
  const token = new AccessToken(appId, appCertificate, currentTimestamp, tokenExpireSeconds);

  // Set service for RTC
  const serviceRtc = new ServiceRtc(channelName, uid);

  // Set privileges based on role
  serviceRtc.addPrivilege(PRIVILEGES.JOIN_CHANNEL, privilegeExpireTs);

  if (role === 'publisher') {
    serviceRtc.addPrivilege(PRIVILEGES.PUBLISH_AUDIO_STREAM, privilegeExpireTs);
    serviceRtc.addPrivilege(PRIVILEGES.PUBLISH_VIDEO_STREAM, privilegeExpireTs);
    serviceRtc.addPrivilege(PRIVILEGES.PUBLISH_DATA_STREAM, privilegeExpireTs);
  }

  token.addService(serviceRtc);

  return await token.build();
}

/**
 * AccessToken class - implements Agora's token format
 */
class AccessToken {
  constructor(appId, appCertificate, issueTs, expire) {
    this.appId = appId;
    this.appCertificate = appCertificate;
    this.issueTs = issueTs;
    this.expire = expire;
    this.salt = Math.floor(Math.random() * 0xFFFFFFFF);
    this.services = {};
  }

  addService(service) {
    this.services[service.type] = service;
  }

  async build() {
    const signing = await this.buildSigning();
    const data = this.buildData();

    // Combine signing + data and compress
    const content = new Uint8Array(signing.length + data.length);
    content.set(signing, 0);
    content.set(data, signing.length);

    // Compress using deflate
    const compressed = await compress(content);

    // Version prefix + appId + base64(compressed)
    const version = '007';
    return version + this.appId + base64EncodeBytes(compressed);
  }

  async buildSigning() {
    const data = this.buildData();
    const signature = await hmacSha256(this.appCertificate, data);

    // Pack: signature_length(2 bytes) + signature + crc32_of_data(4 bytes)
    const sigBytes = new Uint8Array(signature);
    const crc = crc32Bytes(data);

    const buffer = new ByteBuffer();
    buffer.writeUint16(sigBytes.length);
    buffer.writeBytes(sigBytes);
    buffer.writeUint32(crc);

    return buffer.toBytes();
  }

  buildData() {
    const buffer = new ByteBuffer();

    // Pack header
    buffer.writeUint32(this.issueTs);
    buffer.writeUint32(this.expire);
    buffer.writeUint32(this.salt);

    // Pack services count
    buffer.writeUint16(Object.keys(this.services).length);

    // Pack each service
    for (const type in this.services) {
      const service = this.services[type];
      buffer.writeUint16(service.type);
      buffer.writeBytes(service.pack());
    }

    return buffer.toBytes();
  }
}

/**
 * ServiceRtc - RTC service privileges
 */
class ServiceRtc {
  constructor(channelName, uid) {
    this.type = 1; // SERVICE_TYPE_RTC
    this.channelName = channelName;
    this.uid = uid.toString();
    this.privileges = {};
  }

  addPrivilege(privilege, expireTs) {
    this.privileges[privilege] = expireTs;
  }

  pack() {
    const buffer = new ByteBuffer();

    // Pack channel name
    buffer.writeString(this.channelName);

    // Pack UID as string
    buffer.writeString(this.uid);

    // Pack privileges count
    buffer.writeUint16(Object.keys(this.privileges).length);

    // Pack each privilege
    for (const priv in this.privileges) {
      buffer.writeUint16(parseInt(priv));
      buffer.writeUint32(this.privileges[priv]);
    }

    return buffer.toBytes();
  }
}

/**
 * ByteBuffer helper for binary packing
 */
class ByteBuffer {
  constructor() {
    this.buffer = [];
  }

  writeUint16(value) {
    this.buffer.push(value & 0xFF);
    this.buffer.push((value >> 8) & 0xFF);
  }

  writeUint32(value) {
    this.buffer.push(value & 0xFF);
    this.buffer.push((value >> 8) & 0xFF);
    this.buffer.push((value >> 16) & 0xFF);
    this.buffer.push((value >> 24) & 0xFF);
  }

  writeString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.writeUint16(bytes.length);
    for (const b of bytes) {
      this.buffer.push(b);
    }
  }

  writeBytes(bytes) {
    for (const b of bytes) {
      this.buffer.push(b);
    }
  }

  toBytes() {
    return new Uint8Array(this.buffer);
  }
}

/**
 * HMAC-SHA256 using Web Crypto API
 */
async function hmacSha256(key, data) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return new Uint8Array(signature);
}

/**
 * CRC32 for byte arrays
 */
function crc32Bytes(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Compress using deflate (zlib raw)
 */
async function compress(data) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();

  const chunks = [];
  const reader = cs.readable.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Base64 encode byte array
 */
function base64EncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
