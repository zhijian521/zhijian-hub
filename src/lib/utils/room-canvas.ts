/*============================================================================
  room-canvas utils — 房间画板纯函数

  负责房间创建与缩放矩形计算，不包含 React 状态或 DOM 操作。
============================================================================*/

import type { Rect, ResizeHandle, Room } from '@/lib/types/room-canvas';

export const MIN_ROOM_SIZE = 20;

/*== 创建带稳定序号的房间 ==*/
export function createRoom(sequence: number, rect: Rect, timestamp = Date.now()): Room {
    return {
        id: `room-${timestamp}-${sequence}`,
        name: `房间 ${sequence}`,
        ...rect,
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
