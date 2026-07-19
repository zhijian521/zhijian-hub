import { afterEach, describe, expect, it } from 'vitest';

import {
    createEmptyCanvasDocument,
    loadRoomCanvasDocument,
    readRoomCanvasDocument,
    ROOM_CANVAS_STORAGE_KEY,
    saveRoomCanvasDocument,
} from '@/lib/utils/room-canvas-storage';

afterEach(() => window.localStorage.clear());

describe('room canvas storage', () => {
    it('saves and loads a version 2 canvas document', () => {
        const document = {
            ...createEmptyCanvasDocument(),
            counters: { room: 2, furniture: 1, storageDevice: 1, item: 1 },
            rooms: [{ id: 'room-1-2', name: '房间 2', x: 20, y: 40, width: 120, height: 80 }],
            furniture: [
                {
                    id: 'furniture-1',
                    roomId: 'room-1-2',
                    name: '衣柜',
                    x: 20,
                    y: 20,
                    width: 60,
                    height: 40,
                },
            ],
            storageDevices: [
                {
                    id: 'storage-1',
                    name: '收纳箱',
                    location: { kind: 'furniture' as const, furnitureId: 'furniture-1' },
                },
            ],
            items: [
                {
                    id: 'item-1',
                    name: '电池',
                    quantity: 4,
                    location: { kind: 'storage-device' as const, storageDeviceId: 'storage-1' },
                },
            ],
        };

        expect(saveRoomCanvasDocument(document)).toBe(true);
        expect(loadRoomCanvasDocument()).toEqual(document);
    });

    it('migrates version 1 in memory without overwriting the source', () => {
        const source = JSON.stringify({
            version: 1,
            roomSequence: 2,
            rooms: [{ id: 'room-1-2', name: '房间 2', x: 20, y: 40, width: 120, height: 80 }],
        });
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, source);

        expect(loadRoomCanvasDocument()).toEqual({
            version: 2,
            counters: { room: 2, furniture: 0, storageDevice: 0, item: 0 },
            rooms: [{ id: 'room-1-2', name: '房间 2', x: 20, y: 40, width: 120, height: 80 }],
            furniture: [],
            storageDevices: [],
            items: [],
        });
        expect(readRoomCanvasDocument()).toMatchObject({ status: 'ready', sourceVersion: 1 });
        expect(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY)).toBe(source);
    });

    it('rejects malformed and incompatible data without overwriting it', () => {
        const malformedSource = '{invalid-json';
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, malformedSource);
        expect(loadRoomCanvasDocument()).toBeNull();
        expect(readRoomCanvasDocument().status).toBe('invalid');
        expect(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY)).toBe(malformedSource);

        const incompatibleSource = JSON.stringify({ version: 3, rooms: [] });
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, incompatibleSource);
        expect(loadRoomCanvasDocument()).toBeNull();
        expect(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY)).toBe(incompatibleSource);
    });

    it('rejects version 2 documents with broken entity relations', () => {
        const document = {
            ...createEmptyCanvasDocument(),
            furniture: [
                {
                    id: 'furniture-1',
                    roomId: 'missing-room',
                    name: '衣柜',
                    x: 0,
                    y: 0,
                    width: 60,
                    height: 40,
                },
            ],
        };
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, JSON.stringify(document));

        expect(loadRoomCanvasDocument()).toBeNull();
    });
});
