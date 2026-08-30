// Bark iOS 推送(Finb/bark)。默认走公共服务器 api.day.app,
// 自建 bark-server 的实例可通过环境变量 BARK_SERVER_URL 覆盖服务器地址。
// API V2:POST {server}/push,body {title, body, device_key, group, ...}
const DEFAULT_BARK_SERVER = "https://api.day.app";

export async function sendBarkPush(env, { deviceKey, title, body, group, icon }) {
	const server = String(env?.BARK_SERVER_URL || "").trim().replace(/\/+$/, "") || DEFAULT_BARK_SERVER;
	const payload = {
		title,
		body,
		device_key: deviceKey,
		group,
		isArchive: "1",
		...(icon ? { icon } : {}),
	};
	const response = await fetch(`${server}/push`, {
		method: "POST",
		headers: { "Content-Type": "application/json; charset=utf-8" },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(5000),
	});
	const responseBody = await response.text();
	return {
		status: response.status,
		body: responseBody,
		requestPayload: JSON.stringify(payload),
	};
}