import assert from "node:assert/strict";
import test from "node:test";

import {
	createVapidAuthorization,
	decryptWebPushPayload,
	encryptWebPushPayload,
	generateUserKeyPair,
	generateVapidKeyPair,
} from "./push-crypto-test-harness.js";

test("VAPID 授权头携带可验证的 ES256 JWT", async () => {
	const { publicKey, privateKey } = await generateVapidKeyPair();
	const authorization = await createVapidAuthorization({
		privateKey,
		publicKey,
		audience: "https://push.example.com",
		subject: "mailto:admin@example.com",
	});
	assert.match(authorization, /^vapid t=[^,]+\.([^,]+)\.([^,]+), k=/);
	const token = authorization.split("t=")[1].split(", k=")[0];
	const [headerPart, claimsPart] = token.split(".");
	assert.deepEqual(JSON.parse(atob(headerPart)), { typ: "JWT", alg: "ES256" });
	const claims = JSON.parse(atob(claimsPart));
	assert.equal(claims.aud, "https://push.example.com");
	assert.equal(claims.sub, "mailto:admin@example.com");
	assert.ok(claims.exp > Math.floor(Date.now() / 1000));
});

test("RFC 8291 payload 加密可用用户侧密钥解密还原明文(自证闭环)", async () => {
	// 用户侧密钥对(浏览器 PushSubscription 等价物)
	const userKeys = await generateUserKeyPair();
	const applicationServerKey = (await generateVapidKeyPair()).publicKey;

	const subscription = {
		endpoint: "https://push.example.com/some-endpoint",
		keys: {
			p256dh: userKeys.publicKey,
			auth: userKeys.publicKey.slice(0, 24),
		},
	};

	const payload = JSON.stringify({ title: "新消息", body: "你好" });
	const encrypted = await encryptWebPushPayload({
		subscription,
		applicationServerKey,
		payload,
	});

	// 验证头结构:salt(16) + rs(4) + keyid_len(1) + keyid(65)
	assert.equal(encrypted.body.length > 16 + 4 + 1 + 65, true);
	assert.equal(encrypted.headers["Content-Encoding"], "aes128gcm");

	const plaintext = await decryptWebPushPayload({
		encryptedBody: encrypted.body,
		userPrivateJwk: userKeys.privateKey,
		userPublicKey: userKeys.publicKey,
		applicationServerKey,
		authSecret: subscription.keys.auth,
	});
	assert.equal(plaintext, payload);
});

test("订阅 p256dh/auth 非法时加密抛错而非静默", async () => {
	const applicationServerKey = (await generateVapidKeyPair()).publicKey;
	await assert.rejects(
		encryptWebPushPayload({
			subscription: {
				endpoint: "https://push.example.com/x",
				keys: { p256dh: "not-a-key", auth: "!!!" },
			},
			applicationServerKey,
			payload: "hi",
		}),
	);
});