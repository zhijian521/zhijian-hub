<script setup lang="ts">
/*============================================================================
  FloorPlanBoard — 全幅画板 + 悬浮控件

  布局原则：界面里没有一条常驻的 header / footer / 侧边栏，画布铺满整个窗口。
  所有控件都是浮在画布上的「悬浮件」：
    · 顶部居中 —— 快捷搜索（物品 / 家具 / 房间）
    · 左上角   —— 菜单（首页 / 房间 / 家具 / 导出）
    · 底部居中 —— 绘图工具、撤销重做与「完成」（仅修改模式，浮在底栏之上）
    · 底部整条 —— 一条底栏：图纸角标（也是图纸概览入口）· 图层开关 · 比例尺 · 缩放

  修改模式没有常驻开关：入口是「房间」清单每一行行尾的修改按钮，
  以及房间内容卡底部的「修改这个房间」；唯一的出口是工具条最右边的「完成」。

  右侧是唯一的详情区，三种内容互斥：
    · 看内容 —— 点房间或家具，列出里面存着的东西（浏览模式的主视角）
    · 清单   —— 点左侧「房间 / 家具」，列整体清单
    · 属性   —— 修改模式下改一个房间 / 门窗
  首页选中时右侧什么都不弹：只剩画布、搜索和左侧菜单。
============================================================================*/

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
    FloorMaterial,
    Opening,
    Room,
    StorageDevice,
    StorageKind,
    StoredItem,
    WallSide,
} from '@/app/types';
import FloatCard from '@/components/float-card.vue';
import {
    BAY_DEPTH_MAX,
    BAY_DEPTH_MIN,
    bayDepth,
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
    bayFits,
    boundsOf,
    clampOpening,
    connectableWalls,
    EXTERIOR_WALL,
    MILLIMETERS_PER_PIXEL,
    sideNeighbours,
    wallIsOpen,
    wallOpenings,
} from '@/lib/plan-scene';
import { searchPlan, type SearchHit } from '@/lib/plan-search';
import {
    boxInsideRoom,
    furnitureSize,
    layoutStorage,
    MAX_FURNITURE_SIDE,
    MIN_FURNITURE_SIZE,
    roomAtPoint,
    type StorageBox,
} from '@/lib/plan-storage';
import {
    FURNITURE_PRESETS,
    furnitureDrawing,
    isSideways,
    normalizeRotation,
    presetOf,
    type FurnitureDrawing,
    type FurniturePreset,
    type FurnitureRotation,
} from '@/lib/furniture-catalog';
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
  房间 / 家具 两项在右侧列出清单，点清单条目看里面存了什么。    */
type MenuId = 'home' | 'rooms' | 'furniture';
const menu = ref<MenuId>('home');
const menus: { id: MenuId; label: string; icon: string }[] = [
    { id: 'home', label: '首页', icon: 'home' },
    { id: 'rooms', label: '房间', icon: 'room' },
    // 家具与储物是同一件事：衣柜、书柜、冰箱都是"能放东西的家具"，
    // 所以只有一张表、一个菜单项，下面按原型区分。
    { id: 'furniture', label: '家具', icon: 'sofa' },
];

/*== 右侧详情的三种内容 ====================================================
  browse  —— 正在看哪个房间 / 家具的内容
  detail  —— 修改模式下的属性编辑
  menu    —— 左侧三个清单项，没点具体对象时列整体清单                     */
const browse = ref<{ kind: 'room' | 'storage'; id: string } | null>(null);
const detail = ref(false);
/** 刚定位到的物品：让它闪一下，眼睛才跟得上。 */
const locatedItemId = ref<string | null>(null);
const hoverStorageId = ref<string | null>(null);
/** 摆家具那一档里选中的家具：只在这档有意义，房间属性卡不再管家具。 */
const furnitureSelection = ref<string | null>(null);
const furnitureName = ref('');

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
/** 形态只决定清单里用什么图标；具体是什么家具由原型（preset）决定。 */
const kindIcons: Record<StorageKind, string> = {
    cabinet: 'cabinet',
    shelf: 'box',
    box: 'box',
    furniture: 'sofa',
};
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
/* 房间名、面积、侧边尺寸链只在**修改模式**里画。
   浏览态一律是干净底图 —— 首页、三个清单页、以及在房间菜单里选中某一间看内容，
   都算浏览态：这些时候要回答的是「东西在哪」，文字会压在家具上，
   尺寸链还会围着墙绕一圈。需要知道「这是哪一间、多大」的只有改图的时候。 */
const showRoomLabels = computed(() => mode.value === 'edit');
const newPlanName = ref('我的家');
const name = ref('');
const width = ref(0);
const height = ref(0);
const openingWidth = ref(900);
const openingPosition = ref(0);
/* 飘窗进深单独一个输入框：只有飘窗有这个参数，窗与门没有窗台可凸。 */
const openingDepth = ref(26 * MILLIMETERS_PER_PIXEL);
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

/*== 家具与物品 ============================================================*/
const storageBoxes = computed(() => layoutStorage(rooms.value, store.storage));
/** 每件家具的平面画法：原型决定床有枕头、沙发有扶手、冰箱有门缝。 */
/** 家具在画布上怎么落位。
 *
 * 转角 90 度时 furnitureDrawing 会把宽深换过来画（局部坐标系仍是「长边朝右」），
 * 所以这里必须真的绕家具中心转 90 度，否则 120×90 的床会按 90×120 画，
 * 直接压出房间边界。 */
function furnitureTransform(box: StorageBox, drawing: FurnitureDrawing): string {
    if (drawing.rotation === 0) return `translate(${box.x} ${box.y})`;
    // 90 / 180 / 270 都绕家具中心转：局部坐标系的画法不变，占地仍是同一个外接矩形。
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    return `translate(${cx} ${cy}) rotate(${drawing.rotation}) translate(${-drawing.localWidth / 2} ${-drawing.localHeight / 2})`;
}

const storageViews = computed(() =>
    storageBoxes.value.map((box) => {
        const drawing = furnitureDrawing(box);
        return {
            box,
            drawing,
            transform: furnitureTransform(box, drawing),
            preset: presetOf(box.preset),
        };
    }),
);
const roomNames = computed(() => new Map(rooms.value.map((room) => [room.id, room.name])));

const itemsOfRoom = (roomId: string) => store.items.filter((item) => item.roomId === roomId);
const itemsOfStorage = (storageId: string) =>
    store.items.filter((item) => item.storageId === storageId);
const deviceOf = (id: string) => store.storage.find((device) => device.id === id) ?? null;
const iconOfKind = (kind: StorageKind) => kindIcons[kind] ?? 'cabinet';

/** 属性清单里的一行小字：原型 + 实际尺寸 + 存了几件东西。 */
function deviceDetail(device: StorageDevice): string {
    const box = storageBoxes.value.find((entry) => entry.id === device.id);
    const own = box ? furnitureSize(box) : null;
    const size = own ? mm(own.width) + '×' + mm(own.height) : presetOf(device.preset)?.hint;
    const preset = presetOf(device.preset)?.name;
    return [
        preset === device.name ? '' : preset,
        size,
        itemsOfStorage(device.id).length + ' 件物品',
    ]
        .filter(Boolean)
        .join(' · ');
}

/** 右侧「物品内容」卡片的数据：房间或家具，二选一。 */
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

