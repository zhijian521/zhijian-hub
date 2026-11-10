// @ts-check
const { contextBridge, ipcRenderer } = require('electron');

/*
 * 渲染进程唯一的数据通道。
 * 只暴露具名方法，不透传 ipcRenderer：渲染层拿不到任意通道，也就无法越过白名单。
 *
 * 类型声明一次即可 —— 对象按渲染层的 `DesktopBridge` 推断，漏写或多写一个方法
 * 都能在 `vue-tsc` 里被发现。
 * @type {import('../renderer/app/types').DesktopBridge}
 */
const api = {
    appInfo: () => ipcRenderer.invoke('zhijian:appInfo'),

    /** @param {'minimize' | 'toggle-maximize' | 'close'} action */
    windowControl: (action) => ipcRenderer.invoke('zhijian:windowControl', action),

    getWindowState: () => ipcRenderer.invoke('zhijian:windowState'),

    /** @param {(state: { maximized: boolean }) => void} listener */
    onWindowStateChanged: (listener) => {
        /** @param {import('electron').IpcRendererEvent} _event @param {{ maximized: boolean }} state */
        const handler = (_event, state) => listener(state);
        ipcRenderer.on('zhijian:windowStateChanged', handler);
        return () => ipcRenderer.removeListener('zhijian:windowStateChanged', handler);
    },

    loadFloorPlan: () => ipcRenderer.invoke('zhijian:floorPlan:load'),
    /** @param {string} svg @param {string} name */
    exportFloorPlan: (svg, name) => ipcRenderer.invoke('zhijian:floorPlan:export', svg, name),

    /** @param {object} command 语义化命令，结构见 renderer/app/types.ts 的 FloorPlanCommand */
    mutateFloorPlan: (command) => ipcRenderer.invoke('zhijian:floorPlan:mutate', command),
};

contextBridge.exposeInMainWorld('zhijian', api);
