import assert from "node:assert/strict";
import test from "node:test";

import { sendBarkPush } from "../worker/src/integrations/bark.js";

async function withCapturedFetch(run, handler) {
	const originalFetch = globalThis.fetch;
	const captured = [];
	globalThis.fetch = async (url, options) => {
		captured.push({ url: String(url), options });
		return handler();
	};
	try {
		return await run(captured);
	} finally {
		globalThis.fetch = originalFetch;
	}
}

test("sendBarkPush 默认发往公共服务器并携带标准字段", async () => {
	const result = await withCapturedFetch(async (captured) => {
		const result = await sendBarkPush(
			{},
			{ deviceKey: "key-abc", title: "测试", body: "hello", group: "edgechat:7" },
		);
		assert.equal(captured.length, 1);
		assert.equal(captured[0].url, "https://api.day.app/push");
		assert.equal(captured[0].options.method, "POST");
		assert.match(captured[0].options.headers["Content-Type"], /application\/json/);
		assert.deepEqual(JSON.parse(captured[0].options.body), {
			title: "测试",
			body: "hello",
			device_key: "key-abc",
			group: "edgechat:7",
			isArchive: "1",
		});
		return result;
	}, () => ({
		status: 200,
		text: async () => '{"code":200,"message":"success"}',
	}));

	assert.equal(result.status, 200);
	assert.equal(result.body, '{"code":200,"message":"success"}');
});

test("sendBarkPush 支持通过 BARK_SERVER_URL 覆盖自建服务器并去掉尾部斜杠", async () => {
	await withCapturedFetch(async (captured) => {
		await sendBarkPush(
			{ BARK_SERVER_URL: "https://bark.example.com/" },
			{ deviceKey: "key-abc", title: "T", body: "B" },
		);
		assert.equal(captured[0].url, "https://bark.example.com/push");
	}, () => ({ status: 200, text: async () => "{}" }));
});

test("sendBarkPush 非 2xx 状态原样返回,由调用方决定如何处理", async () => {
	const result = await withCapturedFetch(async (captured) => {
		const result = await sendBarkPush(
			{},
			{ deviceKey: "key-abc", title: "T", body: "B" },
		);
		assert.equal(captured.length, 1);
		return result;
	}, () => ({ status: 500, text: async () => "internal error" }));

	assert.equal(result.status, 500);
	assert.equal(result.body, "internal error");
});