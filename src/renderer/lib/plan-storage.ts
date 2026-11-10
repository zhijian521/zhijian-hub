/*============================================================================
  plan-storage — 储物设备在房间里的排布

  这个应用要回答的是「东西在哪」，不是家具摆放模拟器，所以储物设备不做
  自由拖拽：按房间宽度自动铺成网格，尺寸跟着房间走。房间改名、挪位置、
  改尺寸之后，柜子会自动跟着重新排，不需要另一套坐标要同步。

  纯函数、零运行时依赖：node:test 里可以直接跑。
============================================================================*/

import type { Room, StorageDevice, StorageKind } from '@/app/types';

export interface StorageBox {
    id: string;
    roomId: string;
    name: string;
    kind: StorageKind;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 柜子之间的缝、以及离墙的距离（画板坐标，60px = 1m）。 */
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

/**
 * 把一个房间里的储物设备铺成网格。
 * 列数按房间宽度定（每格至少 ~52px 才有地方写字），行高按形态微调。
 */
export function layoutStorage(rooms: Room[], storage: StorageDevice[]): StorageBox[] {
    const boxes: StorageBox[] = [];
    for (const room of rooms) {
        const devices = storage.filter((device) => device.roomId === room.id);
        if (!devices.length) continue;

        const usable = Math.max(room.width - INSET * 2, 20);
        const columns = Math.max(1, Math.min(devices.length, Math.floor(usable / 52), 3));
        const width = Math.min(MAX_WIDTH, Math.max(16, (usable - GAP * (columns - 1)) / columns));
        const height = Math.min(MAX_HEIGHT, Math.max(14, room.height * 0.16));

        devices.forEach((device, index) => {
            const row = Math.floor(index / columns);
            const column = index % columns;
            const rowHeight = height * KIND_HEIGHT[device.kind];
            boxes.push({
                id: device.id,
                roomId: room.id,
                name: device.name,
                kind: device.kind,
                x: room.x + INSET + column * (width + GAP),
                y: room.y + INSET + Math.min(row, MAX_ROWS) * (height + GAP * 0.6),
                width,
                height: rowHeight,
            });
        });
    }
    return boxes;
}

/** 找某个储物设备的方框；定位家具时用它把视线对上去。 */
export function storageBoxOf(boxes: StorageBox[], id: string): StorageBox | null {
    return boxes.find((box) => box.id === id) ?? null;
}

/** 位置描述：「主卧 · 衣柜」。找不到房间时只说设备名，不编造位置。 */
export function describeStorage(
    rooms: Room[],
    storage: StorageDevice[],
    id: string,
): string | null {
    const device = storage.find((item) => item.id === id);
    if (!device) return null;
    const room = rooms.find((item) => item.id === device.roomId);
    return room ? `${room.name} · ${device.name}` : device.name;
}
