#!/usr/bin/env node

// 生成 Web Push VAPID 密钥对,输出格式可直接配置到 GitHub Actions secrets:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
// 用法: node .github/scripts/generate-vapid-keys.mjs "mailto:you@your-real-domain.com"
//
// 注意:VAPID_SUBJECT 必须是真实可用的邮箱或网址。Apple 的 web.push.apple.com
// 会拒绝 @localhost/@example.com 等占位域名(返回 403 BadJwtToken),FCM/Chrome 不查。

import { generateVapidKeyPair } from "../../worker/src/push-crypto.js";

// RFC 2606 保留占位域名,Apple 全部拒绝
const PLACEHOLDER_HOSTS = ["localhost", "example.com", "example.org", "example.net"];

function extractSubjectHost(subject) {
	const raw = String(subject || "");
	if (/^mailto:/i.test(raw)) {
		return raw.replace(/^mailto:/i, "").split("@")[1] || "";
	}
	if (/^https:\/\//i.test(raw)) {
		return raw.replace(/^https:\/\//i, "").replace(/[/:].*$/, "");
	}
	return "";
}

const subject = process.argv[2] || "";
if (!subject) {
	console.error("必须提供 VAPID_SUBJECT,例如: mailto:admin@你的真实域名.com");
	process.exit(1);
}
if (extractSubjectHost(subject) === "") {
	console.error("VAPID_SUBJECT 必须以 mailto: 或 https:// 开头,例如 mailto:admin@you.com");
	process.exit(1);
}
const host = extractSubjectHost(subject).toLowerCase();
if (PLACEHOLDER_HOSTS.includes(host)) {
	console.error(`VAPID_SUBJECT 使用了占位域名 ${host},Apple 推送服务会拒绝(403 BadJwtToken)。请使用真实邮箱或网址。`);
	process.exit(1);
}

generateVapidKeyPair().then(({ publicKey, privateKey }) => {
	console.log("请在 GitHub 仓库 Secrets 里配置以下三个值:\n");
	console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
	console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
	console.log(`VAPID_SUBJECT=${subject}\n`);
	console.log("(VAPID_SUBJECT 需真实可联系,推送服务可能据此联系站点所有者)");
}).catch((error) => {
	console.error(error);
	process.exit(1);
});