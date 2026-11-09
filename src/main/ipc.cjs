/*============================================================================
  ipc — 主进程通道注册

  渲染进程只能通过 preload 暴露的白名单方法访问这里。
  每个入口都先确认调用方是主窗口主 frame，再执行具体逻辑。
============================================================================*/

const CHANNELS = {
    appInfo: 'zhijian:appInfo',
    windowControl: 'zhijian:windowControl',
    windowState: 'zhijian:windowState',
};

/** 窗口状态推送通道：最大化 / 还原后通知渲染层换图标 */
const WINDOW_STATE_EVENT = 'zhijian:windowStateChanged';

const WINDOW_ACTIONS = new Set(['minimize', 'toggle-maximize', 'close']);

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   app: import('electron').App,
 *   getWindow: () => import('electron').BrowserWindow | null,
 * }} options
 */
function registerIpc({ ipcMain, app, getWindow }) {
    /**
     * 只接受当前主窗口主 frame 的调用：子 frame、被注入页面、其他 WebContents 一律拒绝。
     * @param {import('electron').IpcMainInvokeEvent} event
     */
    const assertTrusted = (event) => {
        const window = getWindow();
        const frame = event.senderFrame;
        const trusted =
            Boolean(window) &&
            !window.isDestroyed() &&
            Boolean(frame) &&
            frame === window.webContents.mainFrame;
        if (!trusted) throw new Error('拒绝来自非主窗口的调用');
    };

    ipcMain.handle(CHANNELS.appInfo, (event) => {
        assertTrusted(event);
        return { name: app.getName(), version: app.getVersion(), platform: process.platform };
    });

    /*
     * 自绘标题栏的窗口按钮。关闭用 close 而不是 destroy：
     * close 会照常走 close 事件与 pagehide，方便以后接"退出前保存"。
     */
    ipcMain.handle(CHANNELS.windowControl, (event, action) => {
        assertTrusted(event);
        const window = getWindow();
        if (!window) return { maximized: false };
        if (!WINDOW_ACTIONS.has(action)) throw new Error(`未知的窗口操作：${String(action)}`);

        if (action === 'minimize') window.minimize();
        else if (action === 'toggle-maximize') {
            if (window.isMaximized()) window.unmaximize();
            else window.maximize();
        } else {
            window.close();
            // 关闭后窗口可能已销毁，状态不再有意义，返回当前值即可。
        }

        return { maximized: window.isDestroyed() ? false : window.isMaximized() };
    });

    ipcMain.handle(CHANNELS.windowState, (event) => {
        assertTrusted(event);
        const window = getWindow();
        return { maximized: Boolean(window && !window.isDestroyed() && window.isMaximized()) };
    });
}

module.exports = { CHANNELS, WINDOW_STATE_EVENT, registerIpc };
