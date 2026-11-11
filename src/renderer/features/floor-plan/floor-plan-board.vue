<script setup lang="ts">
/*============================================================================
  FloorPlanBoard — 全幅画板 + 悬浮控件

  布局原则：界面里没有一条常驻的 header / footer / 侧边栏，画布铺满整个窗口。
  所有控件都是浮在画布上的「悬浮件」：
    · 顶部居中 —— 快捷搜索（物品 / 储物设备 / 房间）
    · 左上角   —— 菜单（首页 / 房间 / 家具 / 储物 / 修改 / 图纸 / 导出）
    · 底部居中 —— 绘图工具与撤销重做（仅修改模式，浮在底栏之上）
    · 底部整条 —— 一条底栏：图纸角标 · 图层开关 · 比例尺 · 缩放

  右侧是唯一的详情区，三种内容互斥：
    · 看内容 —— 点房间或柜子，列出里面存着的东西（浏览模式的主视角）
    · 清单   —— 点左侧「房间 / 家具 / 储物」，列整体清单
    · 属性   —— 修改模式下改一个房间 / 门窗
  首页选中时右侧什么都不弹：只剩画布、搜索和左侧菜单。
============================================================================*/

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { FloorMaterial, Opening, Room, StorageKind, StoredItem } from '@/app/types';
import FloatCard from '@/components/float-card.vue';
import {
    bayGeometry,
    doorGeometry,
    openingBox,
    openingLabel,
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
import { searchPlan, type SearchHit } from '@/lib/plan-search';
import { layoutStorage } from '@/lib/plan-storage';
import { roomArea } from '@/stores/floor-plan';
import PlanDrawing from './plan-drawing.vue';
import PlanIcon from './plan-icon.vue';
import { exampleItems, exampleRooms, exampleStorage } from './plan-template';
import { usePlanEditor, type PlanTool } from './use-plan-editor';

const {
    store,
    stage,
    tool,
    mode,
    hoveredRoomId,
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
    setMode,
    focusRoom,
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

/*== 左侧菜单 ==============================================================
  首页是默认项：它不打开任何卡片，界面就只剩画布、搜索和菜单。
  房间 / 家具 / 储物 三项在右侧列出清单，点清单条目看里面存了什么。    */
type MenuId = 'home' | 'rooms' | 'furniture' | 'storage';
const menu = ref<MenuId>('home');
const menus: { id: MenuId; label: string; icon: string }[] = [
    { id: 'home', label: '首页', icon: 'home' },
    { id: 'rooms', label: '房间', icon: 'room' },
    { id: 'furniture', label: '家具', icon: 'sofa' },
    { id: 'storage', label: '储物', icon: 'cabinet' },
];

/*== 右侧详情的三种内容 ====================================================
  browse  —— 正在看哪个房间 / 柜子的内容
  detail  —— 修改模式下的属性编辑
  menu    —— 左侧三个清单项，没点具体对象时列整体清单                     */
const browse = ref<{ kind: 'room' | 'storage'; id: string } | null>(null);
const detail = ref(false);
/** 刚定位到的物品：让它闪一下，眼睛才跟得上。 */
const locatedItemId = ref<string | null>(null);
const hoverStorageId = ref<string | null>(null);

const materials: { id: FloorMaterial; label: string }[] = [
    { id: 'wood', label: '橡木地板' },
    { id: 'walnut', label: '胡桃木' },
    { id: 'diagonal', label: '斜铺木' },
    { id: 'tile', label: '大砖' },
    { id: 'subway', label: '长条砖' },
    { id: 'small', label: '小方砖' },
    { id: 'marble', label: '大理石' },
    { id: 'terrazzo', label: '水磨石' },
    { id: 'microcement', label: '微水泥' },
    { id: 'carpet', label: '地毯' },
];
const storageKinds: { id: StorageKind; label: string; icon: string }[] = [
    { id: 'cabinet', label: '柜子', icon: 'cabinet' },
    { id: 'shelf', label: '架子', icon: 'box' },
    { id: 'box', label: '收纳箱', icon: 'box' },
    { id: 'furniture', label: '家具', icon: 'sofa' },
];
const itemCategories = ['衣物', '书籍', '工具', '电子', '户外', '食品', '证件', '纪念', '其他'];

const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const searchFocused = ref(false);
const searchHits = computed(() =>
    searchPlan(
        { rooms: rooms.value, storage: store.storage, items: store.items },
        searchQuery.value,
    ),
);
const searchOpen = computed(
    () => searchFocused.value && searchQuery.value.trim().length > 0 && searchHits.value.length > 0,
);

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

/* 比例尺：60px = 1 m（PX_PER_METER），缩放后实际长度是 60 * zoom。
   固定写「1 m」在小缩放下只剩十几像素，读不出长度；改成从整长度里挑一个
   落在 60–150px 的档位，横线和文字一起变，比例尺才始终可用。 */
const SCALE_STEPS = [0.5, 1, 2, 5, 10, 20];
const scaleBar = computed(() => {
    const pxPerMeter = 60 * zoom.value;
    const fitStep = SCALE_STEPS.filter((meters) => pxPerMeter * meters <= 150).pop();
    const meters = fitStep ?? SCALE_STEPS[0];
    return { meters, width: Math.max(14, Math.round(pxPerMeter * meters)), label: `${meters} m` };
});

const totalArea = computed(() =>
    rooms.value.reduce((sum, r) => sum + (r.width * r.height) / 3600, 0).toFixed(1),
);
const openingCount = computed(() => rooms.value.reduce((sum, r) => sum + r.openings.length, 0));
/* 保存状态原本挂在左侧卡片标题上；卡片改成右侧互斥展示后没有落点了，
   状态本身仍由 store.status 驱动，这里不再单独算一份字符串。 */

/*== 储物设备与物品 ========================================================*/
const storageBoxes = computed(() => layoutStorage(rooms.value, store.storage));
const roomNames = computed(() => new Map(rooms.value.map((room) => [room.id, room.name])));

const itemsOfRoom = (roomId: string) => store.items.filter((item) => item.roomId === roomId);
const itemsOfStorage = (storageId: string) =>
    store.items.filter((item) => item.storageId === storageId);
const deviceOf = (id: string) => store.storage.find((device) => device.id === id) ?? null;
const iconOfKind = (kind: StorageKind) =>
    storageKinds.find((entry) => entry.id === kind)?.icon ?? 'cabinet';

/** 右侧「物品内容」卡片的数据：房间或柜子，二选一。 */
const browseRoom = computed<Room | null>(() => {
    const target = browse.value;
    if (!target) return null;
    const roomId = target.kind === 'room' ? target.id : (deviceOf(target.id)?.roomId ?? null);
    return roomId ? (rooms.value.find((room) => room.id === roomId) ?? null) : null;
});
const browseDevice = computed(() =>
    browse.value?.kind === 'storage' ? deviceOf(browse.value.id) : null,
);
const browseTitle = computed(() =>
    browseDevice.value ? browseDevice.value.name : (browseRoom.value?.name ?? ''),
);
const browseItems = computed<StoredItem[]>(() => {
    const device = browseDevice.value;
    if (device) return itemsOfStorage(device.id);
    const room = browseRoom.value;
    return room ? itemsOfRoom(room.id) : [];
});
/** 卡片顶部那一行：一共存放了多少物品。没有东西时明确说空，不留空白。 */
const browseCountLabel = computed(() => {
    if (!browseItems.value.length) return '暂时没有登记物品';
    const total = browseItems.value.reduce((sum, item) => sum + item.quantity, 0);
    return total === browseItems.value.length
        ? `一共 ${total} 件物品`
        : `一共 ${browseItems.value.length} 种 · ${total} 件物品`;
});

/** 物品行：副行在脚本里拼好。模板里用多个 <template> 拼空格会被格式化吃掉，
    渲染成「2 件· 衣柜」，所以先把分隔符定死。 */
const browseItemRows = computed(() =>
    browseItems.value.map((item) => ({
        id: item.id,
        name: item.name,
        item,
        meta: [
            item.category,
            item.quantity > 1 ? `${item.quantity} 件` : '',
            browseDevice.value || !item.storageId ? '' : (deviceOf(item.storageId)?.name ?? ''),
            item.note,
        ]
            .filter(Boolean)
            .join(' · '),
    })),
);

/** 画布上的「选中」样式：只有真的选中了房间 / 柜子才点亮，悬停是另一套浅一档的提示。 */
const activeRoomId = computed(() => {
    const target = browse.value;
    if (target?.kind === 'room') return target.id;
    if (mode.value === 'edit') return store.selectedId;
    return null;
});
const activeStorageId = computed(() => (browse.value?.kind === 'storage' ? browse.value.id : null));

/** 属性卡片里要用的两份列表：选中房间的柜子、选中房间的物品。
    模板箭头函数里 selectedRoom 的类型收窄会丢，一律在脚本层算好。 */
const roomStorage = computed(() =>
    selectedRoom.value
        ? store.storage.filter((entry) => entry.roomId === selectedRoom.value!.id)
        : [],
);
const roomItems = computed(() => (selectedRoom.value ? itemsOfRoom(selectedRoom.value.id) : []));

/*== 左侧清单：点「房间 / 家具 / 储物」时右侧列什么 ========================*/
interface PlaceEntry {
    kind: 'room' | 'storage';
    id: string;
    title: string;
    detail: string;
    icon: string;
    count: number;
}
const listEntries = computed<PlaceEntry[]>(() => {
    if (menu.value === 'rooms') {
        return rooms.value.map((room) => ({
            kind: 'room' as const,
            id: room.id,
            title: room.name,
            detail: `${roomArea(room).toFixed(1)} m² · ${room.openings.length} 处门窗`,
            icon: 'room',
            count: itemsOfRoom(room.id).length,
        }));
    }
    if (menu.value === 'furniture' || menu.value === 'storage') {
        return store.storage
            .filter((device) => menu.value === 'storage' || device.kind === 'furniture')
            .map((device) => ({
                kind: 'storage' as const,
                id: device.id,
                title: device.name,
                detail: roomNames.value.get(device.roomId) ?? '未归位',
                icon: iconOfKind(device.kind),
                count: itemsOfStorage(device.id).length,
            }));
    }
    return [];
});
const listEyebrow = computed(() =>
    menu.value === 'rooms' ? 'ROOMS' : menu.value === 'furniture' ? 'FURNITURE' : 'STORAGE',
);
const listTitle = computed(() =>
    menu.value === 'rooms' ? '房间' : menu.value === 'furniture' ? '家具' : '储物设备',
);
const listSubtitle = computed(() =>
    menu.value === 'rooms'
        ? `${rooms.value.length} 个空间 · ${totalArea.value} m² · ${openingCount.value} 处门窗`
        : `${listEntries.value.length} 件 · 点进去看里面存了什么`,
);
const listEmpty = computed(() =>
    menu.value === 'rooms'
        ? '还没有房间。开修改模式在画布上拖出第一个空间。'
        : menu.value === 'furniture'
          ? '还没有登记家具。开修改模式在房间里添加。'
          : '还没有储物设备。开修改模式在房间里添加柜子。',
);

/** 右侧只有一张卡片，内容优先级：看内容 > 属性 > 清单。 */
const rightCard = computed<'browse' | 'property' | 'list' | null>(() => {
    if (browse.value) return 'browse';
    if (detail.value) return 'property';
    if (menu.value !== 'home') return 'list';
    return null;
});

/*== 编辑模式下的两个小表单：加柜子、放东西 ================================*/
const newStorageName = ref('');
const newStorageKind = ref<StorageKind>('cabinet');
const itemName = ref('');
const itemCategory = ref('衣物');
const itemQuantity = ref(1);
const itemNote = ref('');
const itemStorageId = ref<string | null>(null);
const itemFormError = ref('');

function resetItemForm() {
    itemName.value = '';
    itemQuantity.value = 1;
    itemNote.value = '';
    itemFormError.value = '';
}

async function submitStorage() {
    const room = browseRoom.value;
    if (!room) return;
    const label =
        newStorageName.value.trim() ||
        (storageKinds.find((kind) => kind.id === newStorageKind.value)?.label ?? '柜子');
    if (await store.addStorage(room.id, label, newStorageKind.value)) {
        newStorageName.value = '';
        message.value = '';
    }
}

async function submitItem() {
    const room = browseRoom.value;
    if (!room) return;
    const label = itemName.value.trim();
    if (!label) {
        itemFormError.value = '先给物品起个名字';
        return;
    }
    if (
        !(await store.addItem({
            roomId: room.id,
            storageId: itemStorageId.value,
            name: label,
            category: itemCategory.value,
            quantity: Math.max(1, Math.round(Number(itemQuantity.value) || 1)),
            note: itemNote.value.trim(),
        }))
    ) {
        itemFormError.value = store.errorMessage || '保存失败';
        return;
    }
    resetItemForm();
}

/*== 画布交互 ==============================================================*/
const selectedFloorLabel = computed(() => {
    const room = selectedRoom.value;
    if (!room) return '自动推断';
    const id = resolveFloor(room);
    return materials.find((material) => material.id === id)?.label ?? '自动推断';
});
const cursor = computed(() =>
    drag.value?.kind === 'pan'
        ? 'grabbing'
        : mode.value === 'browse' || space.value || tool.value === 'hand'
          ? 'grab'
          : tool.value === 'select'
            ? 'default'
            : 'crosshair',
);
const handles = computed(() => {
    const room = selectedRoom.value;
    if (!room || selectedOpening.value || tool.value !== 'select' || mode.value !== 'edit')
        return [];
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
        bay: p.opening.kind === 'bay' ? bayGeometry(p.room, p.opening) : null,
        kind: p.opening.kind,
        // 位置不合法（飘窗落在隔墙上）时预览改用警示色，点下去也会被拦。
        blocked: p.blocked,
        ink: p.blocked ? 'var(--danger)' : 'var(--brand)',
        wash: p.blocked ? 'var(--danger-soft)' : 'var(--brand-soft)',
    };
});
const exportBounds = computed(() => {
    const b = boundsOf(store.rooms) ?? { x: 0, y: 0, width: 600, height: 500 };
    return `${b.x - 90} ${b.y - 90} ${b.width + 150} ${b.height + 150}`;
});
const mm = (px: number) => Math.round(px * MILLIMETERS_PER_PIXEL);
const wallNames = { top: '上侧墙', right: '右侧墙', bottom: '下侧墙', left: '左侧墙' };
const presets = ['客餐厅', '主卧', '次卧', '书房', '厨房', '卫生间', '阳台', '玄关'];
const tools: { id: PlanTool; label: string; key: string; detail: string }[] = [
    { id: 'select', label: '选择', key: 'V', detail: '选择、移动与调整房间' },
    { id: 'room', label: '房间', key: 'R', detail: '拖拽绘制房间，靠近墙面自动吸附' },
    { id: 'door', label: '门', key: 'D', detail: '点击墙面放置门，先选房间可指定开启侧' },
    { id: 'window', label: '窗', key: 'W', detail: '点击墙面放置窗' },
    {
        id: 'bay',
        label: '飘窗',
        key: 'B',
        detail: '点击墙面放置飘窗，会向外凸出一块窗台',
    },
    { id: 'hand', label: '平移', key: 'H', detail: '拖动画布查看户型' },
];

/*== 导航 ==================================================================*/
/** 左侧菜单：首页永远只是「收起一切」；其余三项各打开一张清单。 */
function goMenu(id: MenuId) {
    menu.value = id;
    browse.value = null;
    detail.value = false;
}

/** 点房间：浏览模式看里面有什么，修改模式才进属性。 */
function openRoom(id: string) {
    selectRoom(id);
    if (mode.value === 'edit') {
        browse.value = null;
        detail.value = true;
        return;
    }
    browse.value = { kind: 'room', id };
}

/** 画布上点柜子（pointerdown.stop 到这里，避免顺带平移画布）。
    浏览模式看里面存了什么；修改模式只是把房间属性调出来，不改柜子本身。 */
function pickStorage(id: string) {
    const device = deviceOf(id);
    if (!device) return;
    if (mode.value === 'edit') {
        selectRoom(device.roomId);
        browse.value = null;
        detail.value = true;
        return;
    }
    openStorage(id);
}

/** 菜单项再点一次就回首页：不想要卡片时不必去够关闭按钮。 */
function toggleMenu(id: MenuId) {
    goMenu(menu.value === id ? 'home' : id);
}

/** 点柜子：直接看这个柜子里存了什么。 */
function openStorage(id: string) {
    if (mode.value !== 'browse') return;
    const device = deviceOf(id);
    if (!device) return;
    selectRoom(device.roomId);
    browse.value = { kind: 'storage', id };
}

/** 点一件物品：把视线拉到它所在的房间，并让它在列表里闪一下。
    编辑模式下右侧正开着属性卡片，别被切成「看内容」。 */
function locateItem(item: StoredItem) {
    selectRoom(item.roomId);
    focusRoom(item.roomId);
    if (mode.value === 'browse') {
        browse.value = item.storageId
            ? { kind: 'storage', id: item.storageId }
            : { kind: 'room', id: item.roomId };
    }
    locatedItemId.value = item.id;
    window.setTimeout(() => {
        if (locatedItemId.value === item.id) locatedItemId.value = null;
    }, 1800);
}

/** 搜索命中的唯一下场：定位对象 + 收起下拉。 */
function goToHit(hit: SearchHit) {
    if (hit.kind === 'item') {
        const item = store.items.find((entry) => entry.id === hit.id);
        if (item) locateItem(item);
    } else if (hit.kind === 'storage') {
        pickStorage(hit.id);
    } else {
        openRoom(hit.id);
    }
    focusRoom(hit.roomId);
    searchQuery.value = '';
    searchFocused.value = false;
    searchInput.value?.blur();
}

/** 修改模式是一个显式开关：没开的时候画布只负责看和点。 */
function toggleMode() {
    if (mode.value === 'edit') {
        const roomId = browseRoom.value?.id ?? store.selectedId;
        setMode('browse');
        detail.value = false;
        browse.value = roomId ? { kind: 'room', id: roomId } : null;
        return;
    }
    // 进修改模式：把正在看的那个房间直接带进属性卡片，右侧不会突然空掉。
    const roomId = browseRoom.value?.id ?? store.selectedId;
    setMode('edit');
    browse.value = null;
    if (roomId) {
        selectRoom(roomId);
        detail.value = true;
    } else detail.value = false;
}

/* Ctrl/⌘ + K 聚焦搜索：浏览模式下最常用的动作得有个直达键。 */
function onShortcut(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.value?.focus();
        searchInput.value?.select();
    }
}
onMounted(() => window.addEventListener('keydown', onShortcut));
onUnmounted(() => window.removeEventListener('keydown', onShortcut));

