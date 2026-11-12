/*============================================================================
  plan-storage — 家具在房间里的排布

  家具与储物是一件事，只有一张表（StorageDevice）。它在画板上的位置有两条
  来源：

    · 用户拖放过的：直接读 x / y / width / height / rotation（place-storage 命令）
    · 从来没摆过的：按房间宽度自动铺成网格

  自动网格保留下来，是因为「加一件家具」不该强制用户先去摆位置；只要用户
  真的动过它，就以存下来的坐标为准，房间被移动 / 缩放时再按边界夹回来。

  纯函数、零运行时依赖：node:test 里可以直接跑。
============================================================================*/

import type { Room, StorageDevice, StorageKind, WallSide } from '@/app/types';
import {
    hasBack,
    isSideways,
    normalizeRotation,
    type FurnitureRotation,
} from './furniture-catalog.ts';

export interface StorageBox {
    id: string;
    roomId: string;
    name: string;
    kind: StorageKind;
    /** 家具原型 id；老数据为空串，按 kind 的通用画法。 */
    preset: string | null;
    /** 平面转角，只有 0 / 90 / 180 / 270（直角四档）。 */
    rotation: FurnitureRotation;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 自动网格：家具之间的缝、以及离墙的距离（画板坐标，60px = 1m）。 */
const GAP = 8;
const INSET = 10;
/** 单块最大宽度：再宽就不像柜子，像一整面墙。 */
const MAX_WIDTH = 78;
/** 单块高度上限，保证小房间里也能竖着排两三行。 */
const MAX_HEIGHT = 30;
/** 一个房间最多排到第几行，超出的挤在同一行里不再往下堆。 */
const MAX_ROWS = 4;

/** 每种形态的尺寸倾向：柜子高一点、箱子矮一点，一眼能区分。 */
const KIND_HEIGHT: Record<StorageKind, number> = {
    cabinet: 1,
    shelf: 0.82,
    box: 0.55,
    furniture: 1.15,
};

/** 家具不能被缩到看不见：20px ≈ 330 mm，比这再小就只剩一个点。 */
export const MIN_FURNITURE_SIZE = 20;

/** 单件家具的边长上限 600px = 10 m，超过就是数据写错了（与主进程同一套界限）。 */
export const MAX_FURNITURE_SIDE = 600;

/** 把数值夹进区间；NaN / Infinity 一律退回下界。 */
function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), Math.max(min, max));
}

/** 这件家具是不是「摆过」：四个坐标都有数才算，缺一个就退回自动网格。 */
function isPlaced(device: StorageDevice): boolean {
    return (
        typeof device.x === 'number' &&
        typeof device.y === 'number' &&
        typeof device.width === 'number' &&
        typeof device.height === 'number'
    );
}

/** 存下来的位置夹进房间边界；右 / 下边界优先保住，家具永远不出房间。 */
export function placedBox(room: Room, device: StorageDevice): StorageBox | null {
    if (!isPlaced(device)) return null;
    const floor = Math.min(MIN_FURNITURE_SIZE, room.width, room.height);
    const width = clamp(device.width as number, floor, room.width);
    const height = clamp(device.height as number, floor, room.height);
    return {
        id: device.id,
        roomId: room.id,
        name: device.name,
        kind: device.kind,
        preset: device.preset ?? null,
        rotation: normalizeRotation(device.rotation),
        x: clamp(device.x as number, room.x, room.x + room.width - width),
        y: clamp(device.y as number, room.y, room.y + room.height - height),
        width,
        height,
    };
}

/**
 * 把房间里的家具算成画板上的方框。
 * 摆过的走坐标；没摆过的按房间宽度铺网格（每格至少 ~52px 才有地方写字）。
 */
export function layoutStorage(rooms: Room[], storage: StorageDevice[]): StorageBox[] {
    const boxes: StorageBox[] = [];
    for (const room of rooms) {
        const devices = storage.filter((device) => device.roomId === room.id);
        if (!devices.length) continue;

        // 自动网格只负责「还没摆过」的那一批，列数按它们的数量算。
        const looseCount = devices.filter((device) => !isPlaced(device)).length;
        const usable = Math.max(room.width - INSET * 2, 20);
        const columns = Math.max(1, Math.min(looseCount, Math.floor(usable / 52), 3));
        const width = Math.min(MAX_WIDTH, Math.max(16, (usable - GAP * (columns - 1)) / columns));
        const height = Math.min(MAX_HEIGHT, Math.max(14, room.height * 0.16));

        let slot = 0;
        for (const device of devices) {
            const placed = placedBox(room, device);
            if (placed) {
                boxes.push(placed);
                continue;
            }
            const row = Math.floor(slot / columns);
            const column = slot % columns;
            slot += 1;
            boxes.push({
                id: device.id,
                roomId: room.id,
                name: device.name,
                kind: device.kind,
                preset: device.preset ?? null,
                rotation: 0,
                x: room.x + INSET + column * (width + GAP),
                y: room.y + INSET + Math.min(row, MAX_ROWS) * (height + GAP * 0.6),
                width,
                height: height * KIND_HEIGHT[device.kind],
            });
        }
    }
    return boxes;
}

/** 离墙多近才「吸附」成一堵墙上的家具（画板坐标，12px = 200 mm）。 */
export const WALL_SNAP = 12;

/** 靠墙摆放的结果：贴墙后的占地框 + 该用哪个朝向。 */
export interface WallSnap {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: FurnitureRotation;
    wall: WallSide;
}

