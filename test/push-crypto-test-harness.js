// 测试辅助:复用 worker/src/push-crypto.js 的公开实现,并实现浏览器侧镜像解密函数,
// 用于自证加密闭环(RFC 8291 对端)。
import {
	createVapidAuthorization,
	encryptWebPushPayload,
	generateVapidKeyPair,
	rawBase64Url,
} from "../worker/src/push-crypto.js";

export {
	createVapidAuthorization,
	encryptWebPushPayload,
	generateVapidKeyPair,
	rawBase64Url,
};

function base64UrlEncode(bytes) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// 浏览器 PushSubscription 等价物:ECDH P-256 密钥对(raw 公钥 65B + JWK 私钥)
export async function generateUserKeyPair() {
	const keyPair = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	);
	const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
	const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
	return {
		publicKey: base64UrlEncode(publicRaw),
		privateKey: JSON.stringify(privateJwk),
	};
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

// 浏览器 PushSubscription 保存的端点解密(纯 WebCrypto 镜像)
export async function decryptWebPushPayload({
	encryptedBody,
	userPrivateJwk,
	userPublicKey,
	applicationServerKey,
	authSecret,
}) {
	const body = new Uint8Array(encryptedBody);
	const salt = body.slice(0, 16);
	const keyIdLength = body[20];
	const serverPublicRaw = body.slice(21, 21 + keyIdLength);
	const ciphertext = body.slice(21 + keyIdLength);

	const uaPublicRaw = rawBase64Url(userPublicKey);

	const serverPublicKey = await crypto.subtle.importKey(
		"raw",
		serverPublicRaw,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	const userPrivateKey = await crypto.subtle.importKey(
		"jwk",
		JSON.parse(userPrivateJwk),
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		["deriveBits"],
	);
	const sharedSecret = new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: "ECDH", public: serverPublicKey },
			userPrivateKey,
			256,
		),
	);

	const asPublicRaw = rawBase64Url(applicationServerKey);
	const keyInfo = concatBytes(
		encoder.encode("WebPush: info\x00"),
		uaPublicRaw,
		asPublicRaw,
	);
	const ikm = await hkdfDerive(sharedSecret, rawBase64Url(authSecret), keyInfo, 32);
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

	const aesKey = await crypto.subtle.importKey(
		"raw",
		cek,
		{ name: "AES-GCM" },
		false,
		["decrypt"],
	);
	const plaintext = new Uint8Array(
		await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: nonce, tagLength: 128 },
			aesKey,
			ciphertext,
		),
	);
	// 去掉末尾 0x02 padding 分隔符
	return decoder.decode(plaintext.slice(0, plaintext.length - 1));
}