/* 选中谁就展示谁：画布点选、清单点选都汇到这一个入口。 */
watch(
    () => store.selectedId,
    (id) => {
        if (!id) {
            if (mode.value === 'browse') browse.value = null;
            return;
        }
        if (mode.value === 'edit') {
            browse.value = null;
            detail.value = true;
            return;
        }
        // 点柜子时已经定好了要看柜子，别再被"选中房间"覆盖回房间。
        if (browse.value?.kind === 'storage') return;
        if (browse.value?.kind === 'room' && browse.value.id === id) return;
        browse.value = { kind: 'room', id };
    },
);
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
/* 换房间或换柜子时，物品表单的"放哪个柜子"要跟着回到合理默认值。 */
watch(browse, (target) => {
    itemStorageId.value = target?.kind === 'storage' ? target.id : null;
    resetItemForm();
});

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
    browse.value = null;
    detail.value = true;
}
async function createPlan(template: boolean) {
    if (!(await store.createPlan(newPlanName.value))) return;
    if (template) {
        await store.replaceRooms(exampleRooms());
        // 示例户型带着示例储物与物品：第一次打开就能试"点柜子看里面有什么"。
        await store.importFurnishing(exampleStorage(), exampleItems());
    } else tool.value = 'room';
    await nextTick();
    fit();
}
async function loadExample() {
    if (store.rooms.length) return;
    await store.replaceRooms(exampleRooms());
    await store.importFurnishing(exampleStorage(), exampleItems());
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
        <!--== 画板：铺满整个窗口，没有任何固定栏 ==-->
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
                    <!-- 浏览模式：虚线 == 选中，全站只有这一种虚线。
                         没选中的房间不描边（本来就有墙体线稿，再叠一圈虚线太吵）；
                         鼠标压上去给一条很淡的实线当「这里能点」的提示，不是虚线。-->
                    <g v-if="mode === 'browse'" pointer-events="none">
                        <rect
                            v-for="room in rooms"
                            :key="`edge-${room.id}`"
                            :x="room.x"
                            :y="room.y"
                            :width="room.width"
                            :height="room.height"
                            :data-selected="room.id === activeRoomId"
                            fill="none"
                            :stroke="
                                room.id === activeRoomId
                                    ? 'var(--brand)'
                                    : room.id === hoveredRoomId
                                      ? 'var(--room-line)'
                                      : 'transparent'
                            "
                            :stroke-width="(room.id === activeRoomId ? 1.8 : 1) / zoom"
                            :stroke-dasharray="
                                room.id === activeRoomId ? `${7 / zoom} ${5 / zoom}` : undefined
                            "
                            stroke-linecap="butt"
                        />
                    </g>
                    <!-- 储物设备：按房间自动铺成网格（不做自由拖拽）。
                         浏览模式下它们是「点得进去的柜子」，点了就看里面存了什么；
                         鼠标压上去加深，和房间边界的提示语言保持一致。-->
                    <g v-if="storageBoxes.length" class="storage-layer">
                        <g
                            v-for="box in storageBoxes"
                            :key="box.id"
                            class="storage-box"
                            :data-storage="box.id"
                            @pointerdown.stop="pickStorage(box.id)"
                            @pointerenter="hoverStorageId = box.id"
                            @pointerleave="hoverStorageId = null"
                        >
                            <!-- 柜子也落一层淡影，和墙体的光影方向保持一致（右下偏移） -->
                            <rect
                                :x="box.x + 1.6 / zoom"
                                :y="box.y + 2.2 / zoom"
                                :width="box.width"
                                :height="box.height"
                                rx="1.5"
                                fill="#1d2418"
                                :opacity="0.16"
                                pointer-events="none"
                            />
                            <rect
                                :x="box.x"
                                :y="box.y"
                                :width="box.width"
                                :height="box.height"
                                rx="1.5"
                                :data-selected="box.id === activeStorageId"
                                :fill="
                                    box.id === hoverStorageId
                                        ? 'var(--sto-fill-strong)'
                                        : 'var(--sto-fill)'
                                "
                                :stroke="
                                    box.id === activeStorageId
                                        ? 'var(--brand)'
                                        : box.id === hoverStorageId
                                          ? 'var(--sto-text)'
                                          : 'var(--sto-line)'
                                "
                                :stroke-width="(box.id === activeStorageId ? 1.8 : 1) / zoom"
                                :stroke-dasharray="
                                    box.id === activeStorageId
                                        ? `${6 / zoom} ${4 / zoom}`
                                        : undefined
                                "
                            />
                            <text
                                :x="box.x + box.width / 2"
                                :y="box.y + box.height / 2 + 3.2 / zoom"
                                text-anchor="middle"
                                :font-size="9.5 / zoom"
                                fill="var(--sto-text)"
                                pointer-events="none"
                            >
                                {{ box.name }}
                            </text>
                        </g>
                    </g>
                    <rect
                        v-if="
                            mode === 'edit' && selectedRoom && tool === 'select' && !selectedOpening
                        "
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
                    <g
                        v-if="mode === 'edit' && selectedOpening && selectedRoom"
                        pointer-events="none"
                    >
                        <rect
                            v-bind="
                                openingBox(selectedRoom, selectedOpening, EXTERIOR_WALL + 8 / zoom)
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
                            :stroke="ghost.ink"
                            :stroke-width="1 / zoom"
                        />
                        <template v-if="ghost.kind === 'door'">
                            <path
                                :d="ghost.door.arc"
                                :fill="ghost.wash"
                                :stroke="ghost.ink"
                                :stroke-width="1 / zoom"
                            />
                            <line
                                :x1="ghost.door.hinge.x"
                                :y1="ghost.door.hinge.y"
                                :x2="ghost.door.leaf.x"
                                :y2="ghost.door.leaf.y"
                                :stroke="ghost.ink"
                                :stroke-width="2 / zoom"
                            />
                        </template>
                        <line
                            v-for="(line, i) in ghost.kind === 'window' ? ghost.panes : []"
                            :key="i"
                            v-bind="line"
                            :stroke="ghost.ink"
                            :stroke-width="1 / zoom"
                        />
                        <template v-if="ghost.kind === 'bay' && ghost.bay">
                            <rect v-bind="ghost.bay.box" :fill="ghost.wash" />
                            <path
                                v-for="(pane, i) in ghost.bay.panes"
                                :key="`ghost-bay-${i}`"
                                :d="pane"
                                fill="none"
                                :stroke="ghost.ink"
                                :stroke-width="0.8 / zoom"
                                stroke-linejoin="round"
                            />
                            <line
                                v-bind="ghost.bay.sillEdge"
                                :stroke="ghost.ink"
                                :stroke-width="0.8 / zoom"
                                stroke-dasharray="4 3"
                            />
                        </template>
                    </g>
                </g>
            </svg>

            <!-- 图纸角标与指北针已收进左下角那条底栏，见下方 float-dock。 -->

            <!--== 画布提示层 ==-->
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
                        <input v-model="newPlanName" maxlength="40" placeholder="例如：我的家" />
                    </label>
                    <button class="button primary" :disabled="!newPlanName.trim() || store.busy">
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
            <div
                v-else-if="!store.rooms.length && !(mode === 'edit' && tool === 'room')"
                class="empty-prompt"
            >
                <PlanIcon name="room" />
                <h3>从一个房间开始</h3>
                <p>点「开始修改」进入修改模式，在画布上拖出它的轮廓。</p>
                <button class="button primary" @click="chooseTool('room')">绘制第一个房间</button>
                <button class="text-button" :disabled="store.busy" @click="loadExample">
                    使用两室一厅示例
                </button>
            </div>
        </div>

        <!--== 顶部居中：快捷搜索（物品 / 储物设备 / 房间 一起搜） ============-->
        <div class="float-search">
            <label class="search-box">
                <PlanIcon name="search" />
                <input
                    ref="searchInput"
                    v-model="searchQuery"
                    type="search"
                    placeholder="搜物品、柜子或房间"
                    aria-label="搜索物品、储物设备或房间"
                    @focus="searchFocused = true"
                    @blur="searchFocused = false"
                    @keydown.esc.prevent="
                        searchQuery = '';
                        ($event.target as HTMLInputElement).blur();
                    "
                    @keydown.enter.prevent="searchHits[0] && goToHit(searchHits[0])"
                />
                <kbd>Ctrl K</kbd>
            </label>
            <div v-if="searchOpen" class="search-results" role="listbox" aria-label="搜索结果">
                <button
                    v-for="hit in searchHits"
                    :key="`${hit.kind}-${hit.id}`"
                    class="search-hit"
                    role="option"
                    :aria-selected="hit.id === (browse?.id ?? store.selectedId)"
                    @mousedown.prevent="goToHit(hit)"
                >
                    <PlanIcon
                        :name="
                            hit.kind === 'item'
                                ? 'tag'
                                : hit.kind === 'storage'
                                  ? 'cabinet'
                                  : 'room'
                        "
                    />
                    <span class="item-main">
                        {{ hit.title }}
                        <small>{{ hit.detail }}</small>
                    </span>
                    <span class="hit-enter">↵</span>
                </button>
            </div>
            <p
                v-else-if="searchFocused && searchQuery.trim() && !searchHits.length"
                class="search-empty"
            >
                没有叫「{{ searchQuery.trim() }}」的房间、柜子或物品
            </p>
        </div>

        <!--== 左上：菜单（首页 / 房间 / 家具 / 储物 / 修改 / 图纸 / 导出） ==-->
        <nav class="float-rail rail-left" aria-label="菜单">
            <button
                v-for="item in menus"
                :key="item.id"
                :class="{ active: menu === item.id }"
                :title="item.label"
                :aria-label="item.label"
                :aria-pressed="menu === item.id"
                @click="toggleMenu(item.id)"
            >
                <PlanIcon :name="item.icon" />
                <span>{{ item.label }}</span>
            </button>
            <span class="rail-divider" />
            <button
                :title="mode === 'edit' ? '完成修改 (E)' : '开始修改户型 (E)'"
                :aria-label="mode === 'edit' ? '完成修改' : '开始修改户型'"
                :class="{ active: mode === 'edit', editing: mode === 'edit' }"
                :aria-pressed="mode === 'edit'"
                :disabled="!store.hasPlan || store.busy"
                @click="toggleMode"
            >
                <PlanIcon :name="mode === 'edit' ? 'check' : 'room'" />
                <span>{{ mode === 'edit' ? '完成' : '修改' }}</span>
            </button>
            <button
                title="图纸"
                aria-label="图纸"
                :class="{ active: detail }"
                :aria-pressed="detail"
                @click="detail = !detail"
            >
                <PlanIcon name="room" />
                <span>图纸</span>
            </button>
            <button
                title="导出图纸"
                aria-label="导出图纸"
                :disabled="!store.rooms.length || store.busy || exporting"
                @click="exportSvg"
            >
                <PlanIcon name="export" />
                <span>导出</span>
            </button>
        </nav>

        <!--== 底部居中：绘图工具 ============================================-->
        <div class="float-toolbar" aria-label="绘图工具">
            <div v-if="mode === 'browse'" class="browse-hint">
                <PlanIcon name="room" />
                <span>拖动看图 · 点房间或柜子看里面</span>
            </div>
            <template v-else>
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
                    </button>
                </div>
                <span class="tool-divider" />
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
            </template>
        </div>

        <!--== 底部：左下「看图纸」、右下「缩放」，两条分开 ====================
             左下只留三样：图纸编号与图名、图层开关、比例尺 —— 高度压到 34px，
             尽量把画板让出来。缩放单独放右下角，两者互不牵连。
             绘制工具条与浏览提示仍浮在左下底栏上方（见 float-toolbar）。-->
        <footer v-if="store.hasPlan" class="float-dock" aria-label="图纸信息与视图控制">
            <div class="dock-group dock-sheet">
                <span class="sheet-no">01</span>
                <span class="sheet-title">{{ store.plan?.name || '住宅平面图' }}</span>
                <span class="dock-north" title="图纸上方" aria-label="图纸上方">
                    <svg viewBox="0 0 24 42" aria-hidden="true">
                        <path d="M12 2L4 28l8-5 8 5z" fill="none" stroke="currentColor" />
                        <path d="M12 2v35" stroke="currentColor" />
                    </svg>
                </span>
            </div>

            <span class="dock-divider" />

            <div class="dock-views" role="group" aria-label="图层显示">
                <button
                    :class="{ active: showDimensions }"
                    :aria-pressed="showDimensions"
                    title="显示房间尺寸标注"
                    @click="showDimensions = !showDimensions"
                >
                    尺寸
                </button>
                <button
                    :class="{ active: showMaterials }"
                    :aria-pressed="showMaterials"
                    title="显示地面材质"
                    @click="showMaterials = !showMaterials"
                >
                    材质
                </button>
                <button
                    :class="{ active: showGrid }"
                    :aria-pressed="showGrid"
                    title="显示 100 mm 网格"
                    @click="showGrid = !showGrid"
                >
                    网格
                </button>
            </div>

            <span class="dock-divider" />

            <div class="scale-ruler" :title="`图上 ${scaleBar.label} 的实际长度`">
                <div :style="{ width: `${scaleBar.width}px` }" />
                <span>{{ scaleBar.label }}</span>
            </div>
        </footer>

        <!-- 缩放单独一条，钉在右下角。 -->
        <div v-if="store.hasPlan" class="float-zoom" role="group" aria-label="缩放">
            <button aria-label="缩小" title="缩小" @click="setZoom(zoom / 1.2)">
                <PlanIcon name="minus" />
            </button>
            <button class="zoom-value" title="重置至 100%" @click="setZoom(1)">
                {{ Math.round(zoom * 100) }}%
            </button>
            <button aria-label="放大" title="放大" @click="setZoom(zoom * 1.2)">
                <PlanIcon name="plus" />
            </button>
            <span class="dock-divider" />
            <button aria-label="适应画布" title="适应画布 (0)" @click="fit">
                <PlanIcon name="fit" />
            </button>
        </div>

        <!--== 右侧卡片 · 看内容（点房间 / 柜子） ==============================
            只回答一个问题：这里面有什么。名称 + 总件数 + 物品清单，
            其余（柜子清单、修改入口、面积说明）都不在这里出现，
            卡片贴着左侧菜单的顶部起，高度撑到画板底部，清单自己滚。-->
        <FloatCard
            v-if="rightCard === 'browse'"
            side="right"
            :title="browseTitle"
            :subtitle="browseCountLabel"
            :width="330"
            :top="50"
            stretch
            @close="browse = null"
        >
            <div class="card-list item-list">
                <button
                    v-for="row in browseItemRows"
                    :key="row.id"
                    class="card-list-item item-row"
                    :class="{ located: row.id === locatedItemId }"
                    @click="locateItem(row.item)"
                >
                    <PlanIcon name="tag" />
                    <span class="item-main">
                        {{ row.name }}
                        <small>{{ row.meta }}</small>
                    </span>
                    <PlanIcon name="fit" />
                </button>
                <p v-if="!browseItems.length" class="card-placeholder">
                    这里还是空的。开启修改模式，把东西登记进来。
                </p>
            </div>
        </FloatCard>

        <!--== 右侧卡片 · 属性（仅修改模式） =================================-->
        <FloatCard
            v-else-if="rightCard === 'property'"
            side="right"
            :eyebrow="selectedOpening ? 'OPENING' : selectedRoom ? 'ROOM' : 'OVERVIEW'"
            :title="selectedOpening ? '门窗属性' : selectedRoom ? '房间属性' : '图纸概览'"
            :subtitle="
                selectedOpening
                    ? `${selectedRoom?.name} · ${wallNames[selectedOpening.wall]}`
                    : selectedRoom
                      ? '矩形空间 · 墙体中心线尺寸'
                      : '整张图纸的尺寸与图例'
            "
            :width="304"
            @close="detail = false"
        >
            <template v-if="selectedRoom && selectedOpening">
                <div class="property-section">
                    <div class="object-heading">
                        <span class="object-icon">
                            <PlanIcon :name="selectedOpening.kind" />
                        </span>
                        <div>
                            <h2>{{ openingLabel(selectedOpening.kind) }}</h2>
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
                            <p>{{ roomArea(selectedRoom).toFixed(1) }} m² · 墙体中心线</p>
                        </div>
                    </div>
                    <!-- 浏览模式下这里是只读概况；改名、尺寸、材质、门窗、
                         删除全收进修改模式，避免看着看着手一滑就改坏了。-->
                    <div v-if="mode === 'browse'" class="readonly-facts">
                        <div>
                            <span>宽度</span>
                            <b>{{ mm(selectedRoom.width) }} mm</b>
                        </div>
                        <div>
                            <span>进深</span>
                            <b>{{ mm(selectedRoom.height) }} mm</b>
                        </div>
                        <div>
                            <span>门窗</span>
                            <b>{{ selectedRoom.openings.length }} 处</b>
                        </div>
                        <div v-if="selectedRoom.outdoor">
                            <span>空间</span>
                            <b>阳台</b>
                        </div>
                        <div>
                            <span>地面</span>
                            <b>{{ selectedFloorLabel }}</b>
                        </div>
                    </div>
                    <button
                        v-if="mode === 'browse'"
                        class="button full-width"
                        :disabled="!store.hasPlan || store.busy"
                        @click="toggleMode"
                    >
                        <PlanIcon name="room" />
                        修改这个房间
                    </button>
                    <template v-if="mode === 'edit'">
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
                        <div class="chip-row">
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
                    </template>
                </div>
                <div v-if="mode === 'edit'" class="property-section">
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
                    <p class="field-help">按墙体中心线计算；不作为套内净面积或建筑面积。</p>
                </div>
                <div v-if="mode === 'edit'" class="property-section">
                    <h4>空间类型</h4>
                    <label class="switch-row">
                        <input
                            type="checkbox"
                            :checked="selectedRoom.outdoor"
                            :disabled="store.busy"
                            @change="
                                store.setRoomOutdoor(
                                    selectedRoom.id,
                                    ($event.target as HTMLInputElement).checked,
                                )
                            "
                        />
                        <span>
                            <b>户外空间（阳台）</b>
                            <small>朝外的那几面墙会改画成栏杆，与别室共用的墙仍是实墙。</small>
                        </span>
                    </label>
                </div>
                <div v-if="mode === 'edit'" class="property-section">
                    <h4>地面材质</h4>
                    <div class="material-options">
                        <button
                            v-for="material in materials"
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
                        橡木地板、大砖、小方砖会按房间名自动推断；手动选过之后不再跟随改名。
                    </p>
                </div>
                <div v-if="mode === 'edit'" class="property-section">
                    <h4>
                        门窗
                        <span>{{ selectedRoom.openings.length }}</span>
                    </h4>
                    <div class="card-list">
                        <button
                            v-for="opening in selectedRoom.openings"
                            :key="opening.id"
                            class="card-list-item"
                            @click="selectOpening(selectedRoom, opening)"
                        >
                            <PlanIcon :name="opening.kind" />
                            <span class="item-main">
                                {{ openingLabel(opening.kind) }}
                                <small>
                                    {{ wallNames[opening.wall] }} · {{ mm(opening.width) }} mm
                                </small>
                            </span>
                            <PlanIcon name="chevron" />
                        </button>
                        <p v-if="!selectedRoom.openings.length" class="field-help">
                            选择「门」「窗」或「飘窗」，点击墙面放置。
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
                        <button class="button" @click="chooseTool('bay')">
                            <PlanIcon name="bay" />
                            加飘窗
                        </button>
                    </div>
                </div>
                <!-- 柜子与物品：只有修改模式才出现表单，浏览模式在右侧「看内容」卡片里 -->
                <div v-if="mode === 'edit'" class="property-section">
                    <h4>
                        柜子
                        <span>{{ roomStorage.length }}</span>
                    </h4>
                    <div class="card-list">
                        <button
                            v-for="device in roomStorage"
                            :key="device.id"
                            class="card-list-item"
                            @click="pickStorage(device.id)"
                        >
                            <PlanIcon :name="iconOfKind(device.kind)" />
                            <span class="item-main">
                                {{ device.name }}
                                <small>{{ itemsOfStorage(device.id).length }} 件物品</small>
                            </span>
                            <span
                                class="row-action"
                                title="删除这个柜子"
                                role="button"
                                tabindex="0"
                                @click.stop="store.removeStorage(device.id)"
                                @keydown.enter.stop="store.removeStorage(device.id)"
                            >
                                <PlanIcon name="trash" />
                            </span>
                        </button>
                        <p v-if="!roomStorage.length" class="field-help">
                            还没有柜子。选个类型加一个，物品就能挂进去。
                        </p>
                    </div>
                    <div class="storage-form">
                        <div class="chip-row">
                            <button
                                v-for="kind in storageKinds"
                                :key="kind.id"
                                :class="{ chosen: newStorageKind === kind.id }"
                                :disabled="store.busy"
                                @click="newStorageKind = kind.id"
                            >
                                {{ kind.label }}
                            </button>
                        </div>
                        <label class="field-label">
                            柜子名称
                            <input
                                v-model="newStorageName"
                                aria-label="柜子名称"
                                maxlength="30"
                                :placeholder="
                                    storageKinds.find((kind) => kind.id === newStorageKind)?.label
                                "
                                :disabled="store.busy"
                                @keydown.enter="submitStorage"
                            />
                        </label>
                        <button
                            class="button full-width"
                            :disabled="store.busy"
                            @click="submitStorage"
                        >
                            <PlanIcon name="plus" />
                            加一个柜子
                        </button>
                    </div>
                </div>

                <div v-if="mode === 'edit'" class="property-section">
                    <h4>
                        物品
                        <span>{{ roomItems.length }}</span>
                    </h4>
                    <div class="card-list">
                        <button
                            v-for="item in roomItems"
                            :key="item.id"
                            class="card-list-item"
                            @click="locateItem(item)"
                        >
                            <PlanIcon name="tag" />
                            <span class="item-main">
                                {{ item.name }}
                                <small>
                                    {{ item.category }}
                                    <template v-if="item.quantity > 1">
                                        · {{ item.quantity }} 件
                                    </template>
                                    ·
                                    {{
                                        item.storageId
                                            ? (deviceOf(item.storageId)?.name ?? '柜子')
                                            : '未入柜'
                                    }}
                                </small>
                            </span>
                            <span
                                class="row-action"
                                title="删除这件物品"
                                role="button"
                                tabindex="0"
                                @click.stop="store.removeItem(item.id)"
                                @keydown.enter.stop="store.removeItem(item.id)"
                            >
                                <PlanIcon name="trash" />
                            </span>
                        </button>
                        <p v-if="!roomItems.length" class="field-help">还没有登记物品。</p>
                    </div>
                    <div class="item-form">
                        <label class="field-label">
                            物品名称
                            <input
                                v-model="itemName"
                                aria-label="物品名称"
                                maxlength="40"
                                placeholder="例如：换季被褥"
                                :disabled="store.busy"
                                @keydown.enter="submitItem"
                            />
                        </label>
                        <div class="chip-row">
                            <button
                                v-for="category in itemCategories"
                                :key="category"
                                :class="{ chosen: itemCategory === category }"
                                :disabled="store.busy"
                                @click="itemCategory = category"
                            >
                                {{ category }}
                            </button>
                        </div>
                        <div class="size-fields">
                            <label class="field-label">
                                数量
                                <input
                                    v-model.number="itemQuantity"
                                    aria-label="物品数量"
                                    type="number"
                                    min="1"
                                    max="9999"
                                    :disabled="store.busy"
                                />
                            </label>
                            <label class="field-label">
                                放在
                                <select
                                    v-model="itemStorageId"
                                    aria-label="放在哪个柜子"
                                    :disabled="store.busy"
                                >
                                    <option :value="null">房间空位</option>
                                    <option
                                        v-for="device in roomStorage"
                                        :key="device.id"
                                        :value="device.id"
                                    >
                                        {{ device.name }}
                                    </option>
                                </select>
                            </label>
                        </div>
                        <label class="field-label">
                            备注
                            <input
                                v-model="itemNote"
                                aria-label="物品备注"
                                maxlength="200"
                                placeholder="选填，例如：顶层左侧"
                                :disabled="store.busy"
                            />
                        </label>
                        <p v-if="itemFormError" class="field-help error">{{ itemFormError }}</p>
                        <button
                            class="button full-width"
                            :disabled="store.busy"
                            @click="submitItem"
                        >
                            <PlanIcon name="plus" />
                            登记这件物品
                        </button>
                    </div>
                </div>

                <div v-if="mode === 'edit'" class="property-section">
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
                <p class="card-note">
                    100 mm 网格吸附 · 共享墙只绘制一次 · 修改自动保存，可随时撤销
                </p>
            </template>
        </FloatCard>

        <!--== 右侧卡片 · 清单（点左侧 房间 / 家具 / 储物） =================-->
        <FloatCard
            v-else-if="rightCard === 'list'"
            side="right"
            :eyebrow="listEyebrow"
            :title="listTitle"
            :subtitle="listSubtitle"
            :width="322"
            @close="goMenu('home')"
        >
            <div class="card-list">
                <button
                    v-for="entry in listEntries"
                    :key="entry.id"
                    class="card-list-item"
                    :class="{ active: entry.id === browse?.id }"
                    @click="entry.kind === 'room' ? openRoom(entry.id) : openStorage(entry.id)"
                >
                    <PlanIcon :name="entry.icon" />
                    <span class="item-main">
                        {{ entry.title }}
                        <small>{{ entry.detail }}</small>
                    </span>
                    <span class="item-count">{{ entry.count }}</span>
                    <PlanIcon name="chevron" />
                </button>
                <p v-if="!listEntries.length" class="card-placeholder">{{ listEmpty }}</p>
            </div>
            <template v-if="!listEntries.length" #footer>
                <button class="button full-width" @click="toggleMode">
                    <PlanIcon name="plus" />
                    {{ mode === 'edit' ? '正在修改' : '开始修改' }}
                </button>
            </template>
        </FloatCard>

        <!--== 提示条 ========================================================-->
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

        <!--== 导出用的隐藏图纸 ==============================================-->
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
