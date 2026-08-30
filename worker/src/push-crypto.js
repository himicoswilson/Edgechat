// Web Push (RFC 8291 + VAPID) 纯 WebCrypto 实现 —— 无需额外依赖,Cloudflare Workers 原生兼容。
// 浏览器端 pushManager.subscribe(applicationServerKey) 与这里的加密互为对端。

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

export function rawBase64Url(value) {
	const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function concatBytes(...chunks) {
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

async function hkdfDerive(ikm, salt, info, bytes) {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "HKDF", hash: "SHA-256", salt, info },
		key,
		bytes * 8,
	);
	return new Uint8Array(bits);
}

export function generateVapidKeyPair() {
	return crypto.subtle
		.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])
		.then(async (keyPair) => {
			const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
			const publicRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
			return {
				publicKey: base64UrlEncode(new Uint8Array(publicRaw)),
				privateKey: JSON.stringify(privateJwk),
			};
		});
}

// WebCrypto ECDSA 返回 DER 编码的 r||s,JWT ES256 需要裸 64 字节 P1363 格式。
function derToRawSignature(der) {
	const bytes = new Uint8Array(der);
	let offset = 2;
	const readInteger = () => {
		let length = bytes[offset + 1];
		offset += 2;
		// 去除无符号整数的高位补零
		if (bytes[offset] === 0) {
			offset += 1;
			length -= 1;
		}
		const value = bytes.slice(offset, offset + length);
		offset += length;
		return value;
	};
	const r = readInteger();
	const s = readInteger();
	const raw = new Uint8Array(64);
	raw.set(r.slice(0, 32), 32 - r.length);
	raw.set(s.slice(0, 32), 64 - s.length);
	return raw;
}

export async function createVapidAuthorization({
	privateKey,
	publicKey,
	audience,
	subject,
	now = Date.now(),
}) {
	const privateJwk = JSON.parse(privateKey);
	const header = { typ: "JWT", alg: "ES256" };
	const claims = {
		aud: audience,
		exp: Math.floor(now / 1000) + 12 * 3600,
		sub: subject,
	};
	const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;
	const key = await crypto.subtle.importKey(
		"jwk",
		privateJwk,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			{ name: "ECDSA", hash: "SHA-256" },
			key,
			encoder.encode(signingInput),
		),
	);
	// WebCrypto 规范返回裸 r||s;WebKit 个别版本返回 DER,做一次兼容归一
	const rawSignature = signature.length === 64 ? signature : derToRawSignature(signature.buffer);
	return `vapid t=${signingInput}.${base64UrlEncode(rawSignature)}, k=${publicKey}`;
}

// RFC 8291 aes128gcm:应用服务器临时 ECDH 密钥 + HKDF + AES-128-GCM 加密 payload
export async function encryptWebPushPayload({
	subscription,
	applicationServerKey,
	payload,
}) {
	const uaPublicKey = rawBase64Url(subscription.keys.p256dh);
	const authSecret = rawBase64Url(subscription.keys.auth);
	const asPublicKey = rawBase64Url(applicationServerKey);

	const ecdh = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	);
	const ecdhPublicRaw = new Uint8Array(
		await crypto.subtle.exportKey("raw", ecdh.publicKey),
	);
	const asPublicKeyObj = await crypto.subtle.importKey(
		"raw",
		uaPublicKey,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	const ecdhSecret = new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: "ECDH", public: asPublicKeyObj },
			ecdh.privateKey,
			256,
		),
	);

	// 1. IKM = HKDF-Extract(auth_secret, ecdh_secret) 后 Expand(key_info)
	const keyInfo = concatBytes(
		encoder.encode("WebPush: info\x00"),
		uaPublicKey,
		asPublicKey,
	);
	const ikm = await hkdfDerive(ecdhSecret, authSecret, keyInfo, 32);

	// 2. 加密密钥与 nonce
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const prk = await hkdfDerive(
		ikm,
		salt,
		encoder.encode("Content-Encoding: aes128gcm\x00"),
		32,
	);
	const cek = await hkdfDerive(
		prk,
		salt,
		encoder.encode("Content-Encoding: aes128gcm\x00"),
		16,
	);
	const nonce = await hkdfDerive(
		prk,
		salt,
		encoder.encode("Content-Encoding: nonce\x00"),
		12,
	);

	// 3. payload 以 0x02 结尾(无 padding)
	const plaintext = concatBytes(
		encoder.encode(String(payload)),
		new Uint8Array([2]),
	);
	const aesKey = await crypto.subtle.importKey(
		"raw",
		cek,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: nonce, tagLength: 128 },
			aesKey,
			plaintext,
		),
	);

	// 4. 头:salt(16) + record size(4, 4096) + keyid 长度(1) + 服务器临时公钥(65)
	const header = new Uint8Array(16 + 4 + 1 + 65);
	header.set(salt, 0);
	header[16] = 0;
	header[17] = 0;
	header[18] = 16; // 4096 >> 8
	header[19] = 0;
	header[20] = 65;
	header.set(ecdhPublicRaw, 21);

	return {
		body: concatBytes(header, ciphertext),
		headers: {
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			TTL: "86400",
			Urgency: "normal",
		},
	};
}

