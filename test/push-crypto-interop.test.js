import assert from "node:assert/strict";
import test from "node:test";
import {
	createDecipheriv,
	createECDH,
	hkdfSync,
	randomBytes,
} from "node:crypto";

import { encryptWebPushPayload } from "../worker/src/push-crypto.js";

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

// RFC 8188/8291 独立接收方实现:只用 node:crypto 原语按规范步骤解密,
// 不复用 worker/src/push-crypto.js 的任何派生逻辑,验证与真实浏览器互通。
test("RFC 8188 独立实现可解密我们加密的 payload", async () => {
	const ua = createECDH("prime256v1");
	ua.generateKeys();
	const uaPublicRaw = ua.getPublicKey();
	assert.equal(uaPublicRaw.length, 65);
	const authSecret = randomBytes(16);
	const appServer = createECDH("prime256v1");
	appServer.generateKeys();
	const appServerKeyRaw = appServer.getPublicKey();
	const payload = JSON.stringify({ title: "hi", body: "hello", tag: "dm:96", url: "/" });

	const subscription = {
		endpoint: "https://fcm.googleapis.com/fcm/send/test",
		keys: { p256dh: b64url(uaPublicRaw), auth: b64url(authSecret) },
	};
	const { body, headers } = await encryptWebPushPayload({
		subscription,
		applicationServerKey: b64url(appServerKeyRaw),
		payload,
	});
	assert.equal(headers["Content-Encoding"], "aes128gcm");

	// ---- 接收方按 RFC 8188 §2 / RFC 8291 §3.4 逐步处理 ----
	const salt = body.subarray(0, 16);
	const rs = (body[16] << 24) | (body[17] << 16) | (body[18] << 8) | body[19];
	const idLen = body[20];
	const serverPublicRaw = body.subarray(21, 21 + idLen);
	assert.equal(rs, 4096, "rs 应为 4096");
	assert.equal(idLen, 65, "keyid 应为服务器临时公钥 65B");

	const ciphertext = body.subarray(21 + idLen);
	const sharedSecret = ua.computeSecret(serverPublicRaw);

	const keyInfo = Buffer.concat([
		Buffer.from("WebPush: info\x00"),
		uaPublicRaw,
		appServerKeyRaw,
	]);
	const ikm = hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32);
	const prk = hkdfSync(
		"sha256",
		ikm,
		salt,
		Buffer.from("Content-Encoding: aes128gcm\x00"),
		32,
	);
	const cek = hkdfSync(
		"sha256",
		prk,
		salt,
		Buffer.from("Content-Encoding: aes128gcm\x00"),
		16,
	);
	const nonce = hkdfSync(
		"sha256",
		prk,
		salt,
		Buffer.from("Content-Encoding: nonce\x00"),
		12,
	);

	const tag = ciphertext.subarray(-16);
	const data = ciphertext.subarray(0, -16);
	const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);

	assert.equal(plaintext[plaintext.length - 1], 0x02, "末字节应为 padding 分隔符 0x02");
	const message = plaintext.subarray(0, -1).toString("utf8");
	assert.deepEqual(JSON.parse(message), { title: "hi", body: "hello", tag: "dm:96", url: "/" });
});