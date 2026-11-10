<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Opening, Room } from '@/app/types';
import {
    doorGeometry,
    openingBox,
    resolveFloor,
    wallSpan,
    windowLines,
    type ResizeDir,
} from '@/lib/plan-geometry';
import {
    boundsOf,
    clampOpening,
    EXTERIOR_WALL,
    MILLIMETERS_PER_PIXEL,
    wallOpenings,
} from '@/lib/plan-scene';
import { roomArea } from '@/stores/floor-plan';
import PlanDrawing from './plan-drawing.vue';
import PlanIcon from './plan-icon.vue';
import { exampleRooms } from './plan-template';
import { usePlanEditor, type PlanTool } from './use-plan-editor';

const {
    store,
    stage,
    tool,
    zoom,
    pan,
    rooms,
    selectedRoom,
    selectedOpening,
    selectedOpeningId,
    drawRect,
    invalid,
    placement,
    hover,
    space,
    drag,
    message,
    chooseTool,
    selectRoom,
    down,
    move,
    up,
    cancel,
    setZoom,
    wheel,
    fit,
    removeSelection,
    setDimension,
} = usePlanEditor();
const showDimensions = ref(true);
const showMaterials = ref(false);
const showGrid = ref(true);
const newPlanName = ref('我的家');
const name = ref('');
const width = ref(0);
const height = ref(0);
const openingWidth = ref(900);
const openingPosition = ref(0);
const exportRef = ref<SVGSVGElement | null>(null);
const exporting = ref(false);
const totalArea = computed(() =>
    rooms.value.reduce((sum, r) => sum + (r.width * r.height) / 3600, 0).toFixed(1),
);
const openingCount = computed(() => rooms.value.reduce((sum, r) => sum + r.openings.length, 0));
const tools: { id: PlanTool; label: string; key: string; detail: string }[] = [
    { id: 'select', label: '选择', key: 'V', detail: '选择、移动与调整房间' },
    { id: 'room', label: '房间', key: 'R', detail: '拖拽绘制房间，靠近墙面自动吸附' },
    { id: 'door', label: '门', key: 'D', detail: '点击墙面放置门，先选房间可指定开启侧' },
    { id: 'window', label: '窗', key: 'W', detail: '点击墙面放置窗' },
    { id: 'hand', label: '平移', key: 'H', detail: '拖动画布查看户型' },
];
const activeTool = computed(() => tools.find((t) => t.id === tool.value)!);
const cursor = computed(() =>
    drag.value?.kind === 'pan'
        ? 'grabbing'
        : space.value || tool.value === 'hand'
          ? 'grab'
          : tool.value === 'select'
            ? 'default'
            : 'crosshair',
);
const handles = computed(() => {
    const room = selectedRoom.value;
    if (!room || selectedOpening.value || tool.value !== 'select') return [];
    return (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeDir[]).map((dir) => ({
        dir,
        x: dir.includes('w')
            ? room.x
            : dir.includes('e')
              ? room.x + room.width
              : room.x + room.width / 2,
        y: dir.includes('n')
            ? room.y
            : dir.includes('s')
              ? room.y + room.height
              : room.y + room.height / 2,
        cursor:
            dir === 'n' || dir === 's'
                ? 'ns-resize'
                : dir === 'e' || dir === 'w'
                  ? 'ew-resize'
                  : dir === 'nw' || dir === 'se'
                    ? 'nwse-resize'
                    : 'nesw-resize',
    }));
});
const ghost = computed(() => {
    const p = placement.value;
    if (!p) return null;
    return {
        box: openingBox(p.room, p.opening, EXTERIOR_WALL),
        door: doorGeometry(p.room, p.opening),
        panes: windowLines(p.room, p.opening, EXTERIOR_WALL),
        kind: p.opening.kind,
    };
});
const exportBounds = computed(() => {
    const b = boundsOf(store.rooms) ?? { x: 0, y: 0, width: 600, height: 500 };
    return `${b.x - 90} ${b.y - 90} ${b.width + 150} ${b.height + 150}`;
});
const mm = (px: number) => Math.round(px * MILLIMETERS_PER_PIXEL);
const wallNames = { top: '上侧墙', right: '右侧墙', bottom: '下侧墙', left: '左侧墙' };
const presets = ['客餐厅', '主卧', '次卧', '书房', '厨房', '卫生间', '阳台', '玄关'];
watch(
    () => store.selectedRoom,
    (room) => {
        name.value = room?.name ?? '';
        width.value = room ? mm(room.width) : 0;
        height.value = room ? mm(room.height) : 0;
    },
    { immediate: true },
);
watch(
    selectedOpening,
    (o) => {
        openingWidth.value = o ? mm(o.width) : 900;
        openingPosition.value = o ? mm(o.pos) : 0;
    },
    { immediate: true },
);
async function rename(value = name.value) {
    const room = store.selectedRoom;
    if (!room) return;
    if (!value.trim()) {
        name.value = room.name;
        return;
    }
    await store.renameRoom(room.id, value.trim());
    name.value = store.selectedRoom?.name ?? '';
}
async function updateSize(axis: 'width' | 'height') {
    await setDimension(axis, Number(axis === 'width' ? width.value : height.value));
    width.value = store.selectedRoom ? mm(store.selectedRoom.width) : 0;
    height.value = store.selectedRoom ? mm(store.selectedRoom.height) : 0;
}
async function updateOpening(field: 'width' | 'pos') {
    const room = store.selectedRoom,
        opening = selectedOpening.value;
    if (!room || !opening) return;
    const value = Number(field === 'width' ? openingWidth.value : openingPosition.value);
    if (
        !Number.isFinite(value) ||
        (field === 'width' && value < 400) ||
        (field === 'pos' && value < 0)
    ) {
        message.value = '门窗宽度至少为 400 mm，墙上偏移不能为负数';
    } else {
        const length = wallSpan(room, opening.wall).length;
        const widthPx = field === 'width' ? value / MILLIMETERS_PER_PIXEL : opening.width;
        const desired = field === 'pos' ? value / MILLIMETERS_PER_PIXEL : opening.pos;
        const pos = clampOpening(
            desired,
            widthPx,
            length,
            wallOpenings(store.rooms, room, opening.wall, opening.id),
        );
        if (pos === null || (field === 'pos' && Math.abs(pos - desired) > 0.01))
            message.value = '该位置放不下门窗，请检查尺寸或相邻洞口';
        else {
            message.value = '';
            await store.updateOpening(opening.id, { pos, width: widthPx });
        }
    }
    const current = selectedOpening.value;
    if (current) {
        openingWidth.value = mm(current.width);
        openingPosition.value = mm(current.pos);
    }
}
function selectOpening(room: Room, opening: Opening) {
    store.select(room.id);
    selectedOpeningId.value = opening.id;
    tool.value = 'select';
}
async function createPlan(template: boolean) {
    if (!(await store.createPlan(newPlanName.value))) return;
    if (template) await store.replaceRooms(exampleRooms());
    else tool.value = 'room';
    await nextTick();
    fit();
}
async function loadExample() {
    if (store.rooms.length) return;
    await store.replaceRooms(exampleRooms());
    await nextTick();
    fit();
}
async function exportSvg() {
    await nextTick();
    const element = exportRef.value;
    if (!element) return;
    const copy = element.cloneNode(true) as SVGSVGElement;
    copy.removeAttribute('class');
    copy.removeAttribute('aria-hidden');
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', '1600');
    copy.setAttribute('height', '1400');
    const svg =
        '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(copy);
    if (!window.zhijian || exporting.value) return;
    exporting.value = true;
    try {
        const result = await window.zhijian.exportFloorPlan(svg, store.plan?.name ?? '户型图');
        if (!result.canceled) message.value = '户型图已导出为 SVG，可无损放大或打印';
    } catch (error) {
        message.value = error instanceof Error ? error.message : '导出失败，请重试';
    } finally {
        exporting.value = false;
    }
}
</script>