/** 靠上哪面墙，背板就该朝哪面墙。 */
const WALL_ROTATION: Record<WallSide, FurnitureRotation> = {
    top: 0,
    bottom: 180,
    left: 270,
    right: 90,
};

/** 家具本体的宽深（局部坐标系），与占地框在 90 / 270 时对调。 */
function bodySize(box: { width: number; height: number; rotation: number }) {
    return isSideways(box.rotation)
        ? { width: box.height, height: box.width }
        : { width: box.width, height: box.height };
}

/** 给定朝向，算出占地框的宽深。 */
function footprintOf(body: { width: number; height: number }, rotation: FurnitureRotation) {
    return isSideways(rotation)
        ? { width: body.height, height: body.width }
        : { width: body.width, height: body.height };
}

/**
 * 靠墙摆放：家具离哪面墙最近、且近到阈值以内，就把它贴上去，
 * 并且让背板朝墙（床头板、沙发靠背、柜门背面贴着墙才像真摆过）。
 *
 * 几个刻意的取舍：
 *   · 只贴最近的一面墙，不猜角落——猜错比不贴更让人恼火；
 *   · 对称的家具（桌、椅、地毯、绿植、灯）只贴位置不转朝向，
 *     转它们只会平白换掉占地宽深；
 *   · 转过来塞不进这间房就放弃吸附，宁可维持用户松手的位置。
 */
export function snapFurnitureToWall(
    room: Room,
    box: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        preset?: string | null;
    },
    options: { threshold?: number; faceWall?: boolean } = {},
): WallSnap | null {
    if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) return null;
    const threshold = options.threshold ?? WALL_SNAP;
    const rotation = normalizeRotation(box.rotation);
    const gaps: { wall: WallSide; gap: number }[] = [
        { wall: 'top', gap: box.y - room.y },
        { wall: 'bottom', gap: room.y + room.height - (box.y + box.height) },
        { wall: 'left', gap: box.x - room.x },
        { wall: 'right', gap: room.x + room.width - (box.x + box.width) },
    ];
    let nearest = gaps[0]!;
    for (const entry of gaps) if (entry.gap < nearest.gap) nearest = entry;
    // 贴在房间外面（负距离）也算「在墙边」：拖太快时家具被甩出一点边界，
    // 这时候吸附正好把它拉回来。
    if (nearest.gap > threshold) return null;

    const body = bodySize(box);
    const nextRotation =
        (options.faceWall ?? true) && hasBack(box.preset) ? WALL_ROTATION[nearest.wall] : rotation;
    const footprint = footprintOf(body, nextRotation);
    if (footprint.width > room.width + 0.01 || footprint.height > room.height + 0.01) {
        // 转过来塞不下就退回「不转、只贴墙」。
        const plain = footprintOf(body, rotation);
        if (plain.width > room.width + 0.01 || plain.height > room.height + 0.01) return null;
        return placeAgainst(room, box, plain, rotation, nearest.wall);
    }
    return placeAgainst(room, box, footprint, nextRotation, nearest.wall);
}

/** 贴到某面墙上：那一侧归零，另一个方向保住中心点。 */
function placeAgainst(
    room: Room,
    box: { x: number; y: number; width: number; height: number },
    footprint: { width: number; height: number },
    rotation: FurnitureRotation,
    wall: WallSide,
): WallSnap {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    let x = centerX - footprint.width / 2;
    let y = centerY - footprint.height / 2;
    if (wall === 'top') y = room.y;
    if (wall === 'bottom') y = room.y + room.height - footprint.height;
    if (wall === 'left') x = room.x;
    if (wall === 'right') x = room.x + room.width - footprint.width;
    return {
        x: clamp(x, room.x, room.x + room.width - footprint.width),
        y: clamp(y, room.y, room.y + room.height - footprint.height),
        width: footprint.width,
        height: footprint.height,
        rotation,
        wall,
    };
}

/** 家具自己报的「宽 × 深」：侧过来摆时占地宽深是对调的，
    界面上仍按家具本体（局部坐标系）显示，用户改的是家具不是占地框。 */
export function furnitureSize(box: StorageBox): { width: number; height: number } {
    return isSideways(box.rotation)
        ? { width: box.height, height: box.width }
        : { width: box.width, height: box.height };
}

/** 找某件家具的方框；定位物品时用它把视线对上去。 */
export function storageBoxOf(boxes: StorageBox[], id: string): StorageBox | null {
    return boxes.find((box) => box.id === id) ?? null;
}

/** 位置描述：「主卧 · 衣柜」。找不到房间时只说名字，不编造位置。 */
export function describeStorage(
    rooms: Room[],
    storage: StorageDevice[],
    id: string,
): string | null {
    const device = storage.find((item) => item.id === id);
    if (!device) return null;
    const room = rooms.find((item) => item.id === device.roomId);
    return room ? room.name + ' · ' + device.name : device.name;
}

/** 矩形是否完整落在房间内（拖放时用它判断松手位置合不合法）。 */
export function boxInsideRoom(
    room: Room,
    box: { x: number; y: number; width: number; height: number },
): boolean {
    return (
        box.x >= room.x - 0.01 &&
        box.y >= room.y - 0.01 &&
        box.x + box.width <= room.x + room.width + 0.01 &&
        box.y + box.height <= room.y + room.height + 0.01
    );
}

/** 找出鼠标点落在哪个房间（拖放家具时用；倒序遍历取最上面一层）。 */
export function roomAtPoint(rooms: Room[], x: number, y: number): Room | null {
    for (let i = rooms.length - 1; i >= 0; i -= 1) {
        const room = rooms[i];
        if (!room) continue;
        if (x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height)
            return room;
    }
    return null;
}
