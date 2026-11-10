import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { SCHEMA_VERSION, openDatabase } = require('../src/main/database.cjs');

/*============================================================================
  database — 连接与迁移框架测试

  骨架阶段 schema 为空，这里守住的是迁移机制本身：
  能建库、能重复打开、遇到更高版本的库必须拒绝而不是硬着头皮打开。
============================================================================*/

const workdir = mkdtempSync(join(tmpdir(), 'zhijian-db-'));

after(() => {
    rmSync(workdir, { recursive: true, force: true });
});

describe('openDatabase', () => {
    it('新建内存库并写入 schema 版本', () => {
        const db = openDatabase(':memory:');
        const row = db.prepare('PRAGMA user_version').get();

        assert.equal(Number(row.user_version), SCHEMA_VERSION);
        db.close();
    });

    it('同一文件重复打开保持幂等', () => {
        const file = join(workdir, 'idempotent.db');

        const first = openDatabase(file);
        first.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY)');
        first.close();

        const second = openDatabase(file);
        const tables = second
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'probe'")
            .all();

        assert.equal(tables.length, 1, '重复打开不应重建或清空既有表');
        second.close();
    });

    it('开启外键约束与 WAL', () => {
        const db = openDatabase(join(workdir, 'pragmas.db'));

        assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys), 1);
        assert.equal(String(db.prepare('PRAGMA journal_mode').get().journal_mode), 'wal');
        db.close();
    });

    it('版本 3 的旧库能升到版本 4，房间数据不丢', () => {
        const file = join(workdir, 'upgrade.db');

        // 造一个"版本 3"的库：把版本 4 才有的两张表拆掉、把版本号退回去，
        // 再正常打开一次，走的就是真实的 v3 → v4 迁移路径。
        const old = openDatabase(file);
        // 注意：node:sqlite 的 exec() 不接受参数，占位符会被忽略（插入 NULL → NOT NULL 报错）。
        // 带参数一律走 prepare().run()。
        old.prepare(
            'INSERT INTO floor_plan (id, name, room_seq, created_at) VALUES (?, ?, ?, ?)',
        ).run('singleton', '老家', 1, '2026-01-01');
        old.prepare(
            'INSERT INTO rooms (id, name, x, y, width, height, sort_order, floor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('room-old', '主卧', 0, 0, 240, 180, 0, 'wood');
        old.exec('DROP TABLE items');
        old.exec('DROP TABLE storage');
        old.exec('PRAGMA user_version = 3');
        old.close();

        const db = openDatabase(file);
        assert.equal(Number(db.prepare('PRAGMA user_version').get().user_version), SCHEMA_VERSION);
        assert.equal(
            db.prepare('SELECT name FROM rooms WHERE id = ?').get('room-old').name,
            '主卧',
        );
        const tables = db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('storage', 'items')",
            )
            .all()
            .map((row) => row.name)
            .sort();
        assert.deepEqual(tables, ['items', 'storage']);
        db.close();
    });

    it('拒绝版本高于程序的数据库', () => {
        const file = join(workdir, 'future.db');

        const db = openDatabase(file);
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
        db.close();

        assert.throws(() => openDatabase(file), /高于程序支持/);
    });
});