/** 画布上的「选中」样式：只有真的选中了房间 / 家具才点亮，悬停是另一套浅一档的提示。 */
const activeRoomId = computed(() => {
    const target = browse.value;
    if (target?.kind === 'room') return target.id;
    // 修改与摆家具两档都靠 store.selectedId 指认房间：前者是"要改这一间"，
    // 后者是"新家具会落进这一间"。
    if (mode.value !== 'browse') return store.selectedId;
    return null;
});
const activeStorageId = computed(() => {
    if (mode.value === 'furniture') return furnitureSelection.value;
    return browse.value?.kind === 'storage' ? browse.value.id : null;
});

/** 属性卡片里要用的两份列表：选中房间的家具、选中房间的物品。
    模板箭头函数里 selectedRoom 的类型收窄会丢，一律在脚本层算好。 */
const roomStorage = computed(() =>
    selectedRoom.value
        ? store.storage.filter((entry) => entry.roomId === selectedRoom.value!.id)
        : [],
);
const roomItems = computed(() => (selectedRoom.value ? itemsOfRoom(selectedRoom.value.id) : []));

/** 能拆的边：只列真的贴着别的房间的墙。朝室外的墙拆了不叫连通，叫漏风。
    已经拆掉、但邻居后来被删掉的边也要留在列表里 —— 否则那条边再也补不回去。 */
const openWallOptions = computed(() => {
    const room = selectedRoom.value;
    if (!room) return [];
    const sides = [...new Set([...connectableWalls(store.rooms, room), ...room.openWalls])];
    return sides.map((side) => {
        const names = sideNeighbours(store.rooms, room, side).map((other) => other.name);
        return {
            side,
            label: wallNames[side],
            neighbours: names.length ? `与${names.join('、')}之间` : '原本的邻居已经删掉',
            open: room.openWalls.includes(side),
        };
    });
});

/** 传出去的是勾选后的完整集合，不是开关的增量。 */
function toggleOpenWall(side: WallSide) {
    const room = selectedRoom.value;
    if (!room || store.busy) return;
    const next = room.openWalls.includes(side)
        ? room.openWalls.filter((wall) => wall !== side)
        : [...room.openWalls, side];
    void store.setRoomOpenWalls(room.id, next);
}

/*== 左侧清单：点「房间 / 家具」时右侧列什么 ==============================*/
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
            detail: [
                `${roomArea(room).toFixed(1)} m²`,
                `${room.openings.length} 处门窗`,
                room.openWalls.length ? `打通 ${room.openWalls.length} 面` : '',
            ]
                .filter(Boolean)
                .join(' · '),
            icon: 'room',
            count: itemsOfRoom(room.id).length,
        }));
    }
    if (menu.value === 'furniture') {
        return store.storage.map((device) => {
            const preset = presetOf(device.preset)?.name;
            return {
                kind: 'storage' as const,
                id: device.id,
                title: device.name,
                // 用户没改名时 title 就等于原型名，别写成「衣柜 · 衣柜」。
                detail: [
                    roomNames.value.get(device.roomId) ?? '未归位',
                    preset === device.name ? '' : preset,
                ]
                    .filter(Boolean)
                    .join(' · '),
                icon: iconOfKind(device.kind),
                count: itemsOfStorage(device.id).length,
            };
        });
    }
    return [];
});
const listEyebrow = computed(() => (menu.value === 'rooms' ? 'ROOMS' : 'FURNITURE'));
const listTitle = computed(() => (menu.value === 'rooms' ? '房间' : '家具'));
const listSubtitle = computed(() =>
    menu.value === 'rooms'
        ? `${rooms.value.length} 个空间 · ${totalArea.value} m² · ${openingCount.value} 处门窗`
        : `${listEntries.value.length} 件家具 · 点进去看里面存了什么`,
);
const listEmpty = computed(() =>
    menu.value === 'rooms'
        ? '还没有房间。开修改模式在画布上拖出第一个空间。'
        : '还没有家具。开修改模式把家具拖进房间。',
);

/** 右侧只有一张卡片，内容优先级：摆家具 > 看内容 > 属性 > 清单。 */
const rightCard = computed<'furniture' | 'browse' | 'property' | 'list' | null>(() => {
    // 家具是独立一档：这一档里右侧固定是家具面板，不会被"点了个房间"顶掉。
    if (mode.value === 'furniture') return 'furniture';
    if (browse.value) return 'browse';
    if (detail.value) return 'property';
    if (menu.value !== 'home') return 'list';
    return null;
});

/*== 编辑模式下的两个小表单：家具库、放东西 ================================*/
/* 家具库：原型是"点一下 / 拖一下"的唯一入口。
   点「加一件」按房间宽度自动排；从库里拖到画布上，就落在手指松开的地方。 */
const newFurniturePreset = ref<string>('wardrobe');
const chosenPreset = computed<FurniturePreset>(
    () => presetOf(newFurniturePreset.value) ?? (FURNITURE_PRESETS[0] as FurniturePreset),
);
const furnitureNotice = ref('');
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

/** 点「放一件」：不动坐标，交给自动网格排在房间左上角那一片。 */
async function submitFurniture() {
    const roomId = furnitureRoomId.value;
    if (!roomId) {
        furnitureNotice.value = '先选一个房间，家具才有地方放。';
        return;
    }
    const preset = chosenPreset.value;
    furnitureNotice.value = '';
    if (await store.addStorage(roomId, preset.name, preset.kind, { preset: preset.id })) {
        message.value = '';
    }
}

/*== 从家具库拖到画布 ======================================================
  指针事件挂在 window 上：一旦起拖，鼠标跑到画布外也不会丢失这次拖拽。
  落点用 stage 的矩形 + pan / zoom 反向换算成画板坐标，和 usePlanEditor 里
  的 local() 是同一套换算，所以"拖到哪里就落在哪里"跟画布上看到的一致。 */
interface FurnitureDrop {
    room: Room | null;
    x: number;
    y: number;
    width: number;
    height: number;
    legal: boolean;
}
const furnitureDrag = ref<{ preset: FurniturePreset; drop: FurnitureDrop | null } | null>(null);

function boardPoint(event: PointerEvent) {
    const rect = stage.value?.getBoundingClientRect();
    if (!rect) return null;
    return {
        x: (event.clientX - rect.left - pan.value.x) / zoom.value,
        y: (event.clientY - rect.top - pan.value.y) / zoom.value,
    };
}

/** 算出这件家具如果现在松手会落在哪：以指针为中心，尺寸取原型的真实尺寸。 */
function dropAt(preset: FurniturePreset, event: PointerEvent): FurnitureDrop | null {
    const point = boardPoint(event);
    if (!point) return null;
    const box = {
        x: point.x - preset.width / 2,
        y: point.y - preset.height / 2,
        width: preset.width,
        height: preset.height,
    };
    const room = roomAtPoint(rooms.value, point.x, point.y);
    return { room, ...box, legal: room ? boxInsideRoom(room, box) : false };
}

function moveFurnitureDrag(event: PointerEvent) {
    const current = furnitureDrag.value;
    if (!current) return;
    furnitureDrag.value = { preset: current.preset, drop: dropAt(current.preset, event) };
}

function stopFurnitureDrag() {
    window.removeEventListener('pointermove', moveFurnitureDrag);
    window.removeEventListener('pointerup', endFurnitureDrag);
    window.removeEventListener('pointercancel', cancelFurnitureDrag);
    furnitureDrag.value = null;
}

function cancelFurnitureDrag() {
    stopFurnitureDrag();
    furnitureNotice.value = '';
}

