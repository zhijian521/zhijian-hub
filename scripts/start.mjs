import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import electron from 'electron';

/*
 * 生产模式启动器（`npm start`）。
 *
 * 必须显式清掉 `ELECTRON_RUN_AS_NODE`：本机环境全局设了它，
 * 直接 `electron .` 会以纯 Node 模式执行主进程脚本，`require('electron')`
 * 拿到 undefined，窗口根本不会出现。dev / smoke 脚本同理。
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
    cwd: root,
    env,
    stdio: 'inherit',
});

child.on('exit', (code) => {
    process.exitCode = code ?? 0;
});
