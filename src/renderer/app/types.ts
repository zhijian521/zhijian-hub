/*============================================================================
  types — 渲染层与主进程的契约

  只声明当前真实存在的通道。新增通道时先改这里，`vue-tsc` 会同时检查
  preload 的实现是否与契约一致。
============================================================================*/

export interface AppInfo {
    name: string;
    version: string;
    platform: string;
}

export type WindowAction = 'minimize' | 'toggle-maximize' | 'close';

export interface WindowState {
    maximized: boolean;
}

export interface DesktopBridge {
    appInfo: () => Promise<AppInfo>;
    /*-- 执行窗口操作，返回操作后的最大化状态 --*/
    windowControl: (action: WindowAction) => Promise<WindowState>;
    getWindowState: () => Promise<WindowState>;
    /*-- 订阅最大化状态变化，返回取消订阅函数 --*/
    onWindowStateChanged: (listener: (state: WindowState) => void) => () => void;
}

declare global {
    interface Window {
        /*-- preload 注入；在浏览器里直接打开时不存在，调用处需要降级 --*/
        zhijian?: DesktopBridge;
    }
}