function startFurnitureDrag(preset: FurniturePreset, event: PointerEvent) {
    if (mode.value !== 'furniture' || store.busy) return;
    event.preventDefault();
    furnitureNotice.value = '';
    furnitureDrag.value = { preset, drop: dropAt(preset, event) };
    window.addEventListener('pointermove', moveFurnitureDrag);
    window.addEventListener('pointerup', endFurnitureDrag);
    window.addEventListener('pointercancel', cancelFurnitureDrag);
}

async function endFurnitureDrag(event: PointerEvent) {
    const current = furnitureDrag.value;
    if (!current) return;
    const drop = dropAt(current.preset, event);
    stopFurnitureDrag();
    if (!drop || !drop.room) {
        furnitureNotice.value = '拖到房间里松手，家具才有归属。';
        return;
    }
    if (!drop.legal) {
        furnitureNotice.value = '这里放不下：家具会压到墙上，换个位置再松手。';
        return;
    }
    const ok = await store.addStorage(drop.room.id, current.preset.name, current.preset.kind, {
        preset: current.preset.id,
        x: drop.x,
        y: drop.y,
        width: drop.width,
        height: drop.height,
        rotation: 0,
    });
    if (ok) {
        furnitureNotice.value = '';
        furnitureRoomId.value = drop.room.id;
    }
}

/** 拖拽中的跟手预览：位置合法用品牌色，压到墙上用警示色。 */
const furnitureGhost = computed(() => {
    const current = furnitureDrag.value;
    // 从右侧家具库起拖时指针还在卡片上，没有房间可归属；预览照样要跟着走，
    // 否则用户会以为"按下去没反应"。
    if (!current?.drop) return null;
    const drop = current.drop;
    return {
        x: drop.x,
        y: drop.y,
        width: drop.width,
        height: drop.height,
        drawing: furnitureDrawing({
            preset: current.preset.id,
            width: drop.width,
            height: drop.height,
        }),
        ink: drop.legal ? 'var(--brand)' : 'var(--danger)',
        wash: drop.legal ? 'var(--brand-soft)' : 'var(--danger-soft)',
    };
});

/*== 家具的尺寸、位置与朝向 ================================================
  三样东西都只改这一件家具，不碰房间几何：家具档的房间是锁死的。
  单位一律 mm（与房间属性卡一致），存回库里仍是画板像素。

  一个约定：界面上填的「宽度 / 进深」是**家具本体**的尺寸，不是占地外接框。
  侧过来摆（90 / 270）时两者是对调的，所以读写都要经过 furnitureSize / isSideways。 */

/** 家具尺寸的下限 / 上限，换算成毫米，和主进程那一套界限一一对应。 */
const FURNITURE_MIN_MM = Math.round(MIN_FURNITURE_SIZE * MILLIMETERS_PER_PIXEL);
const FURNITURE_MAX_MM = Math.round(MAX_FURNITURE_SIDE * MILLIMETERS_PER_PIXEL);

/** 选中家具当前的方框（含自动网格算出来的那一份），尺寸/位置输入都照它回填。 */
const furnitureBox = computed<StorageBox | null>(
    () => storageBoxes.value.find((box) => box.id === furnitureSelection.value) ?? null,
);
/** 当前朝向：0 / 90 / 180 / 270，脏数据按 0 处理。 */
const furnitureRotation = computed<FurnitureRotation>(() =>
    normalizeRotation(furnitureBox.value?.rotation),
);
/** 四档朝向的中文说法：0 度是原型本身的方向，顺时针一圈回来。 */
const ROTATION_LABELS: { value: FurnitureRotation; label: string }[] = [
    { value: 0, label: '0°' },
    { value: 90, label: '90°' },
    { value: 180, label: '180°' },
    { value: 270, label: '270°' },
];
const furnitureWidth = ref(0);
const furnitureHeight = ref(0);
const furnitureLeft = ref(0);
const furnitureTop = ref(0);
const furnitureFormError = ref('');

/** 把当前家具的真实尺寸与位置回填到输入框（每次改完都重新对齐，不靠乐观值）。 */
function syncFurnitureForm() {
    const box = furnitureBox.value;
    const room = box ? rooms.value.find((entry) => entry.id === box.roomId) : null;
    if (!box || !room) {
        furnitureWidth.value = 0;
        furnitureHeight.value = 0;
        furnitureLeft.value = 0;
        furnitureTop.value = 0;
        return;
    }
    const size = furnitureSize(box);
    furnitureWidth.value = mm(size.width);
    furnitureHeight.value = mm(size.height);
    // 位置按「离房间左上角多远」显示：绝对坐标是画板内部的事，用户想的是距墙多少。
    furnitureLeft.value = mm(box.x - room.x);
    furnitureTop.value = mm(box.y - room.y);
}

/** 改尺寸或改位置：统一走 place-storage，最后把方框夹回房间里。 */
async function applyFurniture(field: 'size' | 'position') {
    const box = furnitureBox.value;
    const room = box ? rooms.value.find((entry) => entry.id === box.roomId) : null;
    if (!box || !room || store.busy) return;
    furnitureFormError.value = '';
    const toPx = (value: number) => value / MILLIMETERS_PER_PIXEL;

    let { width, height } = box;
    let x = box.x;
    let y = box.y;

    if (field === 'size') {
        const wanted = Number(furnitureWidth.value);
        const deep = Number(furnitureHeight.value);
        if (!Number.isFinite(wanted) || !Number.isFinite(deep) || wanted <= 0 || deep <= 0) {
            furnitureFormError.value = '宽度和进深都要填正数。';
            syncFurnitureForm();
            return;
        }
        const wPx = toPx(wanted);
        const hPx = toPx(deep);
        if (Math.min(wPx, hPx) < MIN_FURNITURE_SIZE || Math.max(wPx, hPx) > MAX_FURNITURE_SIDE) {
            furnitureFormError.value = `家具尺寸要在 ${FURNITURE_MIN_MM}–${FURNITURE_MAX_MM} mm 之间。`;
            syncFurnitureForm();
            return;
        }
        // 侧着摆时占地宽深与本体宽深对调，别把 1.2 m 的床改成 1.2 m 宽 2 m 深。
        if (isSideways(box.rotation)) {
            width = hPx;
            height = wPx;
        } else {
            width = wPx;
            height = hPx;
        }
    } else {
        const left = Number(furnitureLeft.value);
        const top = Number(furnitureTop.value);
        if (!Number.isFinite(left) || !Number.isFinite(top) || left < 0 || top < 0) {
            furnitureFormError.value = '距墙的距离不能是负数。';
            syncFurnitureForm();
            return;
        }
        x = room.x + toPx(left);
        y = room.y + toPx(top);
    }

    if (width > room.width || height > room.height) {
        furnitureFormError.value = '这个尺寸塞不进这间房，先把家具改小或换个房间。';
        syncFurnitureForm();
        return;
    }
    // 一律先夹进墙内：宁可位置被拉回来，也不要留半截家具插在墙里。
    x = Math.min(Math.max(x, room.x), room.x + room.width - width);
    y = Math.min(Math.max(y, room.y), room.y + room.height - height);

    await store.placeStorage(
        box.id,
        Math.round(x * 100) / 100,
        Math.round(y * 100) / 100,
        Math.round(width * 100) / 100,
        Math.round(height * 100) / 100,
        box.rotation,
        room.id,
    );
    syncFurnitureForm();
}

