import { afterEach, describe, expect, it } from 'vitest';

import {
    loadRoomCanvasDocument,
    ROOM_CANVAS_STORAGE_KEY,
    saveRoomCanvasDocument,
} from '@/lib/utils/room-canvas-storage';

afterEach(() => window.localStorage.clear());

describe('room canvas storage', () => {
    it('saves and loads a versioned canvas document', () => {
        saveRoomCanvasDocument({
            version: 1,
            roomSequence: 2,
            rooms: [{ id: 'room-1-2', name: '房间 2', x: 20, y: 40, width: 120, height: 80 }],
        });

        expect(loadRoomCanvasDocument()).toEqual({
            version: 1,
            roomSequence: 2,
            rooms: [{ id: 'room-1-2', name: '房间 2', x: 20, y: 40, width: 120, height: 80 }],
        });
    });

    it('ignores malformed or incompatible storage data', () => {
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, '{invalid-json');
        expect(loadRoomCanvasDocument()).toBeNull();

        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, JSON.stringify({ version: 2, rooms: [] }));
        expect(loadRoomCanvasDocument()).toBeNull();
    });
});
