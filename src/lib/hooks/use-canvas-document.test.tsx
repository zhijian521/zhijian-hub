import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useCanvasDocument } from '@/lib/hooks/use-canvas-document';
import { ROOM_CANVAS_STORAGE_KEY, saveRoomCanvasDocument } from '@/lib/utils/room-canvas-storage';
import type { CanvasContent, CanvasDocumentV2 } from '@/lib/types/room-canvas';

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

const initialDocument: CanvasDocumentV2 = {
    version: 2,
    counters: { room: 2, furniture: 1, storageDevice: 1, item: 1 },
    rooms: [{ id: 'room-1', name: '卧室', x: 0, y: 0, width: 200, height: 160 }],
    furniture: [
        {
            id: 'furniture-1',
            roomId: 'room-1',
            name: '衣柜',
            x: 20,
            y: 20,
            width: 80,
            height: 100,
        },
    ],
    storageDevices: [
        {
            id: 'storage-1',
            name: '收纳箱',
            location: { kind: 'furniture', furnitureId: 'furniture-1' },
        },
    ],
    items: [
        {
            id: 'item-1',
            name: '换季衣物',
            quantity: 2,
            location: { kind: 'storage-device', storageDeviceId: 'storage-1' },
        },
    ],
};

describe('useCanvasDocument', () => {
    it('undoes and redoes complete canvas content without rolling back counters', async () => {
        saveRoomCanvasDocument(initialDocument);
        const { result } = renderHook(() => useCanvasDocument());

        await waitFor(() => expect(result.current.document).toEqual(initialDocument));

        const nextContent: CanvasContent = {
            rooms: initialDocument.rooms,
            furniture: [{ ...initialDocument.furniture[0], name: '主卧衣柜' }],
            storageDevices: initialDocument.storageDevices,
            items: [{ ...initialDocument.items[0], quantity: 3 }],
        };

        act(() => {
            result.current.commitContent(nextContent);
        });
        expect(result.current.canUndo).toBe(true);

        act(() => {
            expect(result.current.reserveRoomSequence()).toBe(3);
            expect(result.current.reserveFurnitureSequence()).toBe(2);
            expect(result.current.reserveItemSequence()).toBe(2);
        });
        act(() => {
            result.current.undo();
        });

        expect(result.current.document).toMatchObject({
            counters: { room: 3, furniture: 2, item: 2 },
            furniture: initialDocument.furniture,
            items: initialDocument.items,
        });
        expect(result.current.canRedo).toBe(true);

        act(() => {
            result.current.redo();
        });
        expect(result.current.document).toMatchObject({
            counters: { room: 3, furniture: 2, item: 2 },
            furniture: nextContent.furniture,
            items: nextContent.items,
        });
    });

    it('restores the legacy room sequence and persists later changes as version 2', async () => {
        window.localStorage.setItem(
            ROOM_CANVAS_STORAGE_KEY,
            JSON.stringify({
                version: 1,
                roomSequence: 4,
                rooms: [{ id: 'room-4', name: '房间 4', x: 20, y: 20, width: 120, height: 80 }],
            })
        );
        const { result } = renderHook(() => useCanvasDocument());

        await waitFor(() => expect(result.current.document.counters.room).toBe(4));
        expect(JSON.parse(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY) ?? '{}')).toMatchObject({
            version: 1,
            roomSequence: 4,
        });
        act(() => {
            result.current.reserveRoomSequence();
        });

        await waitFor(() => {
            const storedDocument = JSON.parse(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY) ?? '{}') as {
                version?: number;
                counters?: { room?: number };
            };
            expect(storedDocument.version).toBe(2);
            expect(storedDocument.counters?.room).toBe(5);
        });
    });

    it('does not overwrite invalid storage during initialization', async () => {
        const source = '{invalid-json';
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, source);
        renderHook(() => useCanvasDocument());

        await act(() => new Promise((resolve) => window.setTimeout(resolve, 350)));

        expect(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY)).toBe(source);
    });
});
