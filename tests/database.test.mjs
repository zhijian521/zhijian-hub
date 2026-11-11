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

    it('版本 3 的旧库能一路升到最新版本，房间数据不丢，阳台默认关', () => {
        const file = join(workdir, 'upgrade.db');

        // 造一个"版本 3"的库：拆掉版本 4 才有的两张表，并把版本 5 才加的
        // outdoor 列从 rooms 里一并去掉、版本号退回去，再正常打开一次，
        // 走的就是真实的 v3 → v4 → v5 迁移路径。
        // 少拆一步就会撞上 "duplicate column name: outdoor"，那是测试造错了库，
        // 不是迁移代码的问题。
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
        // 换表必须先关外键：openings 引用 rooms(id)，DROP 父表时开着外键会直接报错。
        old.exec('PRAGMA foreign_keys = OFF');
        old.exec(`
            CREATE TABLE rooms_v3 (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                x           REAL NOT NULL,
                y           REAL NOT NULL,
                width       REAL NOT NULL CHECK (width > 0),
                height      REAL NOT NULL CHECK (height > 0),
                sort_order  INTEGER NOT NULL,
                floor       TEXT
            );
            INSERT INTO rooms_v3 SELECT id, name, x, y, width, height, sort_order, floor FROM rooms;
            DROP TABLE rooms;
            ALTER TABLE rooms_v3 RENAME TO rooms;
            CREATE INDEX IF NOT EXISTS idx_rooms_order ON rooms(sort_order);
        `);
        old.exec('PRAGMA foreign_keys = ON');
        old.exec('PRAGMA user_version = 3');
        old.close();

        const db = openDatabase(file);
        assert.equal(Number(db.prepare('PRAGMA user_version').get().user_version), SCHEMA_VERSION);
        const room = db
            .prepare('SELECT name, floor, outdoor FROM rooms WHERE id = ?')
            .get('room-old');
        assert.equal(room.name, '主卧');
        assert.equal(room.floor, 'wood');
        assert.equal(Number(room.outdoor), 0, '旧房间升上来必须是室内，不能默认成阳台');
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

    it('版本 5 的旧库一路升到最新版本后，门与窗都还在，并且能存飘窗', () => {
        const file = join(workdir, 'openings-v5.db');

        // 造一个"版本 5"的库：openings 用版本 2 的老表结构（kind 只允许 door/window），
        // 版本号退到 5，再正常打开一次，走的就是真实的 v5 → v6 迁移路径。
        const old = openDatabase(file);
        old.prepare(
            'INSERT INTO floor_plan (id, name, room_seq, created_at) VALUES (?, ?, ?, ?)',
        ).run('singleton', '老家', 1, '2026-01-01');
        old.prepare(
            'INSERT INTO rooms (id, name, x, y, width, height, sort_order, floor, outdoor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('room-old', '主卧', 0, 0, 300, 200, 0, 'wood', 0);
        old.prepare(
            'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('open-door', 'room-old', 'door', 'top', 100, 54, 'start', 0);
        old.prepare(
            'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('open-window', 'room-old', 'window', 'bottom', 40, 90, 'start', 1);
        old.exec('PRAGMA foreign_keys = OFF');
        old.exec(`
            CREATE TABLE openings_v5 (
                id          TEXT PRIMARY KEY,
                room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                kind        TEXT NOT NULL CHECK (kind IN ('door', 'window')),
                wall        TEXT NOT NULL CHECK (wall IN ('top', 'right', 'bottom', 'left')),
                pos         REAL NOT NULL CHECK (pos >= 0),
                width       REAL NOT NULL CHECK (width > 0),
                hinge       TEXT NOT NULL DEFAULT 'start' CHECK (hinge IN ('start', 'end')),
                sort_order  INTEGER NOT NULL
            );
            INSERT INTO openings_v5 SELECT id, room_id, kind, wall, pos, width, hinge, sort_order FROM openings;
            DROP TABLE openings;
            ALTER TABLE openings_v5 RENAME TO openings;
        `);
        // 造库用的是当前代码，rooms 已经带 open_walls 列；要真的回到版本 5 的形状得先摘掉它，
        // 否则 v6 → v7 的 ALTER TABLE 会撞「duplicate column name」。
        old.exec('ALTER TABLE rooms DROP COLUMN open_walls');
        old.exec('PRAGMA foreign_keys = ON');
        old.exec('PRAGMA user_version = 5');
        old.close();

        const db = openDatabase(file);
        assert.equal(Number(db.prepare('PRAGMA user_version').get().user_version), SCHEMA_VERSION);
        const kept = db
            .prepare('SELECT kind FROM openings WHERE room_id = ? ORDER BY sort_order')
            .all('room-old')
            .map((row) => row.kind);
        assert.deepEqual(kept, ['door', 'window'], '迁移只能放宽约束，不能弄丢已有的门窗');
        // 迁移之后数据库自己也得能收下 'bay'，不再只靠 store 层放行。
        assert.doesNotThrow(() =>
            db
                .prepare(
                    'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                )
                .run('open-bay', 'room-old', 'bay', 'top', 90, 120, 'start', 2),
        );
        // 版本 8 给 openings 加了 swing 列，老图升上来一律朝内开。
        const swings = db
            .prepare('SELECT swing FROM openings WHERE room_id = ? ORDER BY sort_order')
            .all('room-old')
            .map((row) => row.swing);
        assert.deepEqual(swings, ['in', 'in', 'in'], '旧门口升上来必须默认内开');
        db.close();
    });

    it('版本 9 的飘窗进深能改，旧库升上来默认 26px', () => {
        const file = join(workdir, 'openings-v9.db');
        const db = openDatabase(file);
        db.prepare(
            'INSERT INTO floor_plan (id, name, room_seq, created_at) VALUES (?, ?, ?, ?)',
        ).run('singleton', '家', 1, '2026-01-01');
        db.prepare(
            'INSERT INTO rooms (id, name, x, y, width, height, sort_order, floor, outdoor, open_walls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('r1', '主卧', 0, 0, 300, 200, 0, 'wood', 0, '');

        // 不给 depth 就必须落默认值，老数据升上来也是这个路径。
        db.prepare(
            'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, swing, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('b1', 'r1', 'bay', 'top', 60, 120, 'start', 'in', 0);
        assert.equal(
            db.prepare('SELECT depth FROM openings WHERE id = ?').get('b1').depth,
            26,
            '缺省进深必须是 26px',
        );

        db.prepare('UPDATE openings SET depth = ? WHERE id = ?').run(40, 'b1');
        assert.equal(db.prepare('SELECT depth FROM openings WHERE id = ?').get('b1').depth, 40);
        db.close();
    });

    it('版本 8 的门开向能存外开，并且 CHECK 只认 in / out', () => {
        const file = join(workdir, 'openings-v8.db');
        const db = openDatabase(file);
        db.prepare(
            'INSERT INTO floor_plan (id, name, room_seq, created_at) VALUES (?, ?, ?, ?)',
        ).run('singleton', '家', 1, '2026-01-01');
        db.prepare(
            'INSERT INTO rooms (id, name, x, y, width, height, sort_order, floor, outdoor, open_walls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('r1', '主卧', 0, 0, 300, 200, 0, 'wood', 0, '');

        db.prepare(
            'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, swing, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run('d1', 'r1', 'door', 'top', 60, 54, 'start', 'out', 0);
        assert.equal(
            db.prepare('SELECT swing FROM openings WHERE id = ?').get('d1').swing,
            'out',
            '外开必须能写进库',
        );

        assert.throws(
            () =>
                db
                    .prepare(
                        'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, swing, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    )
                    .run('d2', 'r1', 'door', 'bottom', 60, 54, 'start', 'inside', 1),
            /CHECK constraint failed/,
            '开向只允许 in / out，脏值必须在库层面拦下',
        );
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