/** 换成某一档朝向：90 / 270 与 0 / 180 之间切换时，占地宽深对调，中心点保持不动。 */
async function applyFurnitureRotation(next: FurnitureRotation) {
    const box = furnitureBox.value;
    const room = box ? rooms.value.find((entry) => entry.id === box.roomId) : null;
    if (!box || !room || store.busy) return;
    furnitureFormError.value = '';
    if (normalizeRotation(box.rotation) === next) return;

    let { width, height } = box;
    if (isSideways(box.rotation) !== isSideways(next)) {
        width = box.height;
        height = box.width;
    }
    if (width > room.width || height > room.height) {
        furnitureFormError.value = '这间房放不下转过来的家具，先换个位置或改小一点。';
        return;
    }
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const x = Math.min(Math.max(centerX - width / 2, room.x), room.x + room.width - width);
    const y = Math.min(Math.max(centerY - height / 2, room.y), room.y + room.height - height);
    await store.placeStorage(box.id, x, y, width, height, next, room.id);
    syncFurnitureForm();
}

/** 清单行尾那个按钮：按 0 → 90 → 180 → 270 循环，一下一下点比开面板快。 */
async function rotateDevice(device: StorageDevice) {
    const box = storageBoxes.value.find((entry) => entry.id === device.id);
    if (!box || store.busy) return;
    const next = ((normalizeRotation(box.rotation) + 90) % 360) as FurnitureRotation;
    furnitureSelection.value = device.id;
    await applyFurnitureRotation(next);
}

/*== 摆家具：独立一档，只动家具，不动墙 ===================================*/

/** 选中的家具（只在这一档有意义）：右侧面板与画布描边都看它。 */
const furnitureDevice = computed(
    () => store.storage.find((device) => device.id === furnitureSelection.value) ?? null,
);
/** 新家具默认落进哪个房间：跟着左栏选中的房间走，可以手动改。 */
const furnitureRoomId = ref<string | null>(null);
/** 家具面板里列谁：只列「放进」那一栏选中的房间，一屏看得到头。 */
const furnitureRoomStorage = computed(() =>
    furnitureRoomId.value
        ? store.storage.filter((device) => device.roomId === furnitureRoomId.value)
        : [],
);

function enterFurniture() {
    if (!store.hasPlan) return;
    if (mode.value !== 'furniture') setMode('furniture');
    menu.value = 'furniture';
    browse.value = null;
    detail.value = false;
    if (!furnitureRoomId.value || !store.rooms.some((r) => r.id === furnitureRoomId.value)) {
        furnitureRoomId.value = store.selectedId ?? store.rooms[0]?.id ?? null;
    }
    if (furnitureSelection.value && !furnitureDevice.value) furnitureSelection.value = null;
}

/** 退出摆家具：回到纯浏览，右侧卡片一起收掉。 */
function exitFurniture() {
    furnitureSelection.value = null;
    cancelFurnitureMove();
    cancelFurnitureDrag();
    setMode('browse');
    goMenu('home');
}

function selectFurniture(id: string) {
    const device = deviceOf(id);
    if (!device) return;
    furnitureSelection.value = id;
    furnitureName.value = device.name;
    // 选中一件家具就把视线挪到它所在的房间，免得选了却看不见。
    selectRoom(device.roomId);
}

async function renameFurniture() {
    const device = furnitureDevice.value;
    if (!device || store.busy) return;
    const label = furnitureName.value.trim();
    if (!label) {
        furnitureName.value = device.name;
        return;
    }
    if (label !== device.name) await store.renameStorage(device.id, label);
}

async function removeFurniture(device: StorageDevice) {
    if (store.busy) return;
    if (furnitureSelection.value === device.id) furnitureSelection.value = null;
    await store.removeStorage(device.id);
}

/* 拖动已有家具：按住家具拖到新位置（可以跨房间）。
   与「从库里拖一件新的」共用同一套落点判定，只是落定后发 place-storage。 */
interface FurnitureMove {
    id: string;
    pointer: number;
    /** 指针到家具左上角的偏移，保证拖动时家具不会跳到指针正下方。 */
    dx: number;
    dy: number;
    width: number;
    height: number;
    rotation: number;
    drop: FurnitureDrop | null;
}
const furnitureMove = ref<FurnitureMove | null>(null);

function moveDropAt(current: FurnitureMove, event: PointerEvent): FurnitureDrop | null {
    const point = boardPoint(event);
    if (!point) return null;
    const box = {
        x: point.x + current.dx,
        y: point.y + current.dy,
        width: current.width,
        height: current.height,
    };
    // 用家具中心找房间：跨界拖动时最直观 —— 一半压过墙就换隔壁那间。
    const room = roomAtPoint(rooms.value, box.x + box.width / 2, box.y + box.height / 2);
    return { room, ...box, legal: room ? boxInsideRoom(room, box) : false };
}

function onMoveMove(event: PointerEvent) {
    const current = furnitureMove.value;
    if (!current || current.pointer !== event.pointerId) return;
    furnitureMove.value = { ...current, drop: moveDropAt(current, event) };
}

function stopFurnitureMove() {
    window.removeEventListener('pointermove', onMoveMove);
    window.removeEventListener('pointerup', endFurnitureMove);
    window.removeEventListener('pointercancel', cancelFurnitureMove);
}

function cancelFurnitureMove() {
    stopFurnitureMove();
    furnitureMove.value = null;
}

async function endFurnitureMove(event: PointerEvent) {
    const current = furnitureMove.value;
    if (!current) return;
    const drop = moveDropAt(current, event);
    stopFurnitureMove();
    furnitureMove.value = null;
    if (!drop || !drop.room) {
        furnitureNotice.value = '松手的地方没有房间，家具会留在原处。';
        return;
    }
    if (!drop.legal) {
        furnitureNotice.value = '这里放不下：家具会压到墙上，换个位置再松手。';
        return;
    }
    furnitureNotice.value = '';
    furnitureRoomId.value = drop.room.id;
    await store.placeStorage(
        current.id,
        Math.round(drop.x),
        Math.round(drop.y),
        current.width,
        current.height,
        current.rotation,
        drop.room.id,
    );
}

function startFurnitureMove(device: StorageDevice, event: PointerEvent) {
    if (mode.value !== 'furniture' || store.busy) return;
    const box = storageBoxes.value.find((entry) => entry.id === device.id);
    const point = boardPoint(event);
    if (!box || !point) return;
    event.preventDefault();
    selectFurniture(device.id);
    furnitureNotice.value = '';
    furnitureMove.value = {
        id: device.id,
        pointer: event.pointerId,
        dx: box.x - point.x,
        dy: box.y - point.y,
        width: box.width,
        height: box.height,
        rotation: box.rotation,
        drop: null,
    };
    window.addEventListener('pointermove', onMoveMove);
    window.addEventListener('pointerup', endFurnitureMove);
    window.addEventListener('pointercancel', cancelFurnitureMove);
}

/** 拖动中的家具：原位置留一个虚框，跟手的位置用品牌色/警示色标出。 */
const furnitureMoveGhost = computed(() => {
    const current = furnitureMove.value;
    const box = current ? storageBoxes.value.find((entry) => entry.id === current.id) : null;
    if (!current?.drop || !box) return null;
    return {
        from: { x: box.x, y: box.y, width: box.width, height: box.height },
        drop: current.drop,
    };
});

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
        : mode.value === 'furniture'
          ? furnitureMove.value
              ? 'grabbing'
              : hoverStorageId.value
                ? 'move'
                : 'grab'
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
/** 左侧菜单：首页永远只是「收起一切」；其余三项各打开一张清单。
    回首页是彻底的「收工」：选中清空、卡片全关，正在修改的话连修改模式一起退出 ——
    否则回到首页还留着可编辑的工具条和属性卡，和"首页只是看"的定位不符。 */
