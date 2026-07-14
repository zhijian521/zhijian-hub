import { describe, expect, it } from 'vitest';

import { computeResizedRect, createRoom, MIN_ROOM_SIZE } from '@/lib/utils/room-canvas';

describe('room canvas utils', () => {
    it('creates a room with one stable sequence', () => {
        const room = createRoom(1, { x: 20, y: 40, width: 120, height: 80 }, 1000);

        expect(room).toEqual({
            id: 'room-1000-1',
            name: '房间 1',
            x: 20,
            y: 40,
            width: 120,
            height: 80,
        });
    });

    it('resizes from the west while preserving the east edge', () => {
        expect(computeResizedRect('w', { x: 40, y: 20, width: 100, height: 80 }, 20, 0)).toEqual({
            x: 20,
            y: 20,
            width: 120,
            height: 80,
        });
    });

    it('clamps west and north resizing to the minimum size', () => {
        expect(computeResizedRect('nw', { x: 40, y: 40, width: 100, height: 80 }, 200, 200)).toEqual({
            x: 120,
            y: 100,
            width: MIN_ROOM_SIZE,
            height: MIN_ROOM_SIZE,
        });
    });

    it('resizes southeast from the fixed origin', () => {
        expect(computeResizedRect('se', { x: 40, y: 20, width: 100, height: 80 }, 180, 140)).toEqual({
            x: 40,
            y: 20,
            width: 140,
            height: 120,
        });
    });
});
