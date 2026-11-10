<script setup lang="ts">
/*============================================================================
  FloatCard — 悬浮卡片

  界面里所有「列表 / 详情 / 编辑」都长这个样子：浮在画板上，不挤压画布，
  也不占固定列。卡片自己滚动，画板永远保持原尺寸。

  side 决定从哪一侧浮起来：左侧卡片贴左（在左侧菜单右边），
  右侧卡片贴右（在右侧按钮列左边）。两侧可以同时各开一张。
============================================================================*/

import PlanIcon from '@/features/floor-plan/plan-icon.vue';

withDefaults(
    defineProps<{
        title: string;
        subtitle?: string;
        eyebrow?: string;
        width?: number;
        side?: 'left' | 'right';
    }>(),
    { subtitle: '', eyebrow: '', width: 300, side: 'right' },
);

defineEmits<{ close: [] }>();
</script>

<template>
    <section
        class="float-card"
        :class="`side-${side}`"
        :style="{ width: `${width}px` }"
        role="dialog"
        :aria-label="title"
    >
        <header class="card-head">
            <div>
                <p v-if="eyebrow" class="card-eyebrow">{{ eyebrow }}</p>
                <h2>{{ title }}</h2>
                <p v-if="subtitle" class="card-subtitle">{{ subtitle }}</p>
            </div>
            <button class="card-close" type="button" aria-label="关闭" @click="$emit('close')">
                <PlanIcon name="close" />
            </button>
        </header>
        <div class="card-body">
            <slot />
        </div>
        <footer v-if="$slots.footer" class="card-foot">
            <slot name="footer" />
        </footer>
    </section>
</template>

<style scoped>
.float-card {
    position: absolute;
    top: 74px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    max-height: calc(100% - 150px);
    background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    backdrop-filter: blur(14px) saturate(1.1);
    overflow: hidden;
}

/* 右侧卡片让开功能按钮列（右 16px + 宽 60px）。 */
.float-card.side-right {
    right: 86px;
}

/* 左侧卡片让开左侧菜单列，底部再给视图开关与比例尺留出位置。 */
.float-card.side-left {
    left: 86px;
    max-height: calc(100% - 190px);
}

.card-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 18px 18px 13px;
    border-bottom: 1px solid var(--line);
}

.card-head > div {
    min-width: 0;
    flex: 1;
}

.card-eyebrow {
    margin: 0 0 7px;
    font: 9px var(--font-mono);
    letter-spacing: 1.6px;
    color: var(--fg-subtle);
}

.card-head h2 {
    margin: 0;
    font: 500 17px var(--font-serif);
    letter-spacing: 0.5px;
    color: var(--fg);
}

.card-subtitle {
    margin: 5px 0 0;
    font-size: 11px;
    color: var(--fg-subtle);
    line-height: 1.7;
}

.card-close {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-subtle);
}

.card-close:hover {
    background: var(--sunken);
    color: var(--fg);
}

.card-close svg {
    width: 15px;
    height: 15px;
}

.card-body {
    min-height: 0;
    overflow-y: auto;
    padding: 14px 18px 18px;
}

.card-foot {
    padding: 12px 18px;
    border-top: 1px solid var(--line);
    background: var(--bg);
}
</style>
