import { describe, expect, it } from 'vitest';

import {
    computeResizedRect,
    createFurniture,
    createFurnitureStorageDevice,
    createItem,
    createRoom,
    createRoomStorageDevice,
    fitRectWithinBounds,
    MIN_ROOM_SIZE,
} from '@/lib/utils/room-canvas';

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

    it('creates furniture with a stable parent and sequence', () => {
        expect(createFurniture(3, 'room-1', { x: 20, y: 40, width: 80, height: 60 }, 1000)).toEqual({
            id: 'furniture-1000-3',
            roomId: 'room-1',
            name: '家具 3',
            x: 20,
            y: 40,
            width: 80,
            height: 60,
        });
    });

    it('creates room and furniture storage devices with only the required location data', () => {
        expect(createRoomStorageDevice(2, 'room-1', { x: 20, y: 20, width: 80, height: 60 }, 1000)).toEqual({
            id: 'storage-device-1000-2',
            name: '储物设备 2',
            location: { kind: 'room', roomId: 'room-1' },
            rect: { x: 20, y: 20, width: 80, height: 60 },
        });
        expect(createFurnitureStorageDevice(3, 'furniture-1', 1000)).toEqual({
            id: 'storage-device-1000-3',
            name: '储物设备 3',
            location: { kind: 'furniture', furnitureId: 'furniture-1' },
        });
    });

    it('keeps furniture size and position inside its room', () => {
        expect(fitRectWithinBounds({ x: -20, y: 80, width: 140, height: 60 }, { width: 120, height: 100 })).toEqual({
            x: 0,
            y: 40,
            width: 120,
            height: 60,
        });
    });

    it('creates an item with its quantity and exact location', () => {
        expect(createItem(4, '备用电池', 6, { kind: 'storage-device', storageDeviceId: 'storage-1' }, 1000)).toEqual({
            id: 'item-1000-4',
            name: '备用电池',
            quantity: 6,
            location: { kind: 'storage-device', storageDeviceId: 'storage-1' },
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
