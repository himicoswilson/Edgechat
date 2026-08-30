#!/usr/bin/env node

// 生成 Web Push VAPID 密钥对,输出格式可直接配置到 GitHub Actions secrets:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
// 用法: node .github/scripts/generate-vapid-keys.mjs   (可传 SUBJECT 作为第一个参数,默认 mailto:admin@example.com)

import { generateVapidKeyPair } from "../../worker/src/push-crypto.js";

const subject = process.argv[2] || "mailto:admin@example.com";

generateVapidKeyPair().then(({ publicKey, privateKey }) => {
	console.log("请在 GitHub 仓库 Secrets 里配置以下三个值:\n");
	console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
	console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
	console.log(`VAPID_SUBJECT=${subject}\n`);
	console.log("(建议将 VAPID_SUBJECT 改为你的联系邮箱,推送服务需要可联系的所有者)");
}).catch((error) => {
	console.error(error);
	process.exit(1);
});