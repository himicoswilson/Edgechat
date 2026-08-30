import assert from "node:assert/strict";
import test from "node:test";

import { normalizePushSubscription } from "../frontend/src/api.js";

test("keys 属性可用时原样传递", () => {
	const sub = {
		endpoint: "https://push.example.com/1",
		keys: { p256dh: "p256dh-value", auth: "auth-value" },
	};
	assert.deepEqual(normalizePushSubscription(sub), {
		endpoint: "https://push.example.com/1",
		keys: { p256dh: "p256dh-value", auth: "auth-value" },
	});
});

test("keys 缺失时退化为 getKey() 读取(Safari iOS 怪癖)", () => {
	const sub = {
		endpoint: "https://push.example.com/2",
		getKey(type) {
			if (type === "p256dh") {
				return Uint8Array.from([0, 1, 2]).buffer;
			}
			if (type === "auth") {
				return Uint8Array.from([3, 4]).buffer;
			}
			return null;
		},
	};
	assert.deepEqual(normalizePushSubscription(sub), {
		endpoint: "https://push.example.com/2",
		keys: { p256dh: "AAEC", auth: "AwQ" },
	});
});