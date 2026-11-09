import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

import electron from 'electron';
import { createServer } from 'vite';

/*
 * 开发启动器：先起 Vite（渲染层热更新），再拉起 Electron。
 * 主进程与预加载不参与打包，改了就重启 Electron —— 这两处没有热更新可言。
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
});
await server.listen();
server.printUrls();

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let child;
let restartTimer;
let closing = false;

function launch() {
    console.log('[知简] 启动 Electron，渲染层热更新见上方地址。');
    child = spawn(electron, ['.', '--dev', ...process.argv.slice(2)], {
        cwd: root,
        env,
        stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8').pipe(process.stdout);
    child.stderr.setEncoding('utf8').pipe(process.stderr);
    child.on('error', async (error) => {
        console.error(error);
        await stop(1);
    });
    child.on('exit', async (code) => {
        if (!closing && !restartTimer) await stop(code ?? 1);
    });
}

const watchers = ['main', 'preload'].map((dir) =>
    watch(fileURLToPath(new URL(`../src/${dir}`, import.meta.url)), { recursive: true }, () => {
        clearTimeout(restartTimer);
        // 编辑器保存一次会触发多个事件，合并到一个短窗口里重启。
        restartTimer = setTimeout(() => {
            const previous = child;
            previous.removeAllListeners('exit');
            if (previous.exitCode !== null || previous.signalCode !== null) {
                restartTimer = null;
                if (!closing) launch();
                return;
            }
            previous.once('exit', () => {
                restartTimer = null;
                if (!closing) launch();
            });
            previous.kill();
        }, 150);
    }),
);

async function stop(code = 0) {
    if (closing) return;
    closing = true;
    clearTimeout(restartTimer);
    watchers.forEach((watcher) => watcher.close());
    if (child && child.exitCode === null) child.kill();
    await server.close();
    process.exitCode = code;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
launch();
