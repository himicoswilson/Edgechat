import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import initSqlJs from "sql.js";

import { registerChannelRoutes } from "../worker/src/api/channels.js";

const repositoryRoot = new URL("../", import.meta.url);
const schemaSql = readFileSync(
	new URL("worker/schema.sql", repositoryRoot),
	"utf8",
);
const SQL = await initSqlJs({
	locateFile(file) {
		return fileURLToPath(new URL(`../node_modules/sql.js/dist/${file}`, import.meta.url));
	},
});

function createRealDb() {
	const db = new SQL.Database();
	db.exec("PRAGMA foreign_keys = ON;");
	db.exec(schemaSql);
	db.exec(`
		INSERT INTO users (id, username, display_name, password_hash, password_salt, is_admin)
		VALUES (1, 'alice', 'Alice', 'hash', 'salt', 1);
	`);
	return db;
}

function createD1Adapter(sqlJsDb) {
	return {
		prepare(sql) {
			const statement = {
				sql,
				binds: [],
				bind(...binds) {
					statement.binds = binds;
					return statement;
				},
				async all() {
					const stmt = sqlJsDb.prepare(sql);
					try {
						stmt.bind(statement.binds);
						const results = [];
						while (stmt.step()) {
							results.push(stmt.getAsObject());
						}
						return { results };
					} finally {
						stmt.free();
					}
				},
				async first() {
					const { results } = await statement.all();
					return results[0];
				},
				async run() {
					sqlJsDb.run(sql, statement.binds);
					return { meta: { last_row_id: sqlJsDb.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] } };
				},
			};
			return statement;
		},
		async batch(batchStatements) {
			for (const statement of batchStatements) {
				sqlJsDb.run(statement.sql, statement.binds);
			}
			return [];
		},
	};
}

function createRouteHarness(db) {
	const app = new Hono();
	app.use("*", async (c, next) => {
		c.set("session", { userId: 1, displayName: "Alice", isAdmin: true });
		await next();
	});
	app.onError((error) => {
		throw new Error(`route failed: ${error.message}`);
	});
	registerChannelRoutes(app);
	return {
		async request(path, init) {
			return app.fetch(new Request(`https://example.com${path}`, init), {
				DB: createD1Adapter(db),
			});
		},
	};
}

function createGroup(harness, name, kind) {
	return harness.request("/api/channels", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name, kind }),
	});
}

test("软删除群组释放名称：删除后同名可重新创建（公开/私有不限）", async () => {
	const db = createRealDb();
	const harness = createRouteHarness(db);

	const first = await createGroup(harness, "test", "private");
	assert.equal(first.status, 200);
	const firstChannelId = (await first.json()).channel.id;

	const remove = await harness.request(`/api/channels/${firstChannelId}`, { method: "DELETE" });
	assert.equal(remove.status, 200);
	assert.equal(
		db.exec(`SELECT deleted_at FROM channels WHERE id = ${firstChannelId}`)[0].values[0][0] === null,
		false,
	);

	const recreate = await createGroup(harness, "test", "public");
	assert.equal(recreate.status, 200);
	assert.equal(
		db.exec("SELECT COUNT(*) FROM channels WHERE name = 'test' AND deleted_at IS NULL")[0].values[0][0],
		1,
	);
	// 旧软删除行被改名让位，数据保留
	assert.equal(
		db.exec(`SELECT name FROM channels WHERE id = ${firstChannelId}`)[0].values[0][0].startsWith("deleted:"),
		true,
	);

	// 活跃同名仍被拒绝
	const dup = await createGroup(harness, "test", "private");
	assert.equal(dup.status, 400);
	assert.deepEqual(await dup.json(), { error: "群组名称已存在" });

	db.close();
});

test("改名为已删除群组的名称同样允许", async () => {
	const db = createRealDb();
	const harness = createRouteHarness(db);

	const old = await createGroup(harness, "old", "private");
	const oldChannelId = (await old.json()).channel.id;
	const tmp = await createGroup(harness, "tmp", "private");
	const tmpChannelId = (await tmp.json()).channel.id;
	await harness.request(`/api/channels/${tmpChannelId}`, { method: "DELETE" });

	const rename = await harness.request(`/api/channels/${oldChannelId}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "tmp" }),
	});
	assert.equal(rename.status, 200);
	assert.equal(
		db.exec(`SELECT name FROM channels WHERE id = ${oldChannelId}`)[0].values[0][0],
		"tmp",
	);

	db.close();
});