'use client';

/*============================================================================
  use-room-canvas — 画板交互逻辑 Hook

  职责：管理房间、家具与储物设备的指针/键盘交互、选择与浮层、
        重命名/级联删除、画板平移与缩放
  文档状态、历史和持久化由 useCanvasDocument 管理
  不负责渲染，只提供数据和事件回调
============================================================================*/

/*== 依赖导入 ==*/
import { useState, useRef, useEffect, useCallback } from 'react';

/*== Hook 导入 ==*/
import { useCanvasDocument } from '@/lib/hooks/use-canvas-document';
import { useKeyPress } from '@/lib/hooks/use-key-press';

/*== 工具函数 ==*/
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

/*== 类型导入 ==*/
import type {
    CanvasContent,
    CanvasDrawingKind,
    CanvasDrawingTarget,
    CanvasSelection,
    ContextMenuState,
    Furniture,
    Item,
    ItemLocation,
    InteractionState,
    Rect,
    ResizeHandle,
    Room,
    RoomStorageDevice,
    StorageDevice,
    Tool,
} from '@/lib/types/room-canvas';

/*== Hook 配置 ==*/
interface UseRoomCanvasOptions {
    /*-- 网格大小（像素），默认 20 --*/
    gridSize?: number;
    /*-- 是否吸附网格，默认 true --*/
    snapToGrid?: boolean;
}

/*== Hook 返回值 ==*/
interface UseRoomCanvasReturn {
    rooms: Room[];
    furniture: Furniture[];
    storageDevices: StorageDevice[];
    items: Item[];
    canUndo: boolean;
    canRedo: boolean;
    selectedEntity: CanvasSelection | null;
    highlightedEntity: CanvasSelection | null;
    highlightedItemId: string | null;
    interaction: InteractionState;
    contextMenu: ContextMenuState | null;
    renamingEntity: CanvasSelection | null;
    pendingDeletion: CanvasSelection | null;
    deletionImpact: DeletionImpact | null;
    drawingTarget: CanvasDrawingTarget | null;
    itemEditor: ItemEditorState | null;
    zoom: number;
    panOffset: { x: number; y: number };
    isFocusing: boolean;
    tool: Tool;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    handleCanvasPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    handleRoomPointerDown: (e: React.PointerEvent<HTMLButtonElement>, room: Room) => void;
    handleFurniturePointerDown: (e: React.PointerEvent<HTMLButtonElement>, furniture: Furniture) => void;
    handleStorageDevicePointerDown: (
        e: React.PointerEvent<HTMLButtonElement>,
        storageDevice: RoomStorageDevice
    ) => void;
    handleHandlePointerDown: (
        e: React.PointerEvent<HTMLSpanElement>,
        entity: CanvasSelection,
        handle: ResizeHandle
    ) => void;
    handleRoomKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, room: Room) => void;
    handleFurnitureKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, furniture: Furniture) => void;
    handleStorageDeviceKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, storageDevice: RoomStorageDevice) => void;
    selectEntity: (entity: CanvasSelection) => void;
    handleCanvasContextMenu: (e: React.MouseEvent) => void;
    handleRoomContextMenu: (e: React.MouseEvent, room: Room) => void;
    handleFurnitureContextMenu: (e: React.MouseEvent, furniture: Furniture) => void;
    handleStorageDeviceContextMenu: (e: React.MouseEvent, storageDevice: RoomStorageDevice) => void;
    handleWheel: (e: React.WheelEvent) => void;
    closeContextMenu: () => void;
    clearAll: () => void;
    startRename: (entity: CanvasSelection) => void;
    confirmRename: (name: string) => void;
    cancelRename: () => void;
    requestDelete: (entity: CanvasSelection) => void;
    confirmDelete: () => void;
    cancelDelete: () => void;
    startFurnitureDrawing: (roomId: string) => void;
    startStorageDeviceDrawing: (roomId: string) => void;
    cancelDrawing: () => void;
    createFurnitureStorageDevice: (furnitureId: string) => void;
    moveFurnitureToRoom: (furnitureId: string, roomId: string) => void;
    moveStorageDevice: (storageDeviceId: string, locationValue: string) => void;
    startCreateItem: (location: ItemLocation) => void;
    startEditItem: (itemId: string) => void;
    confirmItem: (value: Omit<Item, 'id'>) => void;
    cancelItemEditor: () => void;
    deleteItem: (itemId: string) => void;
    focusItem: (itemId: string) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    addRoom: () => void;
    focusEntity: (entity: CanvasSelection) => void;
    undo: () => void;
    redo: () => void;
    setTool: (tool: Tool) => void;
}

interface ItemEditorState {
    itemId?: string;
    location: ItemLocation;
}

export interface DeletionImpact {
    furniture: number;
    storageDevices: number;
    items: number;
}

/*== 缩放范围与步进 ==*/
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

/*== 键盘与快捷创建尺寸 ==*/
const DEFAULT_ROOM_WIDTH_IN_GRIDS = 6;
const DEFAULT_ROOM_HEIGHT_IN_GRIDS = 4;
const FOCUS_VIEWPORT_PADDING = 96;
const FOCUS_TRANSITION_DURATION = 800;
const HIGHLIGHT_DURATION = 1800;