<template>
    <section class="plan-editor" aria-label="户型图编辑器">
        <header class="editor-header">
            <div class="breadcrumb">
                <span class="home-icon"><PlanIcon name="home" /></span>
                <span>我的空间</span>
                <PlanIcon name="chevron" />
                <strong>户型图</strong>
                <span class="version-tag">2D PLAN</span>
            </div>
            <div class="header-actions">
                <span class="save-state" role="status">
                    <i :class="{ saving: store.busy, failed: Boolean(store.errorMessage) }" />
                    {{
                        store.status === 'failed'
                            ? '读取失败'
                            : store.status === 'loading'
                              ? '正在读取'
                              : store.errorMessage
                                ? '修改未保存'
                                : store.busy
                                  ? '正在保存'
                                  : '已保存到本机'
                    }}
                </span>
                <button
                    class="button"
                    :disabled="!store.rooms.length || store.busy || exporting"
                    @click="exportSvg"
                >
                    <PlanIcon name="export" />
                    导出图纸
                </button>
            </div>
        </header>

        <aside class="project-sidebar">
            <div class="project-title">
                <p class="eyebrow">HOME / FLOOR PLAN</p>
                <h2>{{ store.plan?.name || '家的轮廓' }}</h2>
                <p>先安放空间，再安放生活。</p>
            </div>
            <div class="floor-row">
                <span class="floor-badge">1F</span>
                <div>
                    <strong>一层平面</strong>
                    <small>{{ store.rooms.length }} 个空间 · {{ totalArea }} m²</small>
                </div>
                <span class="active-dot" />
            </div>
            <div class="section-heading">
                <span>空间列表</span>
                <span>{{ store.rooms.length.toString().padStart(2, '0') }}</span>
            </div>
            <div class="room-list">
                <button
                    v-for="(room, index) in store.rooms"
                    :key="room.id"
                    class="room-list-item"
                    :class="{ active: room.id === store.selectedId }"
                    :disabled="store.busy"
                    @click="
                        selectRoom(room.id);
                        chooseTool('select');
                    "
                >
                    <span class="room-index">{{ (index + 1).toString().padStart(2, '0') }}</span>
                    <span class="room-list-name">{{ room.name }}</span>
                    <span class="room-list-area">
                        {{ roomArea(room).toFixed(1) }}
                        <small>m²</small>
                    </span>
                </button>
                <p v-if="!store.rooms.length" class="list-placeholder">
                    还没有房间
                    <br />
                    从画下第一个空间开始
                </p>
            </div>
            <button
                class="add-room-button"
                :disabled="!store.hasPlan || store.busy"
                @click="chooseTool('room')"
            >
                <PlanIcon name="plus" />
                绘制新房间
                <span>R</span>
            </button>
            <div class="sidebar-foot">
                <PlanIcon name="home" />
                <strong>
                    让每一件物品
                    <br />
                    都有自己的位置。
                </strong>
                <p>你的家，从一张清晰的平面图开始。</p>
                <span>知简 · 空间档案</span>
            </div>
        </aside>

        <div class="drawing-workspace">
            <div class="drawing-toolbar" aria-label="绘图工具">
                <div class="tool-group">
                    <button
                        v-for="item in tools"
                        :key="item.id"
                        class="tool-button"
                        :class="{ active: tool === item.id }"
                        :aria-pressed="tool === item.id"
                        :title="`${item.detail} (${item.key})`"
                        :disabled="!store.hasPlan || store.busy"
                        @click="chooseTool(item.id)"
                    >
                        <PlanIcon :name="item.id" />
                        <span>{{ item.label }}</span>
                        <kbd>{{ item.key }}</kbd>
                    </button>
                </div>
                <div class="history-group">
                    <button
                        title="撤销 (Ctrl+Z)"
                        aria-label="撤销"
                        :disabled="!store.canUndo"
                        @click="
                            cancel();
                            store.undo();
                        "
                    >
                        <PlanIcon name="undo" />
                    </button>
                    <button
                        title="重做 (Ctrl+Shift+Z)"
                        aria-label="重做"
                        :disabled="!store.canRedo"
                        @click="
                            cancel();
                            store.redo();
                        "
                    >
                        <PlanIcon name="redo" />
                    </button>
                </div>
            </div>
            <div class="canvas-wrap">
                <svg
                    :ref="(element) => (stage = element as SVGSVGElement | null)"
                    class="plan-canvas"
                    :style="{ cursor }"
                    tabindex="0"
                    aria-label="户型绘图画布"
                    @pointerdown="down"
                    @pointermove="move"
                    @pointerup="up"
                    @pointercancel="cancel"
                    @lostpointercapture="cancel"
                    @pointerleave="!drag && (hover = null)"
                    @wheel.prevent="wheel"
                    @contextmenu.prevent
                >
                    <defs>
                        <pattern
                            id="canvas-grid"
                            :width="60 * zoom"
                            :height="60 * zoom"
                            patternUnits="userSpaceOnUse"
                            :x="pan.x"
                            :y="pan.y"
                        >
                            <path
                                :d="`M ${60 * zoom} 0 H 0 V ${60 * zoom}`"
                                fill="none"
                                stroke="var(--draft-grid)"
                                stroke-width="0.6"
                            />
                            <circle cx="0" cy="0" r="1.15" fill="var(--draft-dot)" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="var(--draft-paper)" />
                    <rect v-if="showGrid" width="100%" height="100%" fill="url(#canvas-grid)" />
                    <g :transform="`translate(${pan.x}, ${pan.y}) scale(${zoom})`">
                        <PlanDrawing
                            :rooms="rooms"
                            :dimensions="showDimensions"
                            :materials="showMaterials"
                        />
                        <rect
                            v-if="selectedRoom && tool === 'select' && !selectedOpening"
                            :x="selectedRoom.x + 10 / zoom"
                            :y="selectedRoom.y + 10 / zoom"
                            :width="Math.max(0, selectedRoom.width - 20 / zoom)"
                            :height="Math.max(0, selectedRoom.height - 20 / zoom)"
                            fill="var(--brand-soft)"
                            :stroke="invalid ? 'var(--danger)' : 'var(--brand)'"
                            :stroke-width="1 / zoom"
                            :stroke-dasharray="`${4 / zoom} ${4 / zoom}`"
                            pointer-events="none"
                        />
                        <g v-if="selectedOpening && selectedRoom" pointer-events="none">
                            <rect
                                v-bind="
                                    openingBox(
                                        selectedRoom,
                                        selectedOpening,
                                        EXTERIOR_WALL + 8 / zoom,
                                    )
                                "
                                fill="var(--brand-soft)"
                                stroke="var(--brand)"
                                :stroke-width="1.5 / zoom"
                            />
                        </g>
                        <rect
                            v-for="handle in handles"
                            :key="handle.dir"
                            :data-room="selectedRoom?.id"
                            :data-handle="handle.dir"
                            :x="handle.x - 4 / zoom"
                            :y="handle.y - 4 / zoom"
                            :width="8 / zoom"
                            :height="8 / zoom"
                            rx="1"
                            fill="#fff"
                            :stroke="invalid ? 'var(--danger)' : 'var(--brand)'"
                            :stroke-width="1.5 / zoom"
                            :style="{ cursor: handle.cursor }"
                        />
                        <g v-if="drawRect" pointer-events="none">
                            <rect
                                v-bind="drawRect"
                                :fill="invalid ? 'var(--danger-soft)' : 'var(--brand-soft)'"
                                :stroke="invalid ? 'var(--danger)' : 'var(--brand)'"
                                :stroke-width="2 / zoom"
                                :stroke-dasharray="`${6 / zoom} ${3 / zoom}`"
                            />
                            <text
                                :x="drawRect.x + drawRect.width / 2"
                                :y="drawRect.y - 14 / zoom"
                                text-anchor="middle"
                                :font-size="12 / zoom"
                                fill="var(--brand)"
                            >
                                {{ mm(drawRect.width) }} × {{ mm(drawRect.height) }} mm
                            </text>
                        </g>
                        <g v-if="ghost" opacity="0.85" pointer-events="none">
                            <rect
                                v-bind="ghost.box"
                                fill="#fff"
                                stroke="var(--brand)"
                                :stroke-width="1 / zoom"
                            />
                            <template v-if="ghost.kind === 'door'">
                                <path
                                    :d="ghost.door.arc"
                                    fill="var(--brand-soft)"
                                    stroke="var(--brand)"
                                    :stroke-width="1 / zoom"
                                />
                                <line
                                    :x1="ghost.door.hinge.x"
                                    :y1="ghost.door.hinge.y"
                                    :x2="ghost.door.leaf.x"
                                    :y2="ghost.door.leaf.y"
                                    stroke="var(--brand)"
                                    :stroke-width="2 / zoom"
                                />
                            </template>
                            <line
                                v-for="(line, i) in ghost.kind === 'window' ? ghost.panes : []"
                                :key="i"
                                v-bind="line"
                                stroke="var(--brand)"
                                :stroke-width="1 / zoom"
                            />
                        </g>
                    </g>
                </svg>
                <div class="sheet-label">
                    <span>01</span>
                    <div>
                        <strong>住宅平面图</strong>
                        <small>FLOOR PLAN · 尺寸单位 mm</small>
                    </div>
                </div>
                <div class="north-mark" aria-label="图纸上方">
                    <span>图纸上方</span>
                    <svg viewBox="0 0 24 42" aria-hidden="true">
                        <path d="M12 2L4 28l8-5 8 5z" fill="none" stroke="currentColor" />
                        <path d="M12 2v35" stroke="currentColor" />
                    </svg>
                </div>

                <div v-if="store.status === 'loading'" class="canvas-overlay">
                    <p>正在读取空间档案…</p>
                </div>
                <div v-else-if="store.status === 'failed'" class="canvas-overlay">
                    <h2>暂时无法读取户型</h2>
                    <p>{{ store.errorMessage }}</p>
                    <button class="button primary" @click="store.load()">重新读取</button>
                </div>
                <div v-else-if="!store.hasPlan" class="canvas-overlay onboarding">
                    <span class="onboarding-icon"><PlanIcon name="room" /></span>
                    <p class="eyebrow">A PLACE FOR EVERYTHING</p>
                    <h2>画下家的第一笔</h2>
                    <p>
                        按真实尺寸勾勒房间，放上门窗，
                        <br />
                        建立属于你的家庭空间档案。
                    </p>
                    <form @submit.prevent="createPlan(false)">
                        <label>
                            户型名称
                            <input
                                v-model="newPlanName"
                                maxlength="40"
                                placeholder="例如：我的家"
                            />
                        </label>
                        <button
                            class="button primary"
                            :disabled="!newPlanName.trim() || store.busy"
                        >
                            从空白开始
                            <PlanIcon name="chevron" />
                        </button>
                    </form>
                    <button
                        class="text-button"
                        :disabled="!newPlanName.trim() || store.busy"
                        @click="createPlan(true)"
                    >
                        试试两室一厅示例 →
                    </button>
                </div>
                <div v-else-if="!store.rooms.length && tool !== 'room'" class="empty-prompt">
                    <PlanIcon name="room" />
                    <h3>从一个房间开始</h3>
                    <p>选择「房间」，在画布上拖出它的轮廓。</p>
                    <button class="button primary" @click="chooseTool('room')">
                        绘制第一个房间
                    </button>
                    <button class="text-button" :disabled="store.busy" @click="loadExample">
                        使用两室一厅示例
                    </button>
                </div>

                <div v-if="store.hasPlan" class="view-options">
                    <label>
                        <input v-model="showDimensions" type="checkbox" />
                        尺寸
                    </label>
                    <label>
                        <input v-model="showMaterials" type="checkbox" />
                        材质
                    </label>
                    <label>
                        <input v-model="showGrid" type="checkbox" />
                        网格
                    </label>
                </div>
                <div class="zoom-controls">
                    <button aria-label="缩小" title="缩小" @click="setZoom(zoom / 1.2)">
                        <PlanIcon name="minus" />
                    </button>
                    <button class="zoom-value" title="重置至 100%" @click="setZoom(1)">
                        {{ Math.round(zoom * 100) }}%
                    </button>
                    <button aria-label="放大" title="放大" @click="setZoom(zoom * 1.2)">
                        <PlanIcon name="plus" />
                    </button>
                    <span />
                    <button aria-label="适应画布" title="适应画布 (0)" @click="fit">
                        <PlanIcon name="fit" />
                    </button>
                </div>
                <div class="scale-ruler">
                    <div :style="{ width: `${60 * zoom}px` }" />
                    <span>1 m</span>
                </div>
            </div>
            <footer class="canvas-status">
                <span class="tool-status">
                    <i />
                    {{ activeTool.label }}
                    <span>{{ activeTool.detail }}</span>
                </span>
                <span class="keyboard-hints">
                    滚轮缩放
                    <span>·</span>
                    空格拖拽
                    <span>·</span>
                    Esc 取消
                </span>
            </footer>
        </div>

        <aside class="properties-sidebar" aria-label="属性面板">
            <div class="inspector-heading">
                <h3>{{ selectedOpening ? '门窗属性' : selectedRoom ? '房间属性' : '图纸概览' }}</h3>
                <span>{{ selectedOpening ? 'OPENING' : selectedRoom ? 'ROOM' : 'OVERVIEW' }}</span>
            </div>
            <template v-if="selectedRoom && selectedOpening">
                <div class="property-section">
                    <div class="object-heading">
                        <span class="object-icon"><PlanIcon :name="selectedOpening.kind" /></span>
                        <div>
                            <h2>{{ selectedOpening.kind === 'door' ? '平开门' : '标准窗' }}</h2>
                            <p>{{ selectedRoom.name }} · {{ wallNames[selectedOpening.wall] }}</p>
                        </div>
                    </div>
                    <label class="field-label">
                        洞口宽度
                        <span>mm</span>
                        <input
                            v-model="openingWidth"
                            aria-label="门窗宽度"
                            type="number"
                            min="400"
                            step="50"
                            :disabled="store.busy"
                            @change="updateOpening('width')"
                        />
                    </label>
                    <label class="field-label">
                        距墙起点
                        <span>mm</span>
                        <input
                            v-model="openingPosition"
                            aria-label="门窗偏移"
                            type="number"
                            min="0"
                            step="100"
                            :disabled="store.busy"
                            @change="updateOpening('pos')"
                        />
                    </label>
                    <button
                        v-if="selectedOpening.kind === 'door'"
                        class="button full-width"
                        :disabled="store.busy"
                        @click="
                            store.updateOpening(selectedOpening.id, {
                                hinge: selectedOpening.hinge === 'start' ? 'end' : 'start',
                            })
                        "
                    >
                        切换门扇铰链方向
                    </button>
                    <p class="field-help">门扇朝所属房间内开启。拖动图上的门窗，可沿墙调整位置。</p>
                </div>
                <div class="property-section">
                    <button class="text-button" @click="selectedOpeningId = null">
                        ← 返回房间属性
                    </button>
                    <button
                        class="button danger full-width"
                        :disabled="store.busy"
                        @click="removeSelection"
                    >
                        <PlanIcon name="trash" />
                        删除{{ selectedOpening.kind === 'door' ? '门' : '窗' }}
                    </button>
                </div>
            </template>
            <template v-else-if="selectedRoom">
                <div class="property-section">
                    <div class="object-heading">
                        <span class="object-icon"><PlanIcon name="room" /></span>
                        <div>
                            <h2>{{ selectedRoom.name }}</h2>
                            <p>矩形空间 · 墙体中心线尺寸</p>
                        </div>
                    </div>
                    <label class="field-label">
                        空间名称
                        <input
                            v-model="name"
                            aria-label="空间名称"
                            maxlength="40"
                            :disabled="store.busy"
                            @change="rename()"
                            @keydown.enter="($event.target as HTMLInputElement).blur()"
                        />
                    </label>
                    <div class="room-presets">
                        <button
                            v-for="preset in presets"
                            :key="preset"
                            :class="{ chosen: selectedRoom.name === preset }"
                            :disabled="store.busy"
                            @click="rename(preset)"
                        >
                            {{ preset }}
                        </button>
                    </div>
                </div>
                <div class="property-section">
                    <h4>
                        空间尺寸
                        <span>mm</span>
                    </h4>
                    <div class="size-fields">
                        <label class="field-label">
                            宽度
                            <input
                                v-model="width"
                                aria-label="房间宽度"
                                type="number"
                                min="1000"
                                max="100000"
                                step="100"
                                :disabled="store.busy"
                                @change="updateSize('width')"
                            />
                        </label>
                        <label class="field-label">
                            进深
                            <input
                                v-model="height"
                                aria-label="房间进深"
                                type="number"
                                min="1000"
                                max="100000"
                                step="100"
                                :disabled="store.busy"
                                @change="updateSize('height')"
                            />
                        </label>
                    </div>
                    <div class="area-summary">
                        <span>平面面积</span>
                        <strong>
                            {{ roomArea(selectedRoom).toFixed(1) }}
                            <small>m²</small>
                        </strong>
                    </div>
                    <p class="field-help">按墙体中心线计算；不作为套内净面积或建筑面积。</p>
                </div>
                <div class="property-section">
                    <h4>地面材质</h4>
                    <div class="material-options">
                        <button
                            v-for="material in [
                                { id: 'wood', label: '木地板' },
                                { id: 'tile', label: '大砖' },
                                { id: 'small', label: '小方砖' },
                                { id: 'marble', label: '大理石' },
                                { id: 'terrazzo', label: '水磨石' },
                                { id: 'carpet', label: '地毯' },
                            ] as const"
                            :key="material.id"
                            :class="{ chosen: resolveFloor(selectedRoom) === material.id }"
                            :disabled="store.busy"
                            @click="
                                store.setRoomFloor(selectedRoom.id, material.id);
                                showMaterials = true;
                            "
                        >
                            <span :class="`material-swatch ${material.id}`" />
                            {{ material.label }}
                        </button>
                    </div>
                    <p class="field-help">
                        前三种会按房间名自动推断（卧室木地板、厨卫小砖、其余大砖），手动选过之后不再跟随改名。
                    </p>
                </div>
                <div class="property-section">
                    <h4>
                        门窗
                        <span>{{ selectedRoom.openings.length }}</span>
                    </h4>
                    <div class="opening-list">
                        <button
                            v-for="opening in selectedRoom.openings"
                            :key="opening.id"
                            @click="selectOpening(selectedRoom, opening)"
                        >
                            <PlanIcon :name="opening.kind" />
                            <span>
                                {{ opening.kind === 'door' ? '平开门' : '标准窗' }}
                                <small>
                                    {{ wallNames[opening.wall] }} · {{ mm(opening.width) }} mm
                                </small>
                            </span>
                            <PlanIcon name="chevron" />
                        </button>
                        <p v-if="!selectedRoom.openings.length" class="field-help">
                            选择「门」或「窗」，点击墙面放置。
                        </p>
                    </div>
                    <div class="opening-actions">
                        <button class="button" @click="chooseTool('door')">
                            <PlanIcon name="door" />
                            加门
                        </button>
                        <button class="button" @click="chooseTool('window')">
                            <PlanIcon name="window" />
                            加窗
                        </button>
                    </div>
                </div>
                <div class="property-section">
                    <button
                        class="button danger full-width"
                        :disabled="store.busy"
                        @click="removeSelection"
                    >
                        <PlanIcon name="trash" />
                        删除房间
                    </button>
                </div>
            </template>
            <template v-else>
                <div class="property-section">
                    <div class="overview-area">
                        <span>总平面面积</span>
                        <strong>
                            {{ totalArea }}
                            <small>m²</small>
                        </strong>
                        <p>
                            {{ store.rooms.length }} 个空间
                            <span>/</span>
                            {{ openingCount }} 处门窗
                        </p>
                    </div>
                    <p class="field-help">按房间墙体中心线统计，实际使用面积以现场测量为准。</p>
                </div>
                <div class="property-section">
                    <h4>图纸表达</h4>
                    <div class="legend-item">
                        <span class="legend-wall exterior" />
                        <span>外侧墙体</span>
                        <small>240 mm</small>
                    </div>
                    <div class="legend-item">
                        <span class="legend-wall interior" />
                        <span>共用隔墙</span>
                        <small>120 mm</small>
                    </div>
                    <div class="legend-item">
                        <PlanIcon name="door" />
                        <span>平开门</span>
                        <small>900 mm</small>
                    </div>
                    <div class="legend-item">
                        <PlanIcon name="window" />
                        <span>标准窗</span>
                        <small>1500 mm</small>
                    </div>
                    <p class="field-help">墙厚为示意值，未区分承重属性。</p>
                </div>
                <div class="property-section guide">
                    <h4>三步画出你的家</h4>
                    <div>
                        <b>01</b>
                        <p>
                            <strong>勾勒房间</strong>
                            <span>拖出轮廓，相邻墙面自动吸附。</span>
                        </p>
                    </div>
                    <div>
                        <b>02</b>
                        <p>
                            <strong>校准尺寸</strong>
                            <span>选中房间，输入实测宽度与进深。</span>
                        </p>
                    </div>
                    <div>
                        <b>03</b>
                        <p>
                            <strong>放置门窗</strong>
                            <span>选择工具，直接点击对应墙面。</span>
                        </p>
                    </div>
                </div>
                <div class="drawing-note">
                    <span>绘图提示</span>
                    <p>
                        100 mm 网格吸附
                        <br />
                        共享墙只绘制一次
                        <br />
                        修改自动保存，可随时撤销
                    </p>
                </div>
            </template>
        </aside>
        <div
            v-if="message || (store.errorMessage && store.status !== 'failed')"
            class="editor-notice"
            role="status"
        >
            <span>{{ message || store.errorMessage }}</span>
            <button
                aria-label="关闭提示"
                @click="
                    message = '';
                    store.errorMessage = '';
                "
            >
                ×
            </button>
        </div>
        <svg ref="exportRef" class="export-source" :viewBox="exportBounds" aria-hidden="true">
            <rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff" />
            <title>{{ store.plan?.name }} · 住宅平面图（尺寸单位 mm，墙体中心线）</title>
            <PlanDrawing
                :rooms="store.rooms"
                :dimensions="showDimensions"
                :materials="showMaterials"
            />
        </svg>
    </section>
</template>

<style scoped src="./floor-plan-board.css"></style>