function goMenu(id: MenuId) {
    menu.value = id;
    browse.value = null;
    detail.value = false;
    // 离开「家具」这一档就退回浏览态：那一档里房间几何是锁死的，
    // 关掉它之后不该还留着半锁的界面。
    if (mode.value === 'furniture' && id !== 'furniture') {
        furnitureSelection.value = null;
        furnitureMove.value = null;
        setMode('browse');
    }
    if (id === 'home') {
        selectRoom(null);
        if (mode.value === 'edit') setMode('browse');
    }
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

/** 画布上点家具（pointerdown.stop 到这里，避免顺带平移画布）。
    三个模式三种下场：摆家具时它是一段拖动，浏览时打开"里面有什么"，
    修改房间几何时只把房间选上 —— 家具本身不归那一档管。 */
function onStoragePointerDown(id: string, event: PointerEvent) {
    if (mode.value === 'furniture') {
        const device = deviceOf(id);
        if (device) startFurnitureMove(device, event);
        return;
    }
    pickStorage(id);
}

function pickStorage(id: string) {
    const device = deviceOf(id);
    if (!device) return;
    if (mode.value === 'edit') {
        selectRoom(device.roomId);
        return;
    }
    openStorage(id);
}

/** 菜单项再点一次就回首页：不想要卡片时不必去够关闭按钮。
    「家具」不是一张清单，而是一档独立的编辑态，走它自己的入口。 */
function toggleMenu(id: MenuId) {
    if (id === 'furniture') {
        if (mode.value === 'furniture') goMenu('home');
        else enterFurniture();
        return;
    }
    goMenu(menu.value === id ? 'home' : id);
}

/** 点家具：直接看这件家具里存了什么。 */
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
        // 摆家具时搜到的家具直接选中它，别去开「里面有东西」那张卡。
        if (mode.value === 'furniture') selectFurniture(hit.id);
        else pickStorage(hit.id);
    } else {
        openRoom(hit.id);
    }
    focusRoom(hit.roomId);
    searchQuery.value = '';
    searchFocused.value = false;
    searchInput.value?.blur();
}

/** 「修改这个房间」：从看内容一步跨进编辑态，直接带着这一间进属性卡。
    房间清单的每一行、以及右侧内容卡的底部按钮，都走这一个入口。 */
function editRoom(id: string) {
    if (mode.value !== 'edit') setMode('edit');
    selectRoom(id);
    browse.value = null;
    detail.value = true;
    focusRoom(id);
}

/** 图纸概览：左栏不再有「图纸」按钮，入口改到底栏那张图纸角标上。 */
function toggleOverview() {
    if (detail.value && !selectedRoom.value && !selectedOpening.value) {
        detail.value = false;
        return;
    }
    browse.value = null;
    selectRoom(null);
    menu.value = 'home';
    detail.value = true;
}

/** 修改模式是一个显式开关：没开的时候画布只负责看和点。 */
function toggleMode() {
    if (mode.value === 'furniture') {
        exitFurniture();
        return;
    }
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
        return;
    }
    // 摆家具这一档不归 usePlanEditor 的键盘表管（那张表只认编辑模式），
    // 所以 Delete 删家具在这里接一下。
    if (mode.value !== 'furniture') return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (
        event.target instanceof Element &&
        event.target.closest('input, select, textarea, button, [contenteditable]')
    )
        return;
    const device = furnitureDevice.value;
    if (!device) return;
    event.preventDefault();
    void removeFurniture(device);
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
        if (mode.value === 'furniture') {
            browse.value = null;
            detail.value = false;
            // 在画布上点房间就是「下一件家具放这儿」。
            furnitureRoomId.value = id;
            return;
        }
        if (mode.value === 'edit') {
            browse.value = null;
            detail.value = true;
            return;
        }
        // 点家具时已经定好了要看家具，别再被「选中房间」覆盖回房间。
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
        openingDepth.value = o ? mm(bayDepth(o)) : 26 * MILLIMETERS_PER_PIXEL;
    },
    { immediate: true },
);
/* 选中家具后，重命名框跟上它的当前名字，尺寸/位置输入也照当前方框回填。 */
watch(furnitureDevice, (device) => {
    furnitureName.value = device?.name ?? '';
    syncFurnitureForm();
});
/* 家具被拖到别的位置 / 别间房、或者房间本身变了，输入框都要跟着现实走。 */
watch(furnitureBox, () => syncFurnitureForm());

/* 换房间或换家具时，物品表单里「放在哪件家具」要跟着回到合理默认值。 */
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
        openingDepth.value = mm(bayDepth(current));
    }
}

/* 飘窗进深：200–1000 mm，改成别的形状都不用重算位置，只影响外凸多远。
   超范围的直接拦掉并说明，不然飘窗会长进隔壁房间的墙里。 */
async function updateBayDepth() {
    const opening = selectedOpening.value;
    if (!opening) return;
    const value = Number(openingDepth.value);
    if (
        !Number.isFinite(value) ||
        value < BAY_DEPTH_MIN * MILLIMETERS_PER_PIXEL ||
        value > BAY_DEPTH_MAX * MILLIMETERS_PER_PIXEL
    ) {
        message.value = `进深要在 ${Math.round(BAY_DEPTH_MIN * MILLIMETERS_PER_PIXEL)}–${Math.round(BAY_DEPTH_MAX * MILLIMETERS_PER_PIXEL)} mm 之间`;
    } else {
        const room = store.selectedRoom;
        const depthPx = value / MILLIMETERS_PER_PIXEL;
        // 用新进深试算一次几何，凸出的窗台不能压到隔壁房间。
        if (room && !bayFits(store.rooms, room, { ...opening, depth: depthPx })) {
            message.value = '这个进深会伸进隔壁房间，换个位置或把进深调小一些。';
        } else {
            message.value = '';
            await store.updateOpening(opening.id, { depth: depthPx });
        }
    }
    const current = selectedOpening.value;
    if (current) openingDepth.value = mm(bayDepth(current));
}
/** 门窗清单的第二行：墙面 · 宽度；门补开向，飘窗补进深。
    墙被拆掉时这扇门只是「藏起来了」，还留在数据里，得在清单里说明，不然看着像丢了。 */
