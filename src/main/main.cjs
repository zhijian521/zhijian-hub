/*============================================================================
  main — Electron 主进程入口

  启动顺序：定位数据目录 → 建日志 → 打开数据库 → 注册 IPC → 建窗口。
  数据库在窗口之前打开：迁移失败要立刻暴露，而不是让用户面对一个用不了的空壳。
============================================================================*/

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const { configurePaths } = require('./paths.cjs');
const { createLogger } = require('./logger.cjs');
const { openDatabase } = require('./database.cjs');
const { registerIpc, WINDOW_STATE_EVENT } = require('./ipc.cjs');

const isDev = process.argv.includes('--dev');
const isSmoke = process.argv.includes('--smoke');
const DEV_SERVER_URL = 'http://127.0.0.1:5178';

/*
 * 应用名与版本显式取自包根的 package.json，不依赖 `app.getName()` / `getVersion()` 的默认行为。
 *
 * 默认行为只在 `electron .` 这种标准启动下才读包信息；用 `electron <脚本>` 起
 * （自检、截图）时两者会退化成 Electron 自己的名称与版本（Electron / 38.8.6），
 * 界面上的版本号就会显示成框架版本。
 * 名称还决定 `userData` 目录，必须在读取任何路径之前固定下来。
 */
const packageInfo = require('../../package.json');
app.setName(packageInfo.productName ?? packageInfo.name);
app.setVersion(packageInfo.version);

// 自检用独立数据目录，绝不写进真实数据。
if (isSmoke) app.setPath('userData', path.join(process.cwd(), '.runtime', 'smoke-data'));

const paths = configurePaths(app);
const logger = createLogger(paths.logs);

// 打包后的 GUI 没有控制台，未捕获异常必须落盘。
process.on('uncaughtException', (error) => logger.error('主进程未捕获异常', error));
process.on('unhandledRejection', (reason) => logger.error('主进程未处理的 Promise 拒绝', reason));

let window = null;
let database = null;

function createWindow() {
    window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 680,
        title: '知简 Hub',
        // 与苔痕主题的画布底色一致，避免启动瞬间闪白
        backgroundColor: '#f1f4ea',
        show: false,
        /*
         * 自绘标题栏：去掉系统边框，min / max / close 由渲染层负责，
         * 通过 `zhijian:windowControl` 回调主进程执行。
         * thickFrame 保持开启，Windows 下的窗口阴影、贴边缩放和双击最大化仍然可用。
         */
        frame: false,
        thickFrame: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
        },
    });

    window.once('ready-to-show', () => {
        window.show();
    });

    // 最大化状态要同步给渲染层：按钮图标在"最大化"和"还原"之间切换。
    const publishWindowState = () => {
        if (!window || window.isDestroyed()) return;
        window.webContents.send(WINDOW_STATE_EVENT, { maximized: window.isMaximized() });
    };
    window.on('maximize', publishWindowState);
    window.on('unmaximize', publishWindowState);

    // 桌面应用不需要多标签：新窗口一律拒绝，导航一律拦下，外链交给系统浏览器时再单独开口。
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());

    if (isDev) window.loadURL(DEV_SERVER_URL);
    else window.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));

    window.on('closed', () => {
        window = null;
    });
}

/**
 * 主进程自检：确认数据目录可用、数据库能打开、schema 版本符合预期。
 * 不建窗口，跑完即退出 —— 用于改动主进程或升级 Electron 后的快速验证。
 * @returns {number} 进程退出码
 */
function runSmoke() {
    try {
        database = openDatabase(paths.database);
        const row = database.prepare('PRAGMA user_version').get();
        logger.info(
            `smoke 通过：数据库已打开（${paths.database}），schema 版本 ${row?.user_version ?? 0}`,
        );
        database.close();
        return 0;
    } catch (error) {
        logger.error('smoke 失败', error);
        return 1;
    }
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!window) return;
        if (window.isMinimized()) window.restore();
        window.focus();
    });

    app.whenReady().then(() => {
        if (isSmoke) {
            app.exit(runSmoke());
            return;
        }

        database = openDatabase(paths.database);
        logger.info(`数据库已就绪：${paths.database}`);

        registerIpc({ ipcMain, app, db: database, getWindow: () => window });
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('will-quit', () => {
        // node:sqlite 是同步连接，关闭前让 WAL checkpoint 落地，避免下次启动回放。
        try {
            database?.close();
        } catch (error) {
            logger.error('关闭数据库失败', error);
        }
    });
}
