<script setup lang="ts">
/*============================================================================
  RenameDialog — 通用重命名弹窗

  只管名称输入与确认取消，不关心被重命名的是什么实体。
  打开时自动聚焦并全选，Enter 确认、Escape 取消，关闭后把焦点还给触发元素。
============================================================================*/

import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
    /*-- 是否显示 --*/
    open: boolean;
    /*-- 弹窗标题，如「修改房间名称」 --*/
    title: string;
    /*-- 输入框标签 --*/
    label: string;
    /*-- 初始值 --*/
    initialValue: string;
}>();

const emit = defineEmits<{
    confirm: [name: string];
    close: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const value = ref('');
let triggerElement: HTMLElement | null = null;

watch(
    () => props.open,
    async (open) => {
        if (!open) return;
        triggerElement =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        value.value = props.initialValue;
        await nextTick();
        inputRef.value?.focus();
        inputRef.value?.select();
    },
);

function close() {
    emit('close');
    // 焦点回到打开弹窗的那个元素，键盘用户不至于丢失位置。
    nextTick(() => triggerElement?.focus());
}

function submit() {
    const name = value.value.trim();
    if (!name) return;
    emit('confirm', name);
}
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="overlay" @pointerdown.self="close">
            <form
                class="dialog"
                role="dialog"
                aria-modal="true"
                :aria-label="title"
                @submit.prevent="submit"
            >
                <h2 class="title">{{ title }}</h2>

                <label class="fieldLabel">
                    {{ label }}
                    <input
                        ref="inputRef"
                        v-model="value"
                        class="field"
                        type="text"
                        maxlength="40"
                        @keydown.esc.prevent="close"
                    />
                </label>

                <div class="actions">
                    <button class="btn" type="button" @click="close">取消</button>
                    <button class="btn btnPrimary" type="submit" :disabled="!value.trim()">
                        确定
                    </button>
                </div>
            </form>
        </div>
    </Teleport>
</template>

<style scoped>
.overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: rgba(31, 36, 25, 0.32);
    backdrop-filter: blur(2px);
    animation: fade 0.16s ease;
}

@keyframes fade {
    from {
        opacity: 0;
    }
}

.dialog {
    width: min(360px, calc(100vw - 48px));
    padding: var(--space-5);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow:
        inset 0 1px 0 var(--hi),
        var(--shadow-lg);
    animation: rise 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes rise {
    from {
        opacity: 0;
        transform: translateY(6px) scale(0.99);
    }
}

.title {
    margin: 0 0 var(--space-4);
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
}

.fieldLabel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--fg-muted);
}

/* 凹槽式输入：整体下沉，读得出厚度 */
.field {
    height: var(--control-height);
    padding: 0 var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    color: var(--fg);
    font-size: var(--text-sm);
    box-shadow:
        inset 0 2px 3px var(--lo-deep),
        inset 0 -1px 0 var(--hi);
    user-select: text;
}

.field:focus-visible {
    outline: none;
    border-color: var(--brand);
    box-shadow:
        inset 0 2px 3px var(--lo-deep),
        var(--focus-ring);
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-5);
}

.btn {
    height: var(--control-height);
    padding: 0 var(--space-4);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface) 92%, #fff 8%),
        var(--surface)
    );
    color: var(--fg);
    font-size: var(--text-sm);
    box-shadow:
        inset 0 1px 0 var(--hi),
        inset 0 -1px 0 var(--lo),
        0 1px 2px var(--lo);
    transition:
        transform var(--transition-fast),
        box-shadow var(--transition-fast),
        background var(--transition);
}

.btn:hover {
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface) 84%, #fff 16%),
        var(--surface)
    );
}

.btn:active {
    transform: translateY(1px);
    box-shadow: inset 0 2px 3px var(--lo-deep);
}

.btn:disabled {
    opacity: 0.45;
    pointer-events: none;
}

.btnPrimary {
    border-color: color-mix(in srgb, var(--brand) 72%, #000);
    background: linear-gradient(180deg, var(--brand-hover), var(--brand));
    color: var(--on-brand);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.24),
        inset 0 -2px 0 rgba(0, 0, 0, 0.14),
        0 2px 6px color-mix(in srgb, var(--brand) 28%, transparent);
}

.btnPrimary:hover {
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--brand-hover) 88%, #fff 12%),
        var(--brand-hover)
    );
}
</style>