function openingDetail(opening: Opening, room: Room) {
    const base = `${wallNames[opening.wall]} · ${mm(opening.width)} mm`;
    const extra =
        opening.kind === 'door'
            ? ` · ${opening.swing === 'out' ? '外开' : '内开'}`
            : opening.kind === 'bay'
              ? ` · 进深 ${mm(bayDepth(opening))} mm`
              : '';
    return wallIsOpen(store.rooms, room, opening.wall) ? `${base}${extra} · 墙已拆` : base + extra;
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
        // 示例户型带着示例家具与物品：第一次打开就能试「点家具看里面有什么」。
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
                        :dimensions="showDimensions && showRoomLabels"
                        :materials="showMaterials"
                        :labels="showRoomLabels"
                    />
                    <!-- 浏览模式：虚线 == 选中，全站只有这一种虚线。
                         没选中的房间不描边（本来就有墙体线稿，再叠一圈虚线太吵）；
                         鼠标压上去给一条很淡的实线当「这里能点」的提示，不是虚线。-->
                    <g v-if="mode !== 'edit'" pointer-events="none">
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
                    <!-- 家具：每件按自己的原型画（床有枕头、沙发有扶手、冰箱有门缝）。
                         浏览模式下它们是「点得进去的家具」，点了就看里面存了什么；
                         鼠标压上去加深，和房间边界的提示语言保持一致。-->
                    <g v-if="storageViews.length" class="storage-layer">
                        <g
                            v-for="view in storageViews"
                            :key="view.box.id"
                            class="storage-box"
                            :data-storage="view.box.id"
                            @pointerdown.stop="onStoragePointerDown(view.box.id, $event)"
                            @pointerenter="hoverStorageId = view.box.id"
                            @pointerleave="hoverStorageId = null"
                        >
                            <!-- 命中区：家具本身是一堆形状拼出来的，其中很多是描边或 pointer-events:none，
                                 整组 <g> 没有面积可命中，点上去只会落到地板矩形上。这里补一块透明的
                                 矩形盖住整件家具，点击与拖动的落点才稳定。-->
                            <rect
                                :x="view.box.x"
                                :y="view.box.y"
                                :width="view.box.width"
                                :height="view.box.height"
                                rx="1.5"
                                fill="transparent"
                                pointer-events="all"
                            />
                            <!-- 家具也落一层淡影，和墙体的光影方向保持一致（右下偏移） -->
                            <rect
                                :x="view.box.x + 1.6 / zoom"
                                :y="view.box.y + 2.2 / zoom"
                                :width="view.box.width"
                                :height="view.box.height"
                                rx="1.5"
                                fill="#1d2418"
                                :opacity="0.16"
                                pointer-events="none"
                            />
                            <g
                                :transform="view.transform"
                                :data-selected="view.box.id === activeStorageId"
                                pointer-events="none"
                            >
                                <template
                                    v-for="(shape, index) in view.drawing.shapes"
                                    :key="index"
                                >
                                    <rect
                                        v-if="shape.kind === 'rect'"
                                        :x="shape.x"
                                        :y="shape.y"
                                        :width="shape.width"
                                        :height="shape.height"
                                        :rx="shape.rx"
                                        :fill="shape.fill ?? 'none'"
                                        :stroke="shape.stroke ?? 'none'"
                                        :stroke-width="shape.strokeWidth ?? 0"
                                        :opacity="shape.opacity ?? 1"
                                    />
                                    <line
                                        v-else
                                        :x1="shape.x1"
                                        :y1="shape.y1"
                                        :x2="shape.x2"
                                        :y2="shape.y2"
                                        :stroke="shape.stroke ?? 'none'"
                                        :stroke-width="shape.strokeWidth ?? 1"
                                        :opacity="shape.opacity ?? 1"
                                        stroke-linecap="round"
                                    />
                                </template>
                            </g>
                            <!-- 悬停 / 选中才描这一圈：家具自己的细节已经够密，
                                 常驻一圈描边会变成"每件家具都套了个框"。 -->
                            <rect
                                v-if="
                                    view.box.id === activeStorageId ||
                                    view.box.id === hoverStorageId
                                "
                                :x="view.box.x"
                                :y="view.box.y"
                                :width="view.box.width"
                                :height="view.box.height"
                                rx="1.5"
                                fill="none"
                                :stroke="
                                    view.box.id === activeStorageId
                                        ? 'var(--brand)'
                                        : 'var(--sto-text)'
                                "
                                :stroke-width="(view.box.id === activeStorageId ? 1.8 : 1) / zoom"
                                :stroke-dasharray="
                                    view.box.id === activeStorageId
                                        ? `${6 / zoom} ${4 / zoom}`
                                        : undefined
                                "
                                pointer-events="none"
                            />
                            <text
                                v-if="view.box.height > 22 || view.box.id === activeStorageId"
                                :x="view.box.x + view.box.width / 2"
                                :y="view.box.y + view.box.height - 4 / zoom"
                                text-anchor="middle"
                                :font-size="8.5 / zoom"
                                fill="var(--sto-text)"
                                pointer-events="none"
                            >
                                {{ view.box.name }}
                            </text>
                        </g>
                    </g>
                    <!-- 拖放预览：跟着指针走的半透明家具，落在房间外会变红。 -->
                    <g v-if="furnitureMoveGhost" class="storage-layer" pointer-events="none">
                        <rect
                            :x="furnitureMoveGhost.from.x"
                            :y="furnitureMoveGhost.from.y"
                            :width="furnitureMoveGhost.from.width"
                            :height="furnitureMoveGhost.from.height"
                            rx="1.5"
                            fill="none"
                            stroke="var(--line-strong)"
                            :stroke-width="1 / zoom"
                            :stroke-dasharray="`${5 / zoom} ${4 / zoom}`"
                        />
                        <rect
                            :x="furnitureMoveGhost.drop.x"
                            :y="furnitureMoveGhost.drop.y"
                            :width="furnitureMoveGhost.drop.width"
                            :height="furnitureMoveGhost.drop.height"
                            rx="1.5"
                            :fill="
                                furnitureMoveGhost.drop.legal
                                    ? 'var(--brand-soft)'
                                    : 'var(--danger-soft)'
                            "
                            :stroke="
                                furnitureMoveGhost.drop.legal ? 'var(--brand)' : 'var(--danger)'
                            "
                            :stroke-width="1.4 / zoom"
                            :stroke-dasharray="`${6 / zoom} ${4 / zoom}`"
                        />
                    </g>
                    <g v-if="furnitureGhost" class="storage-layer" pointer-events="none">
                        <g :transform="`translate(${furnitureGhost.x} ${furnitureGhost.y})`">
                            <rect
                                :width="furnitureGhost.width"
                                :height="furnitureGhost.height"
                                rx="1.5"
                                :fill="furnitureGhost.wash"
                                :stroke="furnitureGhost.ink"
                                :stroke-width="1.4 / zoom"
                                :stroke-dasharray="`${6 / zoom} ${4 / zoom}`"
                            />
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
                <p>点下面的按钮进入修改模式，在画布上拖出它的轮廓。</p>
                <button class="button primary" @click="chooseTool('room')">绘制第一个房间</button>
                <button class="text-button" :disabled="store.busy" @click="loadExample">
                    使用两室一厅示例
                </button>
            </div>
        </div>

        <!--== 顶部居中：快捷搜索（物品 / 家具 / 房间 一起搜） ================-->
        <div class="float-search">
            <label class="search-box">
                <PlanIcon name="search" />
                <input
                    ref="searchInput"
                    v-model="searchQuery"
                    type="search"
                    placeholder="搜物品、家具或房间"
                    aria-label="搜索物品、家具或房间"
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
                没有叫「{{ searchQuery.trim() }}」的房间、家具或物品
            </p>
        </div>

        <!--== 左上：菜单（首页 / 房间 / 家具 / 导出） ========-->
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
                <span>拖动看图 · 点房间或家具看里面</span>
            </div>
            <template v-else-if="mode === 'furniture'">
                <div class="browse-hint">
                    <PlanIcon name="sofa" />
                    <span>拖动家具换位置 · 从右侧挑一件放进房间</span>
                </div>
                <span class="tool-divider" />
                <div class="history-group">
                    <button
                        title="撤销 (Ctrl+Z)"
                        aria-label="撤销"
                        :disabled="!store.canUndo"
                        @click="store.undo()"
                    >
                        <PlanIcon name="undo" />
                    </button>
                    <button
                        title="重做 (Ctrl+Shift+Z)"
                        aria-label="重做"
                        :disabled="!store.canRedo"
                        @click="store.redo()"
                    >
                        <PlanIcon name="redo" />
                    </button>
                </div>
                <span class="tool-divider" />
                <button
                    class="tool-button done-button"
                    title="完成摆家具"
                    :disabled="store.busy"
                    @click="toggleMode"
                >
                    <PlanIcon name="check" />
                    <span>完成</span>
                </button>
            </template>
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
                <span class="tool-divider" />
                <button
                    class="tool-button done-button"
                    title="完成修改 (E)"
                    :disabled="store.busy"
                    @click="toggleMode"
                >
                    <PlanIcon name="check" />
                    <span>完成</span>
                </button>
            </template>
        </div>

        <!--== 底部：左下「看图纸」、右下「缩放」，两条分开 ====================
             左下只留三样：图纸编号与图名、图层开关、比例尺 —— 高度压到 34px，
             尽量把画板让出来。缩放单独放右下角，两者互不牵连。
             绘制工具条与浏览提示仍浮在左下底栏上方（见 float-toolbar）。-->
        <footer v-if="store.hasPlan" class="float-dock" aria-label="图纸信息与视图控制">
            <!-- 图纸角标同时是「图纸概览」的入口：左栏那枚按钮撤掉后，
                 这块本来就写着图名的地方成了最自然的落点。 -->
            <button
                class="dock-group dock-sheet"
                :class="{ active: detail }"
                :aria-pressed="detail"
                title="图纸概览：总平面面积与图纸表达"
                aria-label="图纸概览"
                @click="toggleOverview"
            >
                <span class="sheet-no">01</span>
                <span class="sheet-title">{{ store.plan?.name || '住宅平面图' }}</span>
                <span class="dock-north" title="图纸上方" aria-label="图纸上方">
                    <svg viewBox="0 0 24 42" aria-hidden="true">
                        <path d="M12 2L4 28l8-5 8 5z" fill="none" stroke="currentColor" />
                        <path d="M12 2v35" stroke="currentColor" />
                    </svg>
                </span>
            </button>

            <span class="dock-divider" />

            <div class="dock-views" role="group" aria-label="图层显示">
                <button
                    :class="{ active: showDimensions && showRoomLabels }"
                    :aria-pressed="showDimensions && showRoomLabels"
                    :disabled="!showRoomLabels"
                    :title="showRoomLabels ? '显示房间尺寸标注' : '尺寸标注只在修改模式里显示'"
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

        <!--== 右侧卡片 · 摆家具（家具菜单专属） ==============================
            这一档只管家具：清单、改名、换向、删除、从库里挑一件放进房间。
            房间的尺寸、门窗、拆墙全部不在这里出现 —— 两件事分开，才不会互相打乱。-->
        <FloatCard
            v-if="rightCard === 'furniture'"
            side="right"
            eyebrow="FURNITURE"
            title="摆家具"
            :subtitle="
                furnitureRoomId
                    ? (store.rooms.find((room) => room.id === furnitureRoomId)?.name ?? '') +
                      ' · ' +
                      furnitureRoomStorage.length +
                      ' 件'
                    : '还没有房间'
            "
            :width="322"
            :top="50"
            stretch
            @close="exitFurniture"
        >
            <div class="property-section">
                <label class="field-label">
                    放进哪个房间
                    <select v-model="furnitureRoomId" aria-label="家具放进哪个房间">
                        <option v-for="room in rooms" :key="room.id" :value="room.id">
                            {{ room.name }}
                        </option>
                    </select>
                </label>
                <div class="card-list">
                    <button
                        v-for="device in furnitureRoomStorage"
                        :key="device.id"
                        class="card-list-item"
                        :class="{ active: device.id === furnitureSelection }"
                        @click="selectFurniture(device.id)"
                    >
                        <PlanIcon :name="iconOfKind(device.kind)" />
                        <span class="item-main">
                            {{ device.name }}
                            <small>{{ deviceDetail(device) }}</small>
                        </span>
                        <span
                            class="row-action"
                            title="顺时针转 90°"
                            role="button"
                            tabindex="0"
                            @click.stop="rotateDevice(device)"
                            @keydown.enter.stop="rotateDevice(device)"
                        >
                            <PlanIcon name="redo" />
                        </span>
                        <span
                            class="row-action"
                            title="删除这件家具"
                            role="button"
                            tabindex="0"
                            @click.stop="removeFurniture(device)"
                            @keydown.enter.stop="removeFurniture(device)"
                        >
                            <PlanIcon name="trash" />
                        </span>
                    </button>
                    <p v-if="!furnitureRoomStorage.length" class="field-help">
                        这个房间还没有家具。从下面的家具库挑一件，拖进画布，或者点「放一件」。
                    </p>
                </div>
            </div>

            <div v-if="furnitureDevice" class="property-section">
                <h4>
                    选中的家具
                    <span>{{ furnitureRotation }}°</span>
                </h4>
                <label class="field-label">
                    名称
                    <input
                        v-model="furnitureName"
                        aria-label="家具名称"
                        maxlength="24"
                        :disabled="store.busy"
                        @keydown.enter="renameFurniture"
                        @blur="renameFurniture"
                    />
                </label>
                <button class="button full-width" :disabled="store.busy" @click="renameFurniture">
                    <PlanIcon name="check" />
                    保存名称
                </button>
            </div>

            <div v-if="furnitureDevice" class="property-section">
                <h4>
                    尺寸
                    <span>mm</span>
                </h4>
                <div class="size-fields">
                    <label class="field-label">
                        宽度
                        <input
                            v-model="furnitureWidth"
                            aria-label="家具宽度"
                            type="number"
                            :min="FURNITURE_MIN_MM"
                            :max="FURNITURE_MAX_MM"
                            step="50"
                            :disabled="store.busy"
                            @change="applyFurniture('size')"
                        />
                    </label>
                    <label class="field-label">
                        进深
                        <input
                            v-model="furnitureHeight"
                            aria-label="家具进深"
                            type="number"
                            :min="FURNITURE_MIN_MM"
                            :max="FURNITURE_MAX_MM"
                            step="50"
                            :disabled="store.busy"
                            @change="applyFurniture('size')"
                        />
                    </label>
                </div>
                <p class="field-help">
                    填的是家具本体的宽和深；转 90° 时画布上占地宽深会跟着对调。
                </p>
            </div>

            <div v-if="furnitureDevice" class="property-section">
                <h4>
                    位置
                    <span>距墙 · mm</span>
                </h4>
                <div class="size-fields">
                    <label class="field-label">
                        距左墙
                        <input
                            v-model="furnitureLeft"
                            aria-label="家具距左墙"
                            type="number"
                            min="0"
                            step="50"
                            :disabled="store.busy"
                            @change="applyFurniture('position')"
                        />
                    </label>
                    <label class="field-label">
                        距上墙
                        <input
                            v-model="furnitureTop"
                            aria-label="家具距上墙"
                            type="number"
                            min="0"
                            step="50"
                            :disabled="store.busy"
                            @change="applyFurniture('position')"
                        />
                    </label>
                </div>
                <p class="field-help">
                    在画布上按住它拖动更快，也能直接拖到别的房间；超出墙面会自动贴回墙内。
                </p>
            </div>

            <div v-if="furnitureDevice" class="property-section">
                <h4>朝向</h4>
                <div class="chip-row">
                    <button
                        v-for="option in ROTATION_LABELS"
                        :key="option.value"
                        :class="{ chosen: furnitureRotation === option.value }"
                        :aria-pressed="furnitureRotation === option.value"
                        :disabled="store.busy"
                        @click="applyFurnitureRotation(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
                <p class="field-help">绕家具中心转，位置不变；横竖互换会尽量保住中心点。</p>
            </div>

            <div v-if="furnitureDevice && furnitureFormError" class="property-section">
                <p class="field-help error">{{ furnitureFormError }}</p>
            </div>

            <div class="property-section">
                <div class="furniture-library">
                    <div class="library-head">
                        <span>家具库</span>
                        <small>拖进房间，或选中后点「放一件」</small>
                    </div>
                    <div class="library-grid">
                        <button
                            v-for="preset in FURNITURE_PRESETS"
                            :key="preset.id"
                            class="library-item"
                            :class="{ chosen: newFurniturePreset === preset.id }"
                            :disabled="store.busy"
                            :title="preset.hint"
                            @pointerdown="startFurnitureDrag(preset, $event)"
                            @click="newFurniturePreset = preset.id"
                        >
                            <span class="library-name">{{ preset.name }}</span>
                            <small>{{ mm(preset.width) }}×{{ mm(preset.height) }}</small>
                        </button>
                    </div>
                    <button
                        class="button full-width"
                        :disabled="store.busy || !furnitureRoomId"
                        @click="submitFurniture"
                    >
                        <PlanIcon name="plus" />
                        放一件{{ chosenPreset.name }}
                    </button>
                    <p v-if="furnitureNotice" class="field-help error">{{ furnitureNotice }}</p>
                </div>
            </div>
        </FloatCard>

        <!--== 右侧卡片 · 看内容（点房间 / 家具） ==============================
            只回答一个问题：这里面有什么。名称 + 总件数 + 物品清单，
            其余（家具清单、修改入口、面积说明）都不在这里出现，
            卡片贴着左侧菜单的顶部起，高度撑到画板底部，清单自己滚。-->
        <FloatCard
            v-else-if="rightCard === 'browse'"
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
            <!-- 看内容是一回事，改是另一回事：只有从「房间 / 家具」清单点进来
                 才提供修改入口；首页上点房间只是纯浏览，卡片里不出现任何修改操作。 -->
            <template v-if="menu !== 'home'" #footer>
                <button
                    class="button full-width"
                    :disabled="!browseRoom || store.busy"
                    @click="browseRoom && editRoom(browseRoom.id)"
                >
                    <PlanIcon name="room" />
                    修改这个房间
                </button>
            </template>
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
                    <label v-if="selectedOpening.kind === 'bay'" class="field-label">
                        向外出挑
                        <span>mm</span>
                        <input
                            v-model="openingDepth"
                            aria-label="飘窗进深"
                            type="number"
                            :min="Math.round(BAY_DEPTH_MIN * MILLIMETERS_PER_PIXEL)"
                            :max="Math.round(BAY_DEPTH_MAX * MILLIMETERS_PER_PIXEL)"
                            step="50"
                            :disabled="store.busy"
                            @change="updateBayDepth"
                        />
                    </label>
                    <p v-if="selectedOpening.kind === 'bay'" class="field-help">
                        出挑越深窗台越宽；凸出的窗台不能伸进隔壁房间，放不下时会拦下并提示。
                    </p>
                    <p v-else class="field-help">拖动图上的门窗，可沿墙调整位置。</p>
                </div>
                <!-- 门扇往哪边开、门轴在哪一端：两个独立开关，合起来才是门扇的真实姿态。
                     做成两组胶囊而不是一个「切换」按钮 —— 按钮只能表达"翻一下"，
                     看不出当前到底是哪种状态，也没法从外开直接点回内开。 -->
                <div v-if="selectedOpening.kind === 'door'" class="property-section">
                    <h4>开启方式</h4>
                    <div class="chip-row">
                        <button
                            :class="{ chosen: selectedOpening.swing === 'in' }"
                            :aria-pressed="selectedOpening.swing === 'in'"
                            :disabled="store.busy"
                            @click="store.updateOpening(selectedOpening.id, { swing: 'in' })"
                        >
                            内开
                        </button>
                        <button
                            :class="{ chosen: selectedOpening.swing === 'out' }"
                            :aria-pressed="selectedOpening.swing === 'out'"
                            :disabled="store.busy"
                            @click="store.updateOpening(selectedOpening.id, { swing: 'out' })"
                        >
                            外开
                        </button>
                    </div>
                    <div class="chip-row">
                        <button
                            :class="{ chosen: selectedOpening.hinge === 'start' }"
                            :aria-pressed="selectedOpening.hinge === 'start'"
                            :disabled="store.busy"
                            @click="store.updateOpening(selectedOpening.id, { hinge: 'start' })"
                        >
                            门轴在起点
                        </button>
                        <button
                            :class="{ chosen: selectedOpening.hinge === 'end' }"
                            :aria-pressed="selectedOpening.hinge === 'end'"
                            :disabled="store.busy"
                            @click="store.updateOpening(selectedOpening.id, { hinge: 'end' })"
                        >
                            门轴在终点
                        </button>
                    </div>
                    <p class="field-help">
                        内开朝房间里面开（住宅常态），外开朝房间外面开（入户门、储藏间往走廊开）。
                    </p>
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
                        @click="editRoom(selectedRoom.id)"
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
                <!-- 打通：把某一侧的墙整面拆掉，两间房的地面直接接上。
                     只列出真正贴着邻居的边 —— 朝室外的墙拆了不叫连通，叫漏风。 -->
                <div v-if="mode === 'edit'" class="property-section">
                    <h4>打通</h4>
                    <div v-if="openWallOptions.length" class="open-wall-list">
                        <button
                            v-for="option in openWallOptions"
                            :key="option.side"
                            class="open-wall-row"
                            :class="{ active: option.open }"
                            :disabled="store.busy"
                            :aria-pressed="option.open"
                            @click="toggleOpenWall(option.side)"
                        >
                            <span class="open-wall-name">{{ option.label }}</span>
                            <small>{{ option.neighbours }}</small>
                            <span class="open-wall-mark">
                                {{ option.open ? '已打通' : '有墙' }}
                            </span>
                        </button>
                    </div>
                    <p v-else class="field-help">四周没有贴着的房间，没墙可拆。</p>
                    <p class="field-help">
                        拆掉的边不再砌墙，两侧地面直接连通；这条边上的门窗先藏起来，补回墙就回来。
                    </p>
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
                                <small>{{ openingDetail(opening, selectedRoom) }}</small>
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
                <!-- 物品：房间属性卡只管两房之间的东西。家具的增删移转
                     全在左栏「家具」那一档，这里不再出现家具库。 -->
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
                                            ? (deviceOf(item.storageId)?.name ?? '家具')
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
                                    aria-label="放在哪件家具"
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

        <!--== 右侧卡片 · 清单（点左侧 房间 / 家具） =========================-->
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
                    <span
                        v-if="entry.kind === 'room'"
                        class="row-action edit-action"
                        role="button"
                        tabindex="0"
                        title="修改这个房间"
                        aria-label="修改这个房间"
                        @click.stop="editRoom(entry.id)"
                        @keydown.enter.stop.prevent="editRoom(entry.id)"
                        @keydown.space.stop.prevent="editRoom(entry.id)"
                    >
                        <PlanIcon name="room" />
                    </span>
                    <PlanIcon name="chevron" />
                </button>
                <p v-if="!listEntries.length" class="card-placeholder">{{ listEmpty }}</p>
            </div>
            <template v-if="!listEntries.length" #footer>
                <button
                    class="button full-width"
                    :disabled="!store.hasPlan"
                    @click="chooseTool('room')"
                >
                    <PlanIcon name="plus" />
                    开始修改
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
