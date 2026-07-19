/*============================================================================
  room-canvas utils — 房间画板纯函数

  负责房间创建与缩放矩形计算，不包含 React 状态或 DOM 操作。
============================================================================*/

import type {
    Furniture,
    FurnitureStorageDevice,
    Item,
    ItemLocation,
    Rect,
    ResizeHandle,
    Room,
    RoomStorageDevice,
} from '@/lib/types/room-canvas';

export const MIN_ROOM_SIZE = 20;

/*== 创建带稳定序号的房间 ==*/
export function createRoom(sequence: number, rect: Rect, timestamp = Date.now()): Room {
    return {
        id: `room-${timestamp}-${sequence}`,
        name: `房间 ${sequence}`,
        ...rect,
    };
}

/*== 创建带稳定序号的家具 ==*/
export function createFurniture(sequence: number, roomId: string, rect: Rect, timestamp = Date.now()): Furniture {
    return {
        id: `furniture-${timestamp}-${sequence}`,
        roomId,
        name: `家具 ${sequence}`,
        ...rect,
    };
}

export function createRoomStorageDevice(
    sequence: number,
    roomId: string,
    rect: Rect,
    timestamp = Date.now()
): RoomStorageDevice {
    return {
        id: `storage-device-${timestamp}-${sequence}`,
        name: `储物设备 ${sequence}`,
        location: { kind: 'room', roomId },
        rect,
    };
}

export function createFurnitureStorageDevice(
    sequence: number,
    furnitureId: string,
    timestamp = Date.now()
): FurnitureStorageDevice {
    return {
        id: `storage-device-${timestamp}-${sequence}`,
        name: `储物设备 ${sequence}`,
        location: { kind: 'furniture', furnitureId },
    };
}

export function createItem(
    sequence: number,
    name: string,
    quantity: number,
    location: ItemLocation,
    timestamp = Date.now()
): Item {
    return {
        id: `item-${timestamp}-${sequence}`,
        name,
        quantity,
        location,
    };
}

/*== 将家具矩形限制在所属房间范围内 ==*/
export function fitRectWithinBounds(rect: Rect, bounds: Pick<Rect, 'width' | 'height'>): Rect {
    const width = Math.min(bounds.width, Math.max(MIN_ROOM_SIZE, rect.width));
    const height = Math.min(bounds.height, Math.max(MIN_ROOM_SIZE, rect.height));

    return {
        x: Math.min(Math.max(0, rect.x), bounds.width - width),
        y: Math.min(Math.max(0, rect.y), bounds.height - height),
        width,
        height,
    };
}

/*== 根据手柄方向与指针位置计算新矩形 ==*/
export function computeResizedRect(handle: ResizeHandle, startRect: Rect, pointerX: number, pointerY: number): Rect {
    let { x, y, width, height } = startRect;

    if (handle.includes('w')) {
        const nextWidth = startRect.x + startRect.width - pointerX;
        if (nextWidth >= MIN_ROOM_SIZE) {
            x = pointerX;
            width = nextWidth;
        } else {
            x = startRect.x + startRect.width - MIN_ROOM_SIZE;
            width = MIN_ROOM_SIZE;
        }
    }

    if (handle.includes('e')) {
        width = Math.max(MIN_ROOM_SIZE, pointerX - startRect.x);
    }

    if (handle.includes('n')) {
        const nextHeight = startRect.y + startRect.height - pointerY;
        if (nextHeight >= MIN_ROOM_SIZE) {
            y = pointerY;
            height = nextHeight;
        } else {
            y = startRect.y + startRect.height - MIN_ROOM_SIZE;
            height = MIN_ROOM_SIZE;
        }
    }

    if (handle.includes('s')) {
        height = Math.max(MIN_ROOM_SIZE, pointerY - startRect.y);
    }

    return { x, y, width, height };
}
