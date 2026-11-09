import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import electron from 'electron';

/*
 * 主进程自检：不打开窗口，跑一遍 SQLite 数据链路后退出。
 * 数据落在 `.runtime/smoke-data`，不触碰真实存档。
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electron, ['.', '--smoke'], {
    cwd: root,
    stdio: 'inherit',
    env,
});

if (result.status !== 0) {
    console.error(`[smoke] 失败，退出码 ${result.status ?? 'null'}`);
    process.exit(result.status ?? 1);
}

console.log('[smoke] 通过');
