import type { Room } from '@/lib/types/room-canvas';

export const ROOM_CANVAS_STORAGE_KEY = 'zhijian-hub:room-canvas:document';

export interface RoomCanvasDocument {
    version: 1;
    roomSequence: number;
    rooms: Room[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isRoom(value: unknown): value is Room {
    if (!isRecord(value)) return false;

    return (
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.x === 'number' &&
        Number.isFinite(value.x) &&
        typeof value.y === 'number' &&
        Number.isFinite(value.y) &&
        typeof value.width === 'number' &&
        Number.isFinite(value.width) &&
        value.width > 0 &&
        typeof value.height === 'number' &&
        Number.isFinite(value.height) &&
        value.height > 0
    );
}

function isRoomCanvasDocument(value: unknown): value is RoomCanvasDocument {
    return (
        isRecord(value) &&
        value.version === 1 &&
        typeof value.roomSequence === 'number' &&
        Number.isInteger(value.roomSequence) &&
        value.roomSequence >= 0 &&
        Array.isArray(value.rooms) &&
        value.rooms.every(isRoom)
    );
}

export function loadRoomCanvasDocument(): RoomCanvasDocument | null {
    if (typeof window === 'undefined') return null;

    try {
        const source = window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY);
        if (!source) return null;

        const document = JSON.parse(source) as unknown;
        return isRoomCanvasDocument(document) ? document : null;
    } catch {
        return null;
    }
}

export function saveRoomCanvasDocument(document: RoomCanvasDocument): boolean {
    if (typeof window === 'undefined') return false;

    try {
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, JSON.stringify(document));
        return true;
    } catch {
        return false;
    }
}