export class PushSubscriptionGoneError extends Error {
	constructor(endpoint) {
		super("Push subscription is no longer valid");
		this.name = "PushSubscriptionGoneError";
		this.endpoint = endpoint;
	}
}

// RFC 2606 保留占位域名:Apple 的 web.push.apple.com 会拒绝(403 BadJwtToken),
// 用 Set 确保每个 isolate 只告警一次,避免随消息刷屏。
const PLACEHOLDER_VAPID_HOSTS = ["localhost", "example.com", "example.org", "example.net"];
const warnedVapidSubjects = new Set();

function warnPlaceholderVapidSubject(subject) {
	if (warnedVapidSubjects.has(subject)) {
		return;
	}
	warnedVapidSubjects.add(subject);
	console.warn(JSON.stringify({
		message: "vapid subject looks like a placeholder domain",
		subject,
		hint: "Apple 推送服务拒绝 @localhost/@example.com 等占位域名(403 BadJwtToken),请把 VAPID_SUBJECT 换成真实邮箱或网址后重新部署",
	}));
}

export async function sendPushNotification(env, subscription, payloadText) {
	if (
		!env.VAPID_PRIVATE_KEY ||
		!env.VAPID_PUBLIC_KEY ||
		!env.VAPID_SUBJECT
	) {
		return { skipped: true };
	}
	const rawSubject = String(env.VAPID_SUBJECT || "");
	let subjectHost = "";
	if (/^mailto:/i.test(rawSubject)) {
		subjectHost = rawSubject.replace(/^mailto:/i, "").split("@")[1] || "";
	} else if (/^https:\/\//i.test(rawSubject)) {
		subjectHost = rawSubject.replace(/^https:\/\//i, "").replace(/[/:].*$/, "");
	}
	subjectHost = subjectHost.toLowerCase();
	if (PLACEHOLDER_VAPID_HOSTS.includes(subjectHost)) {
		warnPlaceholderVapidSubject(env.VAPID_SUBJECT);
	}
	const audience = new URL(subscription.endpoint).origin;
	const authorization = await createVapidAuthorization({
		privateKey: env.VAPID_PRIVATE_KEY,
		publicKey: env.VAPID_PUBLIC_KEY,
		audience,
		subject: env.VAPID_SUBJECT,
	});
	const { body, headers } = await encryptWebPushPayload({
		subscription,
		applicationServerKey: env.VAPID_PUBLIC_KEY,
		payload: payloadText,
	});
	const response = await fetch(subscription.endpoint, {
		method: "POST",
		headers: {
			...headers,
			Authorization: authorization,
			"Content-Length": String(body.length),
			// Declarative Web Push:标记 payload 为可解析的通知 JSON,平台直接展示
			"Content-Type": "application/notification+json",
		},
		body,
	});
	const detail = await response.text().catch(() => "");
	if (response.status === 404 || response.status === 410) {
		throw new PushSubscriptionGoneError(subscription.endpoint);
	}
	if (!response.ok) {
		if (detail.includes("VapidPkHashMismatch")) {
			throw new Error(
				`Push service responded ${response.status}: ${detail} (订阅绑定旧 VAPID 密钥——脚本换了密钥后需在页面重新订阅:关闭再开启通知)`,
			);
		}
		throw new Error(`Push service responded ${response.status}: ${detail}`);
	}
	return {
		sent: true,
		status: response.status,
		body: detail.slice(0, 200),
		headers: Object.fromEntries(response.headers),
		requestContentType: "application/notification+json",
		requestPayload: payloadText.slice(0, 200),
	};
}

export function decodeVapidJwt(token) {
	const parts = String(token).split(".");
	if (parts.length !== 3) {
		return null;
	}
	return {
		header: JSON.parse(decoder.decode(rawBase64Url(parts[0]))),
		claims: JSON.parse(decoder.decode(rawBase64Url(parts[1]))),
	};
}