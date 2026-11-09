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
};

contextBridge.exposeInMainWorld('zhijian', api);
