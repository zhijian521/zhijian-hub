/*============================================================================
  logger — 主进程日志

  打包后的 GUI 应用没有控制台，异常必须落盘才能事后排查。
  只保留最近 5 个文件，避免长期运行后无限增长。
============================================================================*/

const fs = require('node:fs');
const path = require('node:path');

const MAX_FILES = 5;

/**
 * @param {string} directory
 * @returns {{ info: (message: string) => void, error: (message: string, error?: unknown) => void, path: string }}
 */
function createLogger(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'main.log');
    rotate(directory);

    const write = (level, message, error) => {
        const detail =
            error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : '';
        const line = `[${new Date().toISOString()}] ${level} ${message}${detail ? `\n${detail}` : ''}\n`;
        try {
            fs.appendFileSync(file, line, 'utf8');
        } catch {
            // 日志写不进去不能反过来影响应用运行。
        }
        if (level === 'ERROR') console.error(line.trim());
        else console.log(line.trim());
    };

    return {
        info: (message) => write('INFO', message),
        error: (message, error) => write('ERROR', message, error),
        path: file,
    };
}

/**
 * 启动时把 `main.log` 轮转为 `main.<时间戳>.log`，超出上限的旧文件删除。
 * @param {string} directory
 */
function rotate(directory) {
    const current = path.join(directory, 'main.log');
    if (fs.existsSync(current)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        try {
            fs.renameSync(current, path.join(directory, `main.${stamp}.log`));
        } catch {
            return;
        }
    }

    const old = fs
        .readdirSync(directory)
        .filter((name) => /^main\..+\.log$/.test(name))
        .sort()
        .reverse()
        .slice(MAX_FILES);
    for (const name of old) {
        try {
            fs.rmSync(path.join(directory, name));
        } catch {
            // 删不掉就留着，不影响启动。
        }
    }
}

module.exports = { createLogger };
