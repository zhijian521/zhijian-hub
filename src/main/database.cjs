/*============================================================================
  database — SQLite 连接与 schema 迁移

  用 Electron 内置 Node 的 `node:sqlite`，不引入 better-sqlite3：
  原生模块要按 Electron ABI 重新编译，多一套 MSVC 工具链依赖，收益为零。

  schema 版本记在 `PRAGMA user_version`，迁移按版本递进。
  当前版本 3：户型图（单套）+ 房间 + 墙上的门窗 + 房间地面材质。
============================================================================*/

const { DatabaseSync } = require('node:sqlite');

/** 当前 schema 版本。新增表或列时 +1，并在 MIGRATIONS 里补一段。 */
const SCHEMA_VERSION = 3;

/**
 * 版本 1：户型图与房间。
 *
 * 只支持单套户型，用 `CHECK (id = 'singleton')` 在库层面锁死，
 * 避免"两套户型并存"这种状态被代码疏漏写进去。
 * 房间用手绘矩形，坐标是画板绝对坐标；序号 room_seq 只增不减，
 * 撤销或删除都不回收，保证"房间 3"不会被重复使用。
 */
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS floor_plan (
    id          TEXT PRIMARY KEY CHECK (id = 'singleton'),
    name        TEXT NOT NULL,
    room_seq    INTEGER NOT NULL DEFAULT 0 CHECK (room_seq >= 0),
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    width       REAL NOT NULL CHECK (width > 0),
    height      REAL NOT NULL CHECK (height > 0),
    sort_order  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_order ON rooms(sort_order);
`;

/**
 * 版本 2：墙上的门窗洞。
 *
 * 洞口挂在一面墙上，用「沿墙起点的位置 + 宽度」描述，而不是绝对坐标 ——
 * 房间移动或缩放时洞口自然跟着走，不需要同步改写。
 * `wall` 的四个方向以房间矩形为准：top/bottom 从左端起算，left/right 从上端起算。
 * 房间删除时洞口级联删除，靠 `PRAGMA foreign_keys = ON` 生效。
 */
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS openings (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('door', 'window')),
    wall        TEXT NOT NULL CHECK (wall IN ('top', 'right', 'bottom', 'left')),
    pos         REAL NOT NULL CHECK (pos >= 0),
    width       REAL NOT NULL CHECK (width > 0),
    hinge       TEXT NOT NULL DEFAULT 'start' CHECK (hinge IN ('start', 'end')),
    sort_order  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openings_room ON openings(room_id);
`;

/**
 * 版本 3：房间地面材质。
 *
 * NULL 表示「未指定」，由房间名自动推断（卧室木地板、厨卫小砖）；
 * 用户手动选过之后写入具体值，此后改名不再影响地面。
 * SQLite 的 ALTER TABLE 加不了带 CHECK 的列，枚举校验放在 store 层。
 */
const SCHEMA_V3 = `ALTER TABLE rooms ADD COLUMN floor TEXT;`;

/**
 * 迁移脚本按版本号顺序执行：`MIGRATIONS[n]` 把库从版本 n 升到 n + 1。
 * 只向前迁移，不写回退逻辑（回退靠备份文件）。
 * @type {Array<(db: import('node:sqlite').DatabaseSync) => void>}
 */
const MIGRATIONS = [
    (db) => db.exec(SCHEMA_V1),
    (db) => db.exec(SCHEMA_V2),
    (db) => db.exec(SCHEMA_V3),
];

/**
 * 打开数据库并确保 schema 已就绪。
 * @param {string} file 文件路径；自检可传 ':memory:'
 */
function openDatabase(file) {
    const db = new DatabaseSync(file);

    try {
        // WAL：读写不互相阻塞；断电后靠 WAL 回放恢复，比单独 rollback journal 稳。
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA foreign_keys = ON');
        db.exec('PRAGMA synchronous = NORMAL');

        migrate(db);
        return db;
    } catch (error) {
        // 迁移失败必须关掉连接：否则文件句柄悬着，备份、删除、重开都会被系统拦住。
        db.close();
        throw error;
    }
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
function migrate(db) {
    const row = db.prepare('PRAGMA user_version').get();
    const current = Number(row?.user_version ?? 0);

    if (current > SCHEMA_VERSION) {
        throw new Error(`数据库版本 ${current} 高于程序支持的 ${SCHEMA_VERSION}，请升级应用`);
    }
    if (current === SCHEMA_VERSION) return;

    db.exec('BEGIN');
    try {
        for (let version = current; version < SCHEMA_VERSION; version += 1) {
            MIGRATIONS[version](db);
        }
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

module.exports = { SCHEMA_VERSION, openDatabase };
