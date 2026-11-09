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

    it('拒绝版本高于程序的数据库', () => {
        const file = join(workdir, 'future.db');

        const db = openDatabase(file);
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
        db.close();

        assert.throws(() => openDatabase(file), /高于程序支持/);
    });
});
