import { getSiteSettings } from "../data/site-settings.js";

// PWA 安装元数据由后台站点配置动态生成:名称与图标跟随 admin 设置,
// 而不是 manifest 静态写死。响应 Content-Type 必须是 application/manifest+json。
export function createSiteManifest({ siteName = "Edgechat", siteIconUrl = "" } = {}) {
	const name = String(siteName || "Edgechat").trim() || "Edgechat";
	const icons = [];
	if (siteIconUrl) {
		icons.push({ src: siteIconUrl, sizes: "any", type: "image/*" });
	}
	icons.push(
		{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
		{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
	);
	return {
		name,
		// iOS 安装名上限 12 字符,超长截断
		short_name: name.slice(0, 12),
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#f6f7f8",
		theme_color: "#f6f7f8",
		description: "基于 Cloudflare 的团队沟通与协作空间",
		icons,
	};
}

export function registerManifestRoute(app) {
	app.get("/manifest.webmanifest", async (c) => {
		const site = await getSiteSettings(c.env.DB);
		const manifest = createSiteManifest(site);
		return new Response(JSON.stringify(manifest), {
			headers: {
				"content-type": "application/manifest+json",
				"cache-control": "public, max-age=300",
			},
		});
	});
}