import type {
    CanvasDocumentV2,
    Furniture,
    Item,
    ItemLocation,
    Rect,
    Room,
    StorageDevice,
} from '@/lib/types/room-canvas';

export const ROOM_CANVAS_STORAGE_KEY = 'zhijian-hub:room-canvas:document';

interface RoomCanvasDocumentV1 {
    version: 1;
    roomSequence: number;
    rooms: Room[];
}

export type RoomCanvasLoadResult =
    | { status: 'empty'; document: null }
    | { status: 'ready'; document: CanvasDocumentV2; sourceVersion: 1 | 2 }
    | { status: 'invalid'; document: null };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRect(value: unknown): value is Rect {
    return (
        isRecord(value) &&
        isFiniteNumber(value.x) &&
        isFiniteNumber(value.y) &&
        isFiniteNumber(value.width) &&
        value.width > 0 &&
        isFiniteNumber(value.height) &&
        value.height > 0
    );
}

function isRoom(value: unknown): value is Room {
    if (!isRecord(value)) return false;

    return typeof value.id === 'string' && typeof value.name === 'string' && isRect(value);
}

function isFurniture(value: unknown): value is Furniture {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.roomId === 'string' &&
        typeof value.name === 'string' &&
        isRect(value)
    );
}

function isStorageDevice(value: unknown): value is StorageDevice {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return false;
    if (!isRecord(value.location)) return false;

    if (value.location.kind === 'room') {
        return typeof value.location.roomId === 'string' && isRect(value.rect);
    }

    return value.location.kind === 'furniture' && typeof value.location.furnitureId === 'string';
}

function isItemLocation(value: unknown): value is ItemLocation {
    if (!isRecord(value)) return false;
    if (value.kind === 'room') return typeof value.roomId === 'string';
    if (value.kind === 'furniture') return typeof value.furnitureId === 'string';
    return value.kind === 'storage-device' && typeof value.storageDeviceId === 'string';
}

function isItem(value: unknown): value is Item {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.quantity === 'number' &&
        Number.isInteger(value.quantity) &&
        value.quantity > 0 &&
        isItemLocation(value.location)
    );
}

function hasUniqueIds(entities: Array<{ id: string }>): boolean {
    return new Set(entities.map((entity) => entity.id)).size === entities.length;
}

function hasValidRelations(document: CanvasDocumentV2): boolean {
    const roomIds = new Set(document.rooms.map((room) => room.id));
    const furnitureIds = new Set(document.furniture.map((furniture) => furniture.id));
    const storageDeviceIds = new Set(document.storageDevices.map((storageDevice) => storageDevice.id));

    return (
        document.furniture.every((furniture) => roomIds.has(furniture.roomId)) &&
        document.storageDevices.every((storageDevice) =>
            storageDevice.location.kind === 'room'
                ? roomIds.has(storageDevice.location.roomId)
                : furnitureIds.has(storageDevice.location.furnitureId)
        ) &&
        document.items.every((item) => {
            if (item.location.kind === 'room') return roomIds.has(item.location.roomId);
            if (item.location.kind === 'furniture') return furnitureIds.has(item.location.furnitureId);
            return storageDeviceIds.has(item.location.storageDeviceId);
        })
    );
}

function isRoomCanvasDocumentV1(value: unknown): value is RoomCanvasDocumentV1 {
    return (
        isRecord(value) &&
        value.version === 1 &&
        isNonNegativeInteger(value.roomSequence) &&
        Array.isArray(value.rooms) &&
        value.rooms.every(isRoom) &&
        hasUniqueIds(value.rooms)
    );
}

function isCanvasDocumentV2(value: unknown): value is CanvasDocumentV2 {
    if (
        !isRecord(value) ||
        value.version !== 2 ||
        !isRecord(value.counters) ||
        !isNonNegativeInteger(value.counters.room) ||
        !isNonNegativeInteger(value.counters.furniture) ||
        !isNonNegativeInteger(value.counters.storageDevice) ||
        !isNonNegativeInteger(value.counters.item) ||
        !Array.isArray(value.rooms) ||
        !value.rooms.every(isRoom) ||
        !Array.isArray(value.furniture) ||
        !value.furniture.every(isFurniture) ||
        !Array.isArray(value.storageDevices) ||
        !value.storageDevices.every(isStorageDevice) ||
        !Array.isArray(value.items) ||
        !value.items.every(isItem)
    ) {
        return false;
    }

    const document = value as unknown as CanvasDocumentV2;
    return (
        hasUniqueIds(document.rooms) &&
        hasUniqueIds(document.furniture) &&
        hasUniqueIds(document.storageDevices) &&
        hasUniqueIds(document.items) &&
        hasValidRelations(document)
    );
}

function migrateRoomCanvasDocument(document: RoomCanvasDocumentV1): CanvasDocumentV2 {
    return {
        version: 2,
        counters: {
            room: document.roomSequence,
            furniture: 0,
            storageDevice: 0,
            item: 0,
        },
        rooms: document.rooms,
        furniture: [],
        storageDevices: [],
        items: [],
    };
}

export function createEmptyCanvasDocument(): CanvasDocumentV2 {
    return {
        version: 2,
        counters: { room: 0, furniture: 0, storageDevice: 0, item: 0 },
        rooms: [],
        furniture: [],
        storageDevices: [],
        items: [],
    };
}

/**
 * 读取并校验本地画板文档。version 1 仅在内存中迁移，不在读取阶段覆盖原始数据。
 */
export function readRoomCanvasDocument(): RoomCanvasLoadResult {
    if (typeof window === 'undefined') return { status: 'empty', document: null };

    try {
        const source = window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY);
        if (!source) return { status: 'empty', document: null };

        const document = JSON.parse(source) as unknown;
        if (isRoomCanvasDocumentV1(document)) {
            return { status: 'ready', document: migrateRoomCanvasDocument(document), sourceVersion: 1 };
        }
        if (isCanvasDocumentV2(document)) return { status: 'ready', document, sourceVersion: 2 };
        return { status: 'invalid', document: null };
    } catch {
        return { status: 'invalid', document: null };
    }
}

export function loadRoomCanvasDocument(): CanvasDocumentV2 | null {
    return readRoomCanvasDocument().document;
}

export function saveRoomCanvasDocument(document: CanvasDocumentV2): boolean {
    if (typeof window === 'undefined') return false;

    try {
        window.localStorage.setItem(ROOM_CANVAS_STORAGE_KEY, JSON.stringify(document));
        return true;
    } catch {
        return false;
    }
}
