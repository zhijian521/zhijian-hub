<script setup lang="ts">
/*============================================================================
  App — 自绘标题栏 + 全幅画板

  窗口去掉系统边框（main.cjs 中 frame: false），最小化 / 最大化 / 关闭
  由这里的三个按钮通过 IPC 回调主进程执行。

  主页只有画板：除标题栏外不放任何常驻面板，画布铺满剩余空间，
  后续的房间、家具、储物设备都直接落在这层点阵上。
============================================================================*/

import { onMounted, onUnmounted, ref } from 'vue';

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
        <!--== 自绘标题栏：整条可拖拽，按钮区域排除 ==-->
        <header class="titlebar">
            <span class="seal" aria-hidden="true">简</span>
            <h1 class="title">知简 Hub</h1>

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

        <!--== 画板：点阵底，铺满剩余空间 ==-->
        <main class="board" role="main" aria-label="画板"></main>
    </div>
</template>

<style scoped>
.app {
    display: grid;
    grid-template-rows: var(--titlebar-height) 1fr;
    height: 100%;
    background: var(--bg);
}

/*== 标题栏 ==*/
.titlebar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 6px 0 12px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface) 94%, #fff 6%),
        var(--surface)
    );
    border-bottom: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--hi);
    /* 整条标题栏可拖拽窗口；系统默认边框已关闭 */
    -webkit-app-region: drag;
}

/* 印章式标识：实底小方块，靠色块立住，不用描边 */
.seal {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    background: var(--brand);
    color: var(--on-brand);
    font-family: var(--font-serif);
    font-size: 11px;
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
}

/*== 窗口按钮 ==*/
.windowControls {
    display: flex;
    gap: 2px;
    margin-left: auto;
    /* 拖拽区里按钮必须显式排除，否则点不动 */
    -webkit-app-region: no-drag;
}

.control {
    display: grid;
    place-items: center;
    width: 38px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
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
    background: var(--sunken);
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

/*== 画板 ==*/
.board {
    position: relative;
    overflow: hidden;
    background-color: var(--bg);
    /* 点阵压到 72% 不透明度：整屏满铺时，实色点会显得吵 */
    background-image: radial-gradient(
        circle,
        color-mix(in srgb, var(--line) 72%, transparent) 1px,
        transparent 1px
    );
    background-size: var(--grid-size) var(--grid-size);
    background-position: -1px -1px;
}
</style>
