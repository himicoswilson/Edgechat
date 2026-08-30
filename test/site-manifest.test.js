import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import { registerManifestRoute, createSiteManifest } from "../worker/src/api/site-manifest.js";

function createDb(siteSettings = {}) {
	return {
		prepare() {
			return {
				async all() {
					return {
						results: Object.entries(siteSettings).map(([setting_key, setting_value]) => ({
							setting_key,
							setting_value,
						})),
					};
				},
			};
		},
	};
}

test("后台配置了站点名称时 manifest 名称跟随,未配置回退 Edgechat", async () => {
	const app = new Hono();
	registerManifestRoute(app);

	const configured = await app.request("/manifest.webmanifest", {}, { DB: createDb({ site_name: "我的团队" }) });
	assert.equal(configured.status, 200);
	assert.equal(configured.headers.get("content-type"), "application/manifest+json");
	const manifest = await configured.json();
	assert.equal(manifest.name, "我的团队");
	assert.equal(manifest.short_name, "我的团队");
	assert.deepEqual(manifest.icons.map((icon) => icon.src), [
		"/icon-192.png",
		"/icon-512.png",
	]);

	const fallback = await app.request("/manifest.webmanifest", {}, { DB: createDb({}) });
	const fallbackManifest = await fallback.json();
	assert.equal(fallbackManifest.name, "Edgechat");
});

test("后台配置了站点图标时图标优先,超长名称截断", async () => {
	const app = new Hono();
	registerManifestRoute(app);

	const response = await app.request(
		"/manifest.webmanifest",
		{},
		{ DB: createDb({ site_name: "这是一个非常长的团队名称用于测试", site_icon_url: "/files/avatar-1" }) },
	);
	const manifest = await response.json();
	assert.equal(manifest.icons[0].src, "/files/avatar-1");
	assert.equal(manifest.short_name.length <= 12, true);
});

test("createSiteManifest 默认 fallback 输出合法结构", () => {
	const manifest = createSiteManifest({});
	assert.equal(manifest.name, "Edgechat");
	assert.equal(manifest.display, "standalone");
	assert.equal(Array.isArray(manifest.icons), true);
});