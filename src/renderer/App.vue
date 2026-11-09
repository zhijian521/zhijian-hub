<script setup lang="ts">
/*============================================================================
  App — 应用外壳

  只搭骨架：顶部品牌栏、中央工作区、底部状态栏。
  工作区当前是空画布，用于承接后续功能，不放任何业务节点。
  主进程连通性通过底栏状态体现，证明「渲染层 ↔ preload ↔ IPC」链路可用。
============================================================================*/

import { computed, onMounted } from 'vue';

import { useAppStore } from '@/stores/app';

const store = useAppStore();

onMounted(() => {
    void store.connect();
});

const bridgeText = computed(() => {
    if (store.status === 'connecting') return '正在连接主进程';
    if (store.status === 'error') return store.errorMessage || '主进程未连接';
    return '主进程已连接';
});
</script>

<template>
    <div class="app">
        <!--== 顶部品牌栏 ==-->
        <header class="topbar">
            <div class="brand">
                <span class="seal" aria-hidden="true">简</span>
                <span class="brandText">
                    <strong>知简 Hub</strong>
                    <span>家庭储物 · 位置与层级</span>
                </span>
            </div>

            <div class="trailing">
                <span class="tag">桌面端</span>
                <span class="version">
                    {{ store.info ? `v${store.info.version}` : '—' }}
                </span>
            </div>
        </header>

        <!--== 工作区 ==-->
        <main class="workspace" role="main" aria-label="工作区">
            <div class="placeholder">
                <p class="placeholderTitle">工作区待接入</p>
                <p class="placeholderHint">布局、画布与数据能力按里程碑逐步接入</p>
            </div>
        </main>

        <!--== 状态栏 ==-->
        <footer class="statusbar">
            <span>{{ store.info?.name ?? '知简 Hub' }}</span>
            <span class="bridge" :data-status="store.status">
                <i class="dot" aria-hidden="true"></i>
                {{ bridgeText }}
            </span>
        </footer>
    </div>
</template>

<style scoped>
.app {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
    background: var(--background);
}

/*== 顶部品牌栏 ==*/
.topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
}

.brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

/* 印章式标识：朱砂实底 + 白字，靠色块立住，不用描边 */
.seal {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    background: var(--primary);
    color: var(--primary-foreground);
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: 1;
}

.brandText {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.brandText strong {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.02em;
}

.brandText span {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
}

.trailing {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.tag {
    padding: 2px var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
}

.version {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground);
}

/*== 工作区 ==*/
.workspace {
    position: relative;
    overflow: hidden;
    /* 点阵底纹先占住画布的视觉基调，后续画布直接叠在上面 */
    background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: -1px -1px;
}

.placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: 0;
    pointer-events: none;
}

.placeholderTitle {
    margin: 0;
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    letter-spacing: 0.08em;
    color: var(--muted-foreground);
}

.placeholderHint {
    margin: 0;
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--muted-foreground) 72%, transparent);
}

/*== 状态栏 ==*/
.statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-5);
    border-top: 1px solid var(--border);
    background: var(--surface);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
}

.bridge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
}

.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted-foreground);
}

.bridge[data-status='ready'] .dot {
    background: var(--success);
}

.bridge[data-status='error'] .dot {
    background: var(--destructive);
}

.bridge[data-status='error'] {
    color: var(--destructive);
}
</style>
