/*============================================================================
  app store — 应用级状态

  只放「渲染层需要知道的运行环境」：应用名、版本、主进程是否连通。
  业务状态等第一个功能落地时再建独立 store，不提前留空壳。
============================================================================*/

import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { AppInfo } from '@/app/types';

export type BridgeStatus = 'connecting' | 'ready' | 'error';

export const useAppStore = defineStore('app', () => {
    const info = ref<AppInfo | null>(null);
    const status = ref<BridgeStatus>('connecting');
    const errorMessage = ref('');

    async function connect() {
        const bridge = window.zhijian;
        if (!bridge) {
            status.value = 'error';
            errorMessage.value = '未检测到桌面主进程';
            return;
        }

        try {
            info.value = await bridge.appInfo();
            status.value = 'ready';
        } catch (error) {
            status.value = 'error';
            errorMessage.value = error instanceof Error ? error.message : '主进程通信失败';
        }
    }

    return { info, status, errorMessage, connect };
});
