<script setup lang="ts">
/*============================================================================
  App — 全幅画板 + 悬浮窗口控件

  窗口去掉系统边框（main.cjs 中 frame: false），最小化 / 最大化 / 关闭
  由这里的三个按钮通过 IPC 回调主进程执行。

  这里没有标题栏这一行：品牌的印章与窗口按钮都浮在画板之上，
  画布从窗口左上角一直铺到右下角。可拖拽区域只留品牌那一小块，
  中间与下方全部交还给画布，避免拖拽区吃掉绘图事件。
============================================================================*/

import { onMounted, onUnmounted, ref } from 'vue';

import FloorPlanBoard from '@/features/floor-plan/floor-plan-board.vue';
import type { WindowAction } from '@/app/types';

const maximized = ref(false);
let unsubscribe: (() => void) | undefined;

onMounted(async () => {
    const bridge = window.zhijian;
    if (!bridge) return;

    const state = await bridge.getWindowState();
    maximized.value = state.maximized;
    unsubscribe = bridge.onWindowStateChanged((next) => {
        maximized.value = next.maximized;
    });
});

onUnmounted(() => {
    unsubscribe?.();
});

async function control(action: WindowAction) {
    const bridge = window.zhijian;
    if (!bridge) return;
    const state = await bridge.windowControl(action);
    maximized.value = state.maximized;
}
</script>

<template>
    <div class="app">
        <!--== 画板：铺满整个窗口，不预留任何标题栏高度 ==-->
        <main class="workspace" role="main" aria-label="画板">
            <FloorPlanBoard />
        </main>

        <!--== 悬浮件：品牌（可拖拽）+ 窗口按钮 ==-->
        <header class="chrome">
            <div class="brand">
                <span class="seal" aria-hidden="true">简</span>
                <h1 class="title">知简 Hub</h1>
            </div>

            <div class="windowControls">
                <button
                    class="control"
                    type="button"
                    aria-label="最小化"
                    title="最小化"
                    @click="control('minimize')"
                >
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M3 6h6" />
                    </svg>
                </button>

                <button
                    class="control"
                    type="button"
                    :aria-label="maximized ? '还原' : '最大化'"
                    :title="maximized ? '还原' : '最大化'"
                    @click="control('toggle-maximize')"
                >
                    <svg v-if="maximized" viewBox="0 0 12 12" aria-hidden="true">
                        <rect x="2.5" y="4" width="5.5" height="5.5" rx="1" />
                        <path
                            d="M4.5 4V3.2A1.2 1.2 0 0 1 5.7 2h3.1a1.2 1.2 0 0 1 1.2 1.2v3.1a1.2 1.2 0 0 1-1.2 1.2H8"
                        />
                    </svg>
                    <svg v-else viewBox="0 0 12 12" aria-hidden="true">
                        <rect x="3" y="3" width="6" height="6" rx="1" />
                    </svg>
                </button>

                <button
                    class="control controlClose"
                    type="button"
                    aria-label="关闭"
                    title="关闭"
                    @click="control('close')"
                >
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
                    </svg>
                </button>
            </div>
        </header>
    </div>
</template>

<style scoped>
.app {
    position: relative;
    height: 100%;
    background: var(--draft-paper);
    overflow: hidden;
}

/*== 画板：真正铺满整个窗口 ==*/
.workspace {
    position: absolute;
    inset: 0;
    overflow: hidden;
}

/*== 悬浮 chrome：只有两个小岛接收鼠标，中间留白给画布 ==*/
.chrome {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 9px 10px 0 12px;
    /* 一条空白条本身不接收事件，只有子元素的小岛接 */
    pointer-events: none;
}

/* 品牌小岛：整块作为窗口拖拽把手 */
.brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 4px 10px 4px 5px;
    border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-raised) 82%, transparent);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px) saturate(1.1);
    pointer-events: auto;
    -webkit-app-region: drag;
}

/* 印章式标识：实底小方块，靠色块立住，不用描边 */
.seal {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    background: var(--brand);
    color: var(--on-brand);
    font-family: var(--font-serif);
    font-size: 10px;
    line-height: 1;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    letter-spacing: 0.04em;
    color: var(--fg-muted);
    white-space: nowrap;
}

/*== 窗口按钮 ==*/
.windowControls {
    display: flex;
    gap: 2px;
    pointer-events: auto;
    /* 拖拽区里按钮必须显式排除，否则点不动 */
    -webkit-app-region: no-drag;
}

.control {
    display: grid;
    place-items: center;
    width: 34px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface-raised) 62%, transparent);
    color: var(--fg-muted);
    transition:
        background var(--transition),
        color var(--transition),
        transform var(--transition-fast);
}

.control svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linecap: round;
}

.control:hover {
    background: var(--surface-raised);
    color: var(--fg);
}

.control:active {
    transform: translateY(1px);
}

/* 关闭键用危险色实底：这是界面上唯一一处「红」，语义明确 */
.controlClose:hover {
    border-color: color-mix(in srgb, var(--danger) 72%, #000);
    background: var(--danger);
    color: #fff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
</style>