/*== 缩放钳制函数 ==*/
function clampZoom(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function getKeyboardDelta(key: string, step: number): { x: number; y: number } {
    switch (key) {
        case 'ArrowLeft':
            return { x: -step, y: 0 };
        case 'ArrowRight':
            return { x: step, y: 0 };
        case 'ArrowUp':
            return { x: 0, y: -step };
        case 'ArrowDown':
            return { x: 0, y: step };
        default:
            return { x: 0, y: 0 };
    }
}

function areRoomsEqual(left: Room[], right: Room[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((room, index) => {
        const other = right[index];
        return (
            room.id === other.id &&
            room.name === other.name &&
            room.x === other.x &&
            room.y === other.y &&
            room.width === other.width &&
            room.height === other.height
        );
    });
}

function areFurnitureEqual(left: Furniture[], right: Furniture[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((furniture, index) => {
        const other = right[index];
        return (
            furniture.id === other.id &&
            furniture.roomId === other.roomId &&
            furniture.name === other.name &&
            furniture.x === other.x &&
            furniture.y === other.y &&
            furniture.width === other.width &&
            furniture.height === other.height
        );
    });
}

function areStorageDevicesEqual(left: StorageDevice[], right: StorageDevice[]): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isRoomStorageDevice(storageDevice: StorageDevice): storageDevice is RoomStorageDevice {
    return storageDevice.location.kind === 'room';
}

function getCanvasContent(document: CanvasContent): CanvasContent {
    return {
        rooms: document.rooms,
        furniture: document.furniture,
        storageDevices: document.storageDevices,
        items: document.items,
    };
}

function hasEntity(content: CanvasContent, entity: CanvasSelection): boolean {
    if (entity.kind === 'room') return content.rooms.some((room) => room.id === entity.id);
    if (entity.kind === 'furniture') return content.furniture.some((furniture) => furniture.id === entity.id);
    return content.storageDevices.some((storageDevice) => storageDevice.id === entity.id);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function keepChildrenInsideRoom(handle: ResizeHandle, startRect: Rect, nextRect: Rect, children: Rect[]): Rect {
    const minimumWidth = Math.max(MIN_ROOM_SIZE, ...children.map((item) => item.x + item.width));
    const minimumHeight = Math.max(MIN_ROOM_SIZE, ...children.map((item) => item.y + item.height));
    const width = Math.max(minimumWidth, nextRect.width);
    const height = Math.max(minimumHeight, nextRect.height);

    return {
        x: handle.includes('w') ? startRect.x + startRect.width - width : nextRect.x,
        y: handle.includes('n') ? startRect.y + startRect.height - height : nextRect.y,
        width,
        height,
    };
}

function getDeletionImpact(content: CanvasContent, entity: CanvasSelection): DeletionImpact {
    const furnitureIds = new Set(
        entity.kind === 'room'
            ? content.furniture.filter((item) => item.roomId === entity.id).map((item) => item.id)
            : entity.kind === 'furniture'
              ? [entity.id]
              : []
    );
    const storageDeviceIds = new Set(
        entity.kind === 'storage-device'
            ? [entity.id]
            : content.storageDevices
                  .filter((device) => {
                      if (device.location.kind === 'furniture') return furnitureIds.has(device.location.furnitureId);
                      return entity.kind === 'room' && device.location.roomId === entity.id;
                  })
                  .map((device) => device.id)
    );
    const items = content.items.filter((item) => {
        if (item.location.kind === 'furniture') return furnitureIds.has(item.location.furnitureId);
        if (item.location.kind === 'storage-device') return storageDeviceIds.has(item.location.storageDeviceId);
        return entity.kind === 'room' && item.location.roomId === entity.id;
    });

    return {
        furniture: entity.kind === 'room' ? furnitureIds.size : 0,
        storageDevices: entity.kind === 'storage-device' ? 0 : storageDeviceIds.size,
        items: items.length,
    };
}

function removeEntity(content: CanvasContent, entity: CanvasSelection): CanvasContent {
    const furnitureIds = new Set(
        entity.kind === 'room'
            ? content.furniture.filter((item) => item.roomId === entity.id).map((item) => item.id)
            : entity.kind === 'furniture'
              ? [entity.id]
              : []
    );
    const storageDeviceIds = new Set(
        entity.kind === 'storage-device'
            ? [entity.id]
            : content.storageDevices
                  .filter((device) => {
                      if (device.location.kind === 'furniture') return furnitureIds.has(device.location.furnitureId);
                      return entity.kind === 'room' && device.location.roomId === entity.id;
                  })
                  .map((device) => device.id)
    );

    return {
        rooms: entity.kind === 'room' ? content.rooms.filter((room) => room.id !== entity.id) : content.rooms,
        furniture: content.furniture.filter((item) => !furnitureIds.has(item.id)),
        storageDevices: content.storageDevices.filter((device) => !storageDeviceIds.has(device.id)),
        items: content.items.filter((item) => {
            if (item.location.kind === 'room') return entity.kind !== 'room' || item.location.roomId !== entity.id;
            if (item.location.kind === 'furniture') return !furnitureIds.has(item.location.furnitureId);
            return !storageDeviceIds.has(item.location.storageDeviceId);
        }),
    };
}

/*============================================================================
  useRoomCanvas — 画板交互 Hook
============================================================================*/
export function useRoomCanvas(options: UseRoomCanvasOptions = {}): UseRoomCanvasReturn {
    const { gridSize = 20, snapToGrid = true } = options;
    const {
        document,
        documentRef,
        canUndo,
        canRedo,
        replaceContent,
        replaceRooms,
        commitRooms,
        commitContent,
        recordContentHistory,
        reserveRoomSequence,
        reserveFurnitureSequence,
        reserveStorageDeviceSequence,
        reserveItemSequence,
        undo: undoDocument,
        redo: redoDocument,
    } = useCanvasDocument();
    const rooms = document.rooms;
    const furniture = document.furniture;
    const storageDevices = document.storageDevices;
    const items = document.items;

    /*== 状态 ==*/
    const [selectedEntity, setSelectedEntity] = useState<CanvasSelection | null>(null);
    const [highlightedEntity, setHighlightedEntity] = useState<CanvasSelection | null>(null);
    const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
    const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle' });
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [renamingEntity, setRenamingEntity] = useState<CanvasSelection | null>(null);
    const [pendingDeletion, setPendingDeletion] = useState<CanvasSelection | null>(null);
    const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null);
    const [drawingTarget, setDrawingTarget] = useState<CanvasDrawingTarget | null>(null);
    const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
    const [zoom, setZoom] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isFocusing, setIsFocusing] = useState(false);
    const [tool, setTool] = useState<Tool>('room');

    /*== Refs：避免事件监听器闭包过期 ==*/
    const canvasRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef(interaction);
    const selectedEntityRef = useRef(selectedEntity);
    const drawingTargetRef = useRef(drawingTarget);
    const toolRef = useRef(tool);
    const panOffsetRef = useRef(panOffset);
    const zoomRef = useRef(zoom);
    const interactionStartContentRef = useRef<CanvasContent | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const itemHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        interactionRef.current = interaction;
    }, [interaction]);
    useEffect(() => {
        selectedEntityRef.current = selectedEntity;
    }, [selectedEntity]);
    useEffect(() => {
        drawingTargetRef.current = drawingTarget;
    }, [drawingTarget]);
    useEffect(() => {
        toolRef.current = tool;
    }, [tool]);
    useEffect(() => {
        panOffsetRef.current = panOffset;
    }, [panOffset]);
    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
        return () => {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            if (focusTransitionTimerRef.current) clearTimeout(focusTransitionTimerRef.current);
            if (itemHighlightTimerRef.current) clearTimeout(itemHighlightTimerRef.current);
        };
    }, []);

    /*== 网格吸附 ==*/
    const snap = useCallback(
        (v: number) => {
            if (!snapToGrid) return v;
            return Math.round(v / gridSize) * gridSize;
        },
        [gridSize, snapToGrid]
    );

    /*== 指针坐标 → 画板坐标（考虑缩放和平移） ==*/
    const getCoords = useCallback((e: PointerEvent | React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const viewX = e.clientX - rect.left;
        const viewY = e.clientY - rect.top;
        return {
            x: (viewX - panOffsetRef.current.x) / zoomRef.current,
            y: (viewY - panOffsetRef.current.y) / zoomRef.current,
        };
    }, []);

    /*== 同步交互状态与事件监听器使用的 ref ==*/
    const updateInteraction = useCallback((nextInteraction: InteractionState) => {
        interactionRef.current = nextInteraction;
        setInteraction(nextInteraction);
    }, []);

    const restoreCanvasUi = useCallback((content: CanvasContent) => {
        const selected = selectedEntityRef.current;
        if (selected && !hasEntity(content, selected)) {
            selectedEntityRef.current = null;
            setSelectedEntity(null);
        }
        if (drawingTargetRef.current && !content.rooms.some((room) => room.id === drawingTargetRef.current?.roomId)) {
            drawingTargetRef.current = null;
            setDrawingTarget(null);
        }
        setContextMenu(null);
        setRenamingEntity(null);
        setPendingDeletion(null);
        setDeletionImpact(null);
        setItemEditor((currentEditor) =>
            currentEditor?.itemId && !content.items.some((item) => item.id === currentEditor.itemId)
                ? null
                : currentEditor
        );
        setHighlightedItemId((itemId) => (itemId && content.items.some((item) => item.id === itemId) ? itemId : null));
    }, []);

    const undo = useCallback(() => {
        if (interactionRef.current.type !== 'idle') return;
        const content = undoDocument();
        if (content) restoreCanvasUi(content);
    }, [restoreCanvasUi, undoDocument]);

    const redo = useCallback(() => {
        if (interactionRef.current.type !== 'idle') return;
        const content = redoDocument();
        if (content) restoreCanvasUi(content);
    }, [redoDocument, restoreCanvasUi]);

    const recordInteractionHistory = useCallback(() => {
        const startContent = interactionStartContentRef.current;
        interactionStartContentRef.current = null;
        if (startContent) recordContentHistory(startContent);
    }, [recordContentHistory]);

    /*== 创建房间：序号只递增一次 ==*/
    const appendRoom = useCallback(
        (rect: Rect) => {
            const room = createRoom(reserveRoomSequence(), rect);
            commitRooms([...documentRef.current.rooms, room]);
            const selection = { kind: 'room' as const, id: room.id };
            selectedEntityRef.current = selection;
            setSelectedEntity(selection);
        },
        [commitRooms, documentRef, reserveRoomSequence]
    );

    const appendFurniture = useCallback(
        (roomId: string, rect: Rect) => {
            const nextFurniture = createFurniture(reserveFurnitureSequence(), roomId, rect);
            commitContent({
                ...getCanvasContent(documentRef.current),
                furniture: [...documentRef.current.furniture, nextFurniture],
            });
            const selection = { kind: 'furniture' as const, id: nextFurniture.id };
            selectedEntityRef.current = selection;
            setSelectedEntity(selection);
            drawingTargetRef.current = null;
            setDrawingTarget(null);
        },
        [commitContent, documentRef, reserveFurnitureSequence]
    );

    const appendRoomStorageDevice = useCallback(
        (roomId: string, rect: Rect) => {
            const storageDevice = createRoomStorageDevice(reserveStorageDeviceSequence(), roomId, rect);
            commitContent({
                ...getCanvasContent(documentRef.current),
                storageDevices: [...documentRef.current.storageDevices, storageDevice],
            });
            const selection = { kind: 'storage-device' as const, id: storageDevice.id };
            selectedEntityRef.current = selection;
            setSelectedEntity(selection);
            drawingTargetRef.current = null;
            setDrawingTarget(null);
        },
        [commitContent, documentRef, reserveStorageDeviceSequence]
    );

    const selectEntity = useCallback((entity: CanvasSelection) => {
        selectedEntityRef.current = entity;
        setSelectedEntity(entity);
    }, []);

    const cancelFocusTransition = useCallback(() => {
        if (focusTransitionTimerRef.current) clearTimeout(focusTransitionTimerRef.current);
        focusTransitionTimerRef.current = null;
        setIsFocusing(false);
    }, []);

    const beginChildDrawing = useCallback(
        (e: React.PointerEvent, room: Room, entityKind: CanvasDrawingKind) => {
            e.preventDefault();
            e.stopPropagation();
            cancelFocusTransition();
            const { x, y } = getCoords(e);
            const startX = clamp(snap(x) - room.x, 0, room.width);
            const startY = clamp(snap(y) - room.y, 0, room.height);
            updateInteraction({
                type: 'drawing-child',
                pointerId: e.pointerId,
                entityKind,
                roomId: room.id,
                startX,
                startY,
                currentX: startX,
                currentY: startY,
            });
        },
        [cancelFocusTransition, getCoords, snap, updateInteraction]
    );

    /*== 画板指针按下：根据当前工具决定行为 ==*/
    const handleCanvasPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            cancelFocusTransition();
            interactionStartContentRef.current = null;

            if (drawingTargetRef.current) return;

            /*-- 选取工具：开始拖拽画布 --*/
            if (toolRef.current === 'select') {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                updateInteraction({
                    type: 'panning',
                    pointerId: e.pointerId,
                    startMouseX: e.clientX - rect.left,
                    startMouseY: e.clientY - rect.top,
                    panStartX: panOffsetRef.current.x,
                    panStartY: panOffsetRef.current.y,
                });
                return;
            }

            /*-- 房间工具：开始绘制矩形 --*/
            const { x, y } = getCoords(e);
            const sx = snap(x);
            const sy = snap(y);
            selectedEntityRef.current = null;
            setSelectedEntity(null);
            updateInteraction({
                type: 'drawing-room',
                pointerId: e.pointerId,
                startX: sx,
                startY: sy,
                currentX: sx,
                currentY: sy,
            });
        },
        [cancelFocusTransition, getCoords, snap, updateInteraction]
    );

    /*== 房间指针按下：开始移动 ==*/
    const handleRoomPointerDown = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>, room: Room) => {
            if (e.button !== 0) return;
            const currentDrawingTarget = drawingTargetRef.current;
            if (currentDrawingTarget?.roomId === room.id) {
                beginChildDrawing(e, room, currentDrawingTarget.kind);
                return;
            }
            e.stopPropagation();
            cancelFocusTransition();
            selectEntity({ kind: 'room', id: room.id });
            interactionStartContentRef.current = getCanvasContent(documentRef.current);
            const { x, y } = getCoords(e);
            const sx = snap(x);
            const sy = snap(y);
            updateInteraction({
                type: 'moving',
                pointerId: e.pointerId,
                entityKind: 'room',
                id: room.id,
                offsetX: sx - room.x,
                offsetY: sy - room.y,
            });
        },
        [beginChildDrawing, cancelFocusTransition, documentRef, getCoords, selectEntity, snap, updateInteraction]
    );

    /*== 家具指针按下：绘制模式或开始移动 ==*/
    const handleFurniturePointerDown = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>, item: Furniture) => {
            if (e.button !== 0) return;
            const room = documentRef.current.rooms.find((currentRoom) => currentRoom.id === item.roomId);
            if (!room) return;
            const currentDrawingTarget = drawingTargetRef.current;
            if (currentDrawingTarget?.roomId === room.id) {
                beginChildDrawing(e, room, currentDrawingTarget.kind);
                return;
            }

            e.stopPropagation();
            cancelFocusTransition();
            selectEntity({ kind: 'furniture', id: item.id });
            interactionStartContentRef.current = getCanvasContent(documentRef.current);
            const { x, y } = getCoords(e);
            const pointerX = snap(x) - room.x;
            const pointerY = snap(y) - room.y;
            updateInteraction({
                type: 'moving',
                pointerId: e.pointerId,
                entityKind: 'furniture',
                id: item.id,
                offsetX: pointerX - item.x,
                offsetY: pointerY - item.y,
            });
        },
        [beginChildDrawing, cancelFocusTransition, documentRef, getCoords, selectEntity, snap, updateInteraction]
    );

    const handleStorageDevicePointerDown = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>, storageDevice: RoomStorageDevice) => {
            if (e.button !== 0) return;
            const room = documentRef.current.rooms.find(
                (currentRoom) => currentRoom.id === storageDevice.location.roomId
            );
            if (!room) return;
            const currentDrawingTarget = drawingTargetRef.current;
            if (currentDrawingTarget?.roomId === room.id) {
                beginChildDrawing(e, room, currentDrawingTarget.kind);
                return;
            }

            e.stopPropagation();
            cancelFocusTransition();
            selectEntity({ kind: 'storage-device', id: storageDevice.id });
            interactionStartContentRef.current = getCanvasContent(documentRef.current);
            const { x, y } = getCoords(e);
            const pointerX = snap(x) - room.x;
            const pointerY = snap(y) - room.y;
            updateInteraction({
                type: 'moving',
                pointerId: e.pointerId,
                entityKind: 'storage-device',
                id: storageDevice.id,
                offsetX: pointerX - storageDevice.rect.x,
                offsetY: pointerY - storageDevice.rect.y,
            });
        },
        [beginChildDrawing, cancelFocusTransition, documentRef, getCoords, selectEntity, snap, updateInteraction]
    );

    /*== 手柄指针按下：开始缩放 ==*/
    const handleHandlePointerDown = useCallback(
        (e: React.PointerEvent, entity: CanvasSelection, handle: ResizeHandle) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            cancelFocusTransition();
            const target =
                entity.kind === 'room'
                    ? documentRef.current.rooms.find((room) => room.id === entity.id)
                    : entity.kind === 'furniture'
                      ? documentRef.current.furniture.find((item) => item.id === entity.id)
                      : documentRef.current.storageDevices.find(
                            (item): item is RoomStorageDevice => item.id === entity.id && item.location.kind === 'room'
                        )?.rect;
            if (!target) return;
            interactionStartContentRef.current = getCanvasContent(documentRef.current);
            updateInteraction({
                type: 'resizing',
                pointerId: e.pointerId,
                entityKind: entity.kind,
                id: entity.id,
                handle,
                startRect: { x: target.x, y: target.y, width: target.width, height: target.height },
            });
        },
        [cancelFocusTransition, documentRef, updateInteraction]
    );

    /*== 将一次指针移动应用到当前交互 ==*/
    const applyPointerMove = useCallback(
        (e: PointerEvent) => {
            const current = interactionRef.current;
            if (current.type === 'idle' || current.pointerId !== e.pointerId) return;

            if (current.type === 'panning') {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const nextPan = {
                    x: current.panStartX + (e.clientX - rect.left - current.startMouseX),
                    y: current.panStartY + (e.clientY - rect.top - current.startMouseY),
                };
                panOffsetRef.current = nextPan;
                setPanOffset(nextPan);
                return;
            }

            const { x, y } = getCoords(e);
            const pointerX = snap(x);
            const pointerY = snap(y);

            if (current.type === 'drawing-room') {
                updateInteraction({ ...current, currentX: pointerX, currentY: pointerY });
                return;
            }

            if (current.type === 'drawing-child') {
                const room = documentRef.current.rooms.find((item) => item.id === current.roomId);
                if (!room) return;
                updateInteraction({
                    ...current,
                    currentX: clamp(pointerX - room.x, 0, room.width),
                    currentY: clamp(pointerY - room.y, 0, room.height),
                });
                return;
            }

            if (current.entityKind === 'furniture') {
                const currentFurniture = documentRef.current.furniture;
                const item = currentFurniture.find((currentItem) => currentItem.id === current.id);
                const room = item
                    ? documentRef.current.rooms.find((currentRoom) => currentRoom.id === item.roomId)
                    : null;
                if (!item || !room) return;
                const roomPointerX = pointerX - room.x;
                const roomPointerY = pointerY - room.y;
                const nextFurniture = currentFurniture.map((currentItem) => {
                    if (currentItem.id !== current.id) return currentItem;
                    const nextRect =
                        current.type === 'moving'
                            ? {
                                  ...currentItem,
                                  x: roomPointerX - current.offsetX,
                                  y: roomPointerY - current.offsetY,
                              }
                            : {
                                  ...currentItem,
                                  ...computeResizedRect(current.handle, current.startRect, roomPointerX, roomPointerY),
                              };
                    return { ...currentItem, ...fitRectWithinBounds(nextRect, room) };
                });
                if (!areFurnitureEqual(currentFurniture, nextFurniture)) {
                    replaceContent({ ...getCanvasContent(documentRef.current), furniture: nextFurniture });
                }
                return;
            }

            if (current.entityKind === 'storage-device') {
                const currentStorageDevices = documentRef.current.storageDevices;
                const storageDevice = currentStorageDevices.find(
                    (item): item is RoomStorageDevice => item.id === current.id && item.location.kind === 'room'
                );
                const room = storageDevice
                    ? documentRef.current.rooms.find((currentRoom) => currentRoom.id === storageDevice.location.roomId)
                    : null;
                if (!storageDevice || !room) return;
                const roomPointerX = pointerX - room.x;
                const roomPointerY = pointerY - room.y;
                const nextStorageDevices = currentStorageDevices.map((item) => {
                    if (item.id !== current.id || !isRoomStorageDevice(item)) return item;
                    const nextRect =
                        current.type === 'moving'
                            ? {
                                  ...item.rect,
                                  x: roomPointerX - current.offsetX,
                                  y: roomPointerY - current.offsetY,
                              }
                            : computeResizedRect(current.handle, current.startRect, roomPointerX, roomPointerY);
                    return { ...item, rect: fitRectWithinBounds(nextRect, room) };
                });
                if (!areStorageDevicesEqual(currentStorageDevices, nextStorageDevices)) {
                    replaceContent({ ...getCanvasContent(documentRef.current), storageDevices: nextStorageDevices });
                }
                return;
            }

            const currentRooms = documentRef.current.rooms;
            const nextRooms = currentRooms.map((room) => {
                if (room.id !== current.id) return room;
                if (current.type === 'moving') {
                    return { ...room, x: pointerX - current.offsetX, y: pointerY - current.offsetY };
                }
                const resizedRect = computeResizedRect(current.handle, current.startRect, pointerX, pointerY);
                const childRects = [
                    ...documentRef.current.furniture.filter((item) => item.roomId === room.id),
                    ...documentRef.current.storageDevices.flatMap((item) =>
                        isRoomStorageDevice(item) && item.location.roomId === room.id ? [item.rect] : []
                    ),
                ];
                return {
                    ...room,
                    ...keepChildrenInsideRoom(current.handle, current.startRect, resizedRect, childRects),
                };
            });
            if (!areRoomsEqual(currentRooms, nextRooms)) replaceRooms(nextRooms);
        },
        [documentRef, getCoords, replaceContent, replaceRooms, snap, updateInteraction]
    );

    /*== 全局指针移动/抬起（交互期间挂载） ==*/
    useEffect(() => {
        if (interaction.type === 'idle') return;

        let animationFrame: number | null = null;
        let latestPointerEvent: PointerEvent | null = null;

        const handlePointerMove = (e: PointerEvent) => {
            const current = interactionRef.current;
            if (current.type === 'idle' || current.pointerId !== e.pointerId) return;
            latestPointerEvent = e;
            if (animationFrame !== null) return;

            animationFrame = requestAnimationFrame(() => {
                animationFrame = null;
                if (latestPointerEvent) applyPointerMove(latestPointerEvent);
            });
        };

        const handlePointerUp = (e: PointerEvent) => {
            const current = interactionRef.current;
            if (current.type === 'idle' || current.pointerId !== e.pointerId) return;

            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = null;
            latestPointerEvent = null;
            applyPointerMove(e);

            /*-- 绘制完成：矩形足够大则创建对应实体 --*/
            const completed = interactionRef.current;
            if (completed.type === 'drawing-room') {
                const width = Math.abs(completed.currentX - completed.startX);
                const height = Math.abs(completed.currentY - completed.startY);
                if (width >= MIN_ROOM_SIZE && height >= MIN_ROOM_SIZE) {
                    appendRoom({
                        x: Math.min(completed.startX, completed.currentX),
                        y: Math.min(completed.startY, completed.currentY),
                        width,
                        height,
                    });
                }
            } else if (completed.type === 'drawing-child') {
                const width = Math.abs(completed.currentX - completed.startX);
                const height = Math.abs(completed.currentY - completed.startY);
                if (width >= MIN_ROOM_SIZE && height >= MIN_ROOM_SIZE) {
                    const rect = {
                        x: Math.min(completed.startX, completed.currentX),
                        y: Math.min(completed.startY, completed.currentY),
                        width,
                        height,
                    };
                    if (completed.entityKind === 'furniture') appendFurniture(completed.roomId, rect);
                    else appendRoomStorageDevice(completed.roomId, rect);
                }
            } else if (completed.type === 'moving' || completed.type === 'resizing') {
                recordInteractionHistory();
            }

            updateInteraction({ type: 'idle' });
        };

        const handlePointerCancel = (e: PointerEvent) => {
            const current = interactionRef.current;
            if (current.type === 'idle' || current.pointerId !== e.pointerId) return;
            if (current.type === 'moving' || current.type === 'resizing') recordInteractionHistory();
            updateInteraction({ type: 'idle' });
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
        return () => {
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
        };
    }, [
        appendFurniture,
        appendRoom,
        appendRoomStorageDevice,
        applyPointerMove,
        interaction.type,
        recordInteractionHistory,
        updateInteraction,
    ]);

    /*== 画板右键菜单：清空画板 ==*/
    const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetType: 'canvas',
        });
    }, []);

    /*== 房间右键菜单：修改名称 / 删除房间 ==*/
    const handleRoomContextMenu = useCallback((e: React.MouseEvent, room: Room) => {
        e.preventDefault();
        e.stopPropagation();
        const selection = { kind: 'room' as const, id: room.id };
        selectedEntityRef.current = selection;
        setSelectedEntity(selection);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetType: 'room',
            targetId: room.id,
        });
    }, []);

    /*== 家具右键菜单：修改名称 / 删除家具 ==*/
    const handleFurnitureContextMenu = useCallback((e: React.MouseEvent, item: Furniture) => {
        e.preventDefault();
        e.stopPropagation();
        const selection = { kind: 'furniture' as const, id: item.id };
        selectedEntityRef.current = selection;
        setSelectedEntity(selection);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetType: 'furniture',
            targetId: item.id,
        });
    }, []);

    const handleStorageDeviceContextMenu = useCallback((e: React.MouseEvent, item: RoomStorageDevice) => {
        e.preventDefault();
        e.stopPropagation();
        const selection = { kind: 'storage-device' as const, id: item.id };
        selectedEntityRef.current = selection;
        setSelectedEntity(selection);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetType: 'storage-device',
            targetId: item.id,
        });
    }, []);

    /*== 关闭右键菜单 ==*/
    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const deleteEntity = useCallback(
        (entity: CanvasSelection) => {
            if (!commitContent(removeEntity(getCanvasContent(documentRef.current), entity))) return;
            if (selectedEntityRef.current?.kind === entity.kind && selectedEntityRef.current.id === entity.id) {
                selectedEntityRef.current = null;
                setSelectedEntity(null);
            }
            if (drawingTargetRef.current?.roomId === entity.id && entity.kind === 'room') {
                drawingTargetRef.current = null;
                setDrawingTarget(null);
            }
        },
        [commitContent, documentRef]
    );

    const requestDelete = useCallback(
        (entity: CanvasSelection) => {
            const impact = getDeletionImpact(getCanvasContent(documentRef.current), entity);
            if (impact.furniture + impact.storageDevices + impact.items === 0) {
                deleteEntity(entity);
                return;
            }
            setPendingDeletion(entity);
            setDeletionImpact(impact);
        },
        [deleteEntity, documentRef]
    );

    const confirmDelete = useCallback(() => {
        if (!pendingDeletion) return;
        deleteEntity(pendingDeletion);
        setPendingDeletion(null);
        setDeletionImpact(null);
    }, [deleteEntity, pendingDeletion]);

    const cancelDelete = useCallback(() => {
        setPendingDeletion(null);
        setDeletionImpact(null);
    }, []);

    /*== 清空所有房间 ==*/
    const clearAll = useCallback(() => {
        if (!commitContent({ rooms: [], furniture: [], storageDevices: [], items: [] })) return;
        selectedEntityRef.current = null;
        setSelectedEntity(null);
        drawingTargetRef.current = null;
        setDrawingTarget(null);
        setContextMenu(null);
    }, [commitContent]);

    /*== 开始重命名：打开输入弹窗 ==*/
    const startRename = useCallback((entity: CanvasSelection) => {
        setRenamingEntity(entity);
    }, []);

    /*== 确认重命名 ==*/
    const confirmRename = useCallback(
        (name: string) => {
            if (!renamingEntity) return;
            const current = documentRef.current;
            let nextContent: CanvasContent;
            if (renamingEntity.kind === 'room') {
                nextContent = {
                    ...getCanvasContent(current),
                    rooms: current.rooms.map((room) => (room.id === renamingEntity.id ? { ...room, name } : room)),
                };
            } else if (renamingEntity.kind === 'furniture') {
                nextContent = {
                    ...getCanvasContent(current),
                    furniture: current.furniture.map((item) =>
                        item.id === renamingEntity.id ? { ...item, name } : item
                    ),
                };
            } else {
                nextContent = {
                    ...getCanvasContent(current),
                    storageDevices: current.storageDevices.map((item) =>
                        item.id === renamingEntity.id ? { ...item, name } : item
                    ),
                };
            }
            commitContent(nextContent);
            setRenamingEntity(null);
        },
        [commitContent, documentRef, renamingEntity]
    );

    /*== 取消重命名 ==*/
    const cancelRename = useCallback(() => {
        setRenamingEntity(null);
    }, []);

    const startDrawing = useCallback((kind: CanvasDrawingKind, roomId: string) => {
        const selection = { kind: 'room' as const, id: roomId };
        selectedEntityRef.current = selection;
        setSelectedEntity(selection);
        const target = { kind, roomId };
        drawingTargetRef.current = target;
        setDrawingTarget(target);
        setContextMenu(null);
    }, []);

    const startFurnitureDrawing = useCallback((roomId: string) => startDrawing('furniture', roomId), [startDrawing]);

    const startStorageDeviceDrawing = useCallback(
        (roomId: string) => startDrawing('storage-device', roomId),
        [startDrawing]
    );

    const cancelDrawing = useCallback(() => {
        drawingTargetRef.current = null;
        setDrawingTarget(null);
        if (interactionRef.current.type === 'drawing-child') updateInteraction({ type: 'idle' });
    }, [updateInteraction]);

    const appendFurnitureStorageDevice = useCallback(
        (furnitureId: string) => {
            if (!documentRef.current.furniture.some((item) => item.id === furnitureId)) return;
            const storageDevice = createFurnitureStorageDevice(reserveStorageDeviceSequence(), furnitureId);
            commitContent({
                ...getCanvasContent(documentRef.current),
                storageDevices: [...documentRef.current.storageDevices, storageDevice],
            });
            const selection = { kind: 'storage-device' as const, id: storageDevice.id };
            selectedEntityRef.current = selection;
            setSelectedEntity(selection);
        },
        [commitContent, documentRef, reserveStorageDeviceSequence]
    );

    const moveFurnitureToRoom = useCallback(
        (furnitureId: string, roomId: string) => {
            const current = documentRef.current;
            const targetRoom = current.rooms.find((room) => room.id === roomId);
            const targetFurniture = current.furniture.find((item) => item.id === furnitureId);
            if (!targetRoom || !targetFurniture || targetFurniture.roomId === roomId) return;
            const fittedRect = fitRectWithinBounds(
                {
                    ...targetFurniture,
                    x: snap((targetRoom.width - targetFurniture.width) / 2),
                    y: snap((targetRoom.height - targetFurniture.height) / 2),
                },
                targetRoom
            );
            commitContent({
                ...getCanvasContent(current),
                furniture: current.furniture.map((item) =>
                    item.id === furnitureId ? { ...item, ...fittedRect, roomId } : item
                ),
            });
        },
        [commitContent, documentRef, snap]
    );

    const moveStorageDevice = useCallback(
        (storageDeviceId: string, locationValue: string) => {
            const [kind, targetId] = locationValue.split(':');
            const current = documentRef.current;
            const storageDevice = current.storageDevices.find((item) => item.id === storageDeviceId);
            if (!storageDevice || !targetId) return;

            let nextStorageDevice: StorageDevice | null = null;
            if (kind === 'room') {
                const room = current.rooms.find((item) => item.id === targetId);
                if (!room) return;
                if (storageDevice.location.kind === 'room' && storageDevice.location.roomId === room.id) return;
                const sourceRect = isRoomStorageDevice(storageDevice)
                    ? storageDevice.rect
                    : { width: gridSize * 4, height: gridSize * 3, x: 0, y: 0 };
                nextStorageDevice = {
                    id: storageDevice.id,
                    name: storageDevice.name,
                    location: { kind: 'room', roomId: room.id },
                    rect: fitRectWithinBounds(
                        {
                            ...sourceRect,
                            x: snap((room.width - sourceRect.width) / 2),
                            y: snap((room.height - sourceRect.height) / 2),
                        },
                        room
                    ),
                };
            } else if (kind === 'furniture') {
                if (!current.furniture.some((item) => item.id === targetId)) return;
                if (storageDevice.location.kind === 'furniture' && storageDevice.location.furnitureId === targetId) {
                    return;
                }
                nextStorageDevice = {
                    id: storageDevice.id,
                    name: storageDevice.name,
                    location: { kind: 'furniture', furnitureId: targetId },
                };
            }
            if (!nextStorageDevice) return;

            commitContent({
                ...getCanvasContent(current),
                storageDevices: current.storageDevices.map((item) =>
                    item.id === storageDeviceId ? nextStorageDevice : item
                ),
            });
        },
        [commitContent, documentRef, gridSize, snap]
    );

    const startCreateItem = useCallback((location: ItemLocation) => {
        setItemEditor({ location });
        setContextMenu(null);
    }, []);

    const startEditItem = useCallback(
        (itemId: string) => {
            const item = documentRef.current.items.find((currentItem) => currentItem.id === itemId);
            if (!item) return;
            setItemEditor({ itemId, location: item.location });
        },
        [documentRef]
    );

    const confirmItem = useCallback(
        (value: Omit<Item, 'id'>) => {
            if (!itemEditor) return;
            const current = documentRef.current;
            const nextItems = itemEditor.itemId
                ? current.items.map((item) => (item.id === itemEditor.itemId ? { ...item, ...value } : item))
                : [...current.items, createItem(reserveItemSequence(), value.name, value.quantity, value.location)];
            commitContent({ ...getCanvasContent(documentRef.current), items: nextItems });
            setItemEditor(null);
        },
        [commitContent, documentRef, itemEditor, reserveItemSequence]
    );

    const cancelItemEditor = useCallback(() => setItemEditor(null), []);

    const deleteItem = useCallback(
        (itemId: string) => {
            const current = documentRef.current;
            if (!current.items.some((item) => item.id === itemId)) return;
            commitContent({ ...getCanvasContent(current), items: current.items.filter((item) => item.id !== itemId) });
            setHighlightedItemId((currentItemId) => (currentItemId === itemId ? null : currentItemId));
        },
        [commitContent, documentRef]
    );

    /*== 键盘快捷创建：在当前视口中心放置默认房间 ==*/
    const addRoom = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        cancelDrawing();
        const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();
        const width = gridSize * DEFAULT_ROOM_WIDTH_IN_GRIDS;
        const height = gridSize * DEFAULT_ROOM_HEIGHT_IN_GRIDS;
        const centerX = (canvasWidth / 2 - panOffsetRef.current.x) / zoomRef.current;
        const centerY = (canvasHeight / 2 - panOffsetRef.current.y) / zoomRef.current;

        appendRoom({
            x: snap(centerX - width / 2),
            y: snap(centerY - height / 2),
            width,
            height,
        });
    }, [appendRoom, cancelDrawing, gridSize, snap]);

    /*== 定位实体：家具以所属房间作为视口适配范围 ==*/
    const focusEntity = useCallback(
        (entity: CanvasSelection) => {
            const canvas = canvasRef.current;
            const current = documentRef.current;
            const furnitureRoomId =
                entity.kind === 'furniture'
                    ? current.furniture.find((item) => item.id === entity.id)?.roomId
                    : undefined;
            const storageDevice =
                entity.kind === 'storage-device'
                    ? current.storageDevices.find((item) => item.id === entity.id)
                    : undefined;
            const storageDeviceRoomId =
                storageDevice?.location.kind === 'room'
                    ? storageDevice.location.roomId
                    : current.furniture.find(
                          (item) =>
                              item.id ===
                              (storageDevice?.location.kind === 'furniture'
                                  ? storageDevice.location.furnitureId
                                  : undefined)
                      )?.roomId;
            const room =
                entity.kind === 'room'
                    ? current.rooms.find((item) => item.id === entity.id)
                    : current.rooms.find((item) => item.id === (furnitureRoomId ?? storageDeviceRoomId));
            if (!canvas || !room) return;

            cancelDrawing();
            cancelFocusTransition();

            const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();
            const availableWidth = Math.max(1, canvasWidth - FOCUS_VIEWPORT_PADDING * 2);
            const availableHeight = Math.max(1, canvasHeight - FOCUS_VIEWPORT_PADDING * 2);
            const fitZoom = clampZoom(Math.min(availableWidth / room.width, availableHeight / room.height));
            const nextZoom = Math.min(zoomRef.current, fitZoom);
            const nextPan = {
                x: canvasWidth / 2 - (room.x + room.width / 2) * nextZoom,
                y: canvasHeight / 2 - (room.y + room.height / 2) * nextZoom,
            };

            selectedEntityRef.current = entity;
            zoomRef.current = nextZoom;
            panOffsetRef.current = nextPan;
            setSelectedEntity(entity);
            setZoom(nextZoom);
            setPanOffset(nextPan);
            setIsFocusing(true);
            setContextMenu(null);
            setHighlightedEntity(entity);

            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            if (focusTransitionTimerRef.current) clearTimeout(focusTransitionTimerRef.current);
            highlightTimerRef.current = setTimeout(() => {
                setHighlightedEntity(null);
                highlightTimerRef.current = null;
            }, HIGHLIGHT_DURATION);
            focusTransitionTimerRef.current = setTimeout(() => {
                setIsFocusing(false);
                focusTransitionTimerRef.current = null;
            }, FOCUS_TRANSITION_DURATION);
        },
        [cancelDrawing, cancelFocusTransition, documentRef]
    );

    const focusItem = useCallback(
        (itemId: string) => {
            const item = documentRef.current.items.find((currentItem) => currentItem.id === itemId);
            if (!item) return;
            const entity: CanvasSelection =
                item.location.kind === 'room'
                    ? { kind: 'room', id: item.location.roomId }
                    : item.location.kind === 'furniture'
                      ? { kind: 'furniture', id: item.location.furnitureId }
                      : { kind: 'storage-device', id: item.location.storageDeviceId };
            focusEntity(entity);
            setHighlightedItemId(itemId);
            if (itemHighlightTimerRef.current) clearTimeout(itemHighlightTimerRef.current);
            itemHighlightTimerRef.current = setTimeout(() => {
                setHighlightedItemId(null);
                itemHighlightTimerRef.current = null;
            }, HIGHLIGHT_DURATION);
        },
        [documentRef, focusEntity]
    );

    /*== 房间键盘操作：移动、调整大小、重命名、删除、打开菜单 ==*/
    const handleRoomKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLButtonElement>, room: Room) => {
            const selection = { kind: 'room' as const, id: room.id };
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                selectEntity(selection);
                setContextMenu({ x: rect.left + 12, y: rect.top + 12, targetType: 'room', targetId: room.id });
                return;
            }

            if (e.key === 'Enter' || e.key === 'F2') {
                e.preventDefault();
                selectEntity(selection);
                startRename(selection);
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                e.stopPropagation();
                requestDelete(selection);
                return;
            }

            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            selectEntity(selection);
            const delta = getKeyboardDelta(e.key, gridSize);
            const nextRooms = documentRef.current.rooms.map((currentRoom) => {
                if (currentRoom.id !== room.id) return currentRoom;

                if (e.shiftKey) {
                    const nextRect = {
                        ...currentRoom,
                        width: Math.max(MIN_ROOM_SIZE, currentRoom.width + delta.x),
                        height: Math.max(MIN_ROOM_SIZE, currentRoom.height + delta.y),
                    };
                    const childRects = [
                        ...documentRef.current.furniture.filter((item) => item.roomId === room.id),
                        ...documentRef.current.storageDevices.flatMap((item) =>
                            isRoomStorageDevice(item) && item.location.roomId === room.id ? [item.rect] : []
                        ),
                    ];
                    return {
                        ...currentRoom,
                        ...keepChildrenInsideRoom('se', currentRoom, nextRect, childRects),
                    };
                }

                return {
                    ...currentRoom,
                    x: currentRoom.x + delta.x,
                    y: currentRoom.y + delta.y,
                };
            });
            commitRooms(nextRooms);
        },
        [commitRooms, documentRef, gridSize, requestDelete, selectEntity, startRename]
    );

    /*== 家具键盘操作：限制在所属房间内 ==*/
    const handleFurnitureKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLButtonElement>, item: Furniture) => {
            const selection = { kind: 'furniture' as const, id: item.id };
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                selectEntity(selection);
                setContextMenu({
                    x: rect.left + 12,
                    y: rect.top + 12,
                    targetType: 'furniture',
                    targetId: item.id,
                });
                return;
            }

            if (e.key === 'Enter' || e.key === 'F2') {
                e.preventDefault();
                selectEntity(selection);
                startRename(selection);
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                e.stopPropagation();
                requestDelete(selection);
                return;
            }

            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            selectEntity(selection);
            const current = documentRef.current;
            const room = current.rooms.find((targetRoom) => targetRoom.id === item.roomId);
            if (!room) return;
            const delta = getKeyboardDelta(e.key, gridSize);
            const nextFurniture = current.furniture.map((currentItem) => {
                if (currentItem.id !== item.id) return currentItem;
                const nextRect = e.shiftKey
                    ? {
                          ...currentItem,
                          width: currentItem.width + delta.x,
                          height: currentItem.height + delta.y,
                      }
                    : {
                          ...currentItem,
                          x: currentItem.x + delta.x,
                          y: currentItem.y + delta.y,
                      };
                return { ...currentItem, ...fitRectWithinBounds(nextRect, room) };
            });
            commitContent({ ...getCanvasContent(current), furniture: nextFurniture });
        },
        [commitContent, documentRef, gridSize, requestDelete, selectEntity, startRename]
    );

    const handleStorageDeviceKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLButtonElement>, storageDevice: RoomStorageDevice) => {
            const selection = { kind: 'storage-device' as const, id: storageDevice.id };
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                selectEntity(selection);
                setContextMenu({
                    x: rect.left + 12,
                    y: rect.top + 12,
                    targetType: 'storage-device',
                    targetId: storageDevice.id,
                });
                return;
            }

            if (e.key === 'Enter' || e.key === 'F2') {
                e.preventDefault();
                selectEntity(selection);
                startRename(selection);
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                e.stopPropagation();
                requestDelete(selection);
                return;
            }

            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            selectEntity(selection);
            const current = documentRef.current;
            const room = current.rooms.find((item) => item.id === storageDevice.location.roomId);
            if (!room) return;
            const delta = getKeyboardDelta(e.key, gridSize);
            const nextStorageDevices = current.storageDevices.map((item) => {
                if (item.id !== storageDevice.id || !isRoomStorageDevice(item)) return item;
                const nextRect = e.shiftKey
                    ? {
                          ...item.rect,
                          width: item.rect.width + delta.x,
                          height: item.rect.height + delta.y,
                      }
                    : {
                          ...item.rect,
                          x: item.rect.x + delta.x,
                          y: item.rect.y + delta.y,
                      };
                return { ...item, rect: fitRectWithinBounds(nextRect, room) };
            });
            commitContent({ ...getCanvasContent(current), storageDevices: nextStorageDevices });
        },
        [commitContent, documentRef, gridSize, requestDelete, selectEntity, startRename]
    );

    /*== 键盘快捷键：Escape 取消选中 / Delete+Backspace 删除选中 ==*/
    useKeyPress('Escape', () => {
        if (drawingTargetRef.current) {
            cancelDrawing();
            return;
        }
        selectedEntityRef.current = null;
        setSelectedEntity(null);
    });

    useKeyPress(['Delete', 'Backspace'], () => {
        const entity = selectedEntityRef.current;
        if (entity) requestDelete(entity);
    });

    useKeyPress(
        ['z', 'Z'],
        (e) => {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        },
        { ctrlKey: true }
    );

    useKeyPress(
        ['z', 'Z'],
        (e) => {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        },
        { metaKey: true }
    );

    useKeyPress(
        ['y', 'Y'],
        (e) => {
            e.preventDefault();
            redo();
        },
        { ctrlKey: true }
    );

    /*== 以画布视口中心为锚点缩放，保持中心内容不偏移 ==*/
    const setZoomAtCanvasCenter = useCallback(
        (nextZoom: number) => {
            const currentZoom = zoomRef.current;
            const zoom = clampZoom(nextZoom);
            if (zoom === currentZoom) return;
            cancelFocusTransition();

            const canvas = canvasRef.current;
            if (canvas) {
                const { width, height } = canvas.getBoundingClientRect();
                const currentPan = panOffsetRef.current;
                const centerX = width / 2;
                const centerY = height / 2;
                const worldX = (centerX - currentPan.x) / currentZoom;
                const worldY = (centerY - currentPan.y) / currentZoom;
                const nextPan = {
                    x: centerX - worldX * zoom,
                    y: centerY - worldY * zoom,
                };

                panOffsetRef.current = nextPan;
                setPanOffset(nextPan);
            }

            zoomRef.current = zoom;
            setZoom(zoom);
        },
        [cancelFocusTransition]
    );

    /*== 滚轮缩放：直接滚动，不触发浏览器默认行为 ==*/
    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            e.preventDefault();
            setZoomAtCanvasCenter(zoomRef.current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        },
        [setZoomAtCanvasCenter]
    );

    /*== ZoomControl 按钮缩放 ==*/
    const zoomIn = useCallback(() => setZoomAtCanvasCenter(zoomRef.current + ZOOM_STEP), [setZoomAtCanvasCenter]);
    const zoomOut = useCallback(() => setZoomAtCanvasCenter(zoomRef.current - ZOOM_STEP), [setZoomAtCanvasCenter]);

    const changeTool = useCallback(
        (nextTool: Tool) => {
            cancelDrawing();
            toolRef.current = nextTool;
            setTool(nextTool);
        },
        [cancelDrawing]
    );

    return {
        rooms,
        furniture,
        storageDevices,
        items,
        canUndo,
        canRedo,
        selectedEntity,
        highlightedEntity,
        highlightedItemId,
        interaction,
        contextMenu,
        renamingEntity,
        pendingDeletion,
        deletionImpact,
        drawingTarget,
        itemEditor,
        zoom,
        panOffset,
        isFocusing,
        tool,
        canvasRef,
        handleCanvasPointerDown,
        handleRoomPointerDown,
        handleFurniturePointerDown,
        handleStorageDevicePointerDown,
        handleHandlePointerDown,
        handleRoomKeyDown,
        handleFurnitureKeyDown,
        handleStorageDeviceKeyDown,
        selectEntity,
        handleCanvasContextMenu,
        handleRoomContextMenu,
        handleFurnitureContextMenu,
        handleStorageDeviceContextMenu,
        handleWheel,
        closeContextMenu,
        clearAll,
        startRename,
        confirmRename,
        cancelRename,
        requestDelete,
        confirmDelete,
        cancelDelete,
        startFurnitureDrawing,
        startStorageDeviceDrawing,
        cancelDrawing,
        createFurnitureStorageDevice: appendFurnitureStorageDevice,
        moveFurnitureToRoom,
        moveStorageDevice,
        startCreateItem,
        startEditItem,
        confirmItem,
        cancelItemEditor,
        deleteItem,
        zoomIn,
        zoomOut,
        addRoom,
        focusEntity,
        focusItem,
        undo,
        redo,
        setTool: changeTool,
    };
}
