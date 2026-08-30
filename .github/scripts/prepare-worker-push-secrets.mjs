#!/usr/bin/env node

// 把 GitHub secrets 中的 VAPID 推送配置写入 wrangler --secrets-file。
// 未配置 VAPID_PRIVATE_KEY 时跳过(推送功能保持关闭),不生成文件。

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SECRETS_FILE = process.env.EDGECHAT_PUSH_SECRETS_FILE || ".tmp/worker-push-secrets.json";

const values = {
	VAPID_PUBLIC_KEY: process.env.EDGECHAT_VAPID_PUBLIC_KEY || "",
	VAPID_PRIVATE_KEY: process.env.EDGECHAT_VAPID_PRIVATE_KEY || "",
	VAPID_SUBJECT: process.env.EDGECHAT_VAPID_SUBJECT || "",
};

if (!values.VAPID_PRIVATE_KEY) {
	console.log("VAPID secrets are not configured; push notifications stay disabled.");
	process.exit(0);
}

for (const value of Object.values(values)) {
	if (!value) {
		console.error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT must all be set together.");
		process.exit(1);
	}
}

for (const value of Object.values(values)) {
	console.log(`::add-mask::${value}`);
}
mkdirSync(dirname(SECRETS_FILE), { recursive: true });
writeFileSync(SECRETS_FILE, JSON.stringify(values), { mode: 0o600 });
console.log(`VAPID push secrets will be deployed from ${SECRETS_FILE}.`);