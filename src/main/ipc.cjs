/*============================================================================
  ipc — 主进程通道注册

  渲染进程只能通过 preload 暴露的白名单方法访问这里。
  每个入口都先确认调用方是主窗口主 frame，再执行具体逻辑。
  当前只有应用信息一个通道；后续数据通道按同样形态追加。
============================================================================*/

const CHANNELS = {
    appInfo: 'zhijian:appInfo',
};

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
}

module.exports = { CHANNELS, registerIpc };
