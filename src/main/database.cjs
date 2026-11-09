/*============================================================================
  database — SQLite 连接与 schema 迁移

  用 Electron 内置 Node 的 `node:sqlite`，不引入 better-sqlite3：
  原生模块要按 Electron ABI 重新编译，多一套 MSVC 工具链依赖，收益为零。

  schema 版本记在 `PRAGMA user_version`。当前版本为 0（没有任何业务表），
  第一个功能落地时在这里追加版本 1 的迁移，不要提前建空表。
============================================================================*/

const { DatabaseSync } = require('node:sqlite');

/** 当前 schema 版本。新增表或列时 +1，并在 MIGRATIONS 里补一段。 */
const SCHEMA_VERSION = 0;

/**
 * 迁移脚本按版本号顺序执行：`MIGRATIONS[n]` 把库从版本 n 升到 n + 1。
 * 只向前迁移，不写回退逻辑（回退靠备份文件）。
 * @type {Array<(db: import('node:sqlite').DatabaseSync) => void>}
 */
const MIGRATIONS = [];

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
