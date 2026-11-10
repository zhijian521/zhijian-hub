/*============================================================================
  database — SQLite 连接与 schema 迁移

  用 Electron 内置 Node 的 `node:sqlite`，不引入 better-sqlite3：
  原生模块要按 Electron ABI 重新编译，多一套 MSVC 工具链依赖，收益为零。

  schema 版本记在 `PRAGMA user_version`，迁移按版本递进。
  当前版本 6：房间（含户外标记）、洞口（门/窗/飘窗）、储物设备与物品。
============================================================================*/

const { DatabaseSync } = require('node:sqlite');

/** 当前 schema 版本。新增表或列时 +1，并在 MIGRATIONS 里补一段。 */
const SCHEMA_VERSION = 6;

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
 * 版本 4：储物设备与物品。
 *
 * 层级是「房间 → 储物设备 → 物品」，但物品的 room_id 是必填的：
 *   · 物品一定在某个房间里 —— 这是"搜到就能去拿到"的底线；
 *   · storage_id 可空 —— 柜子拆了、物品先随手放在房间各处，仍然能定位到房间。
 * 所以删储物设备用 ON DELETE SET NULL，物品留在原来的房间里，不会凭空消失。
 *
 * 物品分类在这里只是文本约束（枚举校验放 store 层，理由同版本 3 的 floor）。
 * sort_order 保证列表顺序稳定，不依赖插入时间。
 */
const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS storage (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('cabinet', 'shelf', 'box', 'furniture')),
    sort_order  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_storage_room ON storage(room_id);

CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    storage_id  TEXT REFERENCES storage(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    note        TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_room ON items(room_id);
CREATE INDEX IF NOT EXISTS idx_items_storage ON items(storage_id);
`;

/**
 * 版本 5：户外空间（阳台 / 露台）。
 *
 * 只在 rooms 上加一个布尔列，不给阳台另立一张表 —— 阳台在平面上仍是一个
 * 矩形房间，它与室内的区别只有「朝外那几面墙不是实心墙，而是栏杆」。
 * 用一个标记位表达这件事，房间的移动、缩放、改名、门窗、储物全部原样复用。
 *
 * 默认 0（室内），旧库升上来时不会被误判成阳台。
 */
const SCHEMA_V5 = `ALTER TABLE rooms ADD COLUMN outdoor INTEGER NOT NULL DEFAULT 0;`;

/**
 * 版本 6：飘窗（第三种洞口）。
 *
 * 版本 2 建 openings 时，`kind` 上写死了 `CHECK (kind IN ('door', 'window'))`，
 * SQLite 又不支持改 CHECK 约束，于是即使 store 层放行 'bay'，写库那一刻也会被
 * 数据库拦下来（报 `CHECK constraint failed: kind IN ('door', 'window')`）——
 * 表现就是「飘窗怎么点都加不上」。
 *
 * 只能用「建新表 → 搬数据 → 删旧表 → 改名」重建。openings 是 rooms 的子表、
 * 没有任何表引用它，所以删掉它不违反外键；索引随表一起消失，重建后再补。
 */
const SCHEMA_V6 = `
CREATE TABLE openings_v6 (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('door', 'window', 'bay')),
    wall        TEXT NOT NULL CHECK (wall IN ('top', 'right', 'bottom', 'left')),
    pos         REAL NOT NULL CHECK (pos >= 0),
    width       REAL NOT NULL CHECK (width > 0),
    hinge       TEXT NOT NULL DEFAULT 'start' CHECK (hinge IN ('start', 'end')),
    sort_order  INTEGER NOT NULL
);

INSERT INTO openings_v6 (id, room_id, kind, wall, pos, width, hinge, sort_order)
    SELECT id, room_id, kind, wall, pos, width, hinge, sort_order FROM openings;

DROP TABLE openings;
ALTER TABLE openings_v6 RENAME TO openings;
CREATE INDEX IF NOT EXISTS idx_openings_room ON openings(room_id);
`;

/**
 * 迁移脚本按版本号顺序执行：`MIGRATIONS[n]` 把库从版本 n 升到 n + 1。
 * 只向前迁移，不写回退逻辑（回退靠备份文件）。
 * @type {Array<(db: import('node:sqlite').DatabaseSync) => void>}
 */
const MIGRATIONS = [
    (db) => db.exec(SCHEMA_V1),
    (db) => db.exec(SCHEMA_V2),
    (db) => db.exec(SCHEMA_V3),
    (db) => db.exec(SCHEMA_V4),
    (db) => db.exec(SCHEMA_V5),
    (db) => db.exec(SCHEMA_V6),
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
