'use client';

/*============================================================================
  use-room-canvas — 画板交互逻辑 Hook

  职责：管理房间列表状态、指针绘制/移动/缩放交互、键盘快捷键、
        右键菜单状态、重命名/删除/清空操作、画板缩放
  不负责渲染，只提供数据和事件回调
============================================================================*/

/*== 依赖导入 ==*/
import { useState, useRef, useEffect, useCallback } from 'react';

/*== Hook 导入 ==*/
import { useKeyPress } from '@/lib/hooks/use-key-press';

/*== 工具函数 ==*/
import { computeResizedRect, createRoom, MIN_ROOM_SIZE } from '@/lib/utils/room-canvas';

/*== 类型导入 ==*/
import type { Room, ResizeHandle, InteractionState, Rect, ContextMenuState, Tool } from '@/lib/types/room-canvas';

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
    selectedId: string | null;
    interaction: InteractionState;
    contextMenu: ContextMenuState | null;
    renamingId: string | null;
    zoom: number;
    panOffset: { x: number; y: number };
    tool: Tool;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    handleCanvasPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    handleRoomPointerDown: (e: React.PointerEvent<HTMLButtonElement>, room: Room) => void;
    handleHandlePointerDown: (e: React.PointerEvent<HTMLSpanElement>, handle: ResizeHandle) => void;
    handleRoomKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, room: Room) => void;
    selectRoom: (id: string) => void;
    handleCanvasContextMenu: (e: React.MouseEvent) => void;
    handleRoomContextMenu: (e: React.MouseEvent, room: Room) => void;
    handleWheel: (e: React.WheelEvent) => void;
    closeContextMenu: () => void;
    deleteRoom: (id: string) => void;
    clearAll: () => void;
    startRename: (id: string) => void;
    confirmRename: (name: string) => void;
    cancelRename: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    addRoom: () => void;
    setTool: (tool: Tool) => void;
}

/*== 缩放范围与步进 ==*/
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

/*== 键盘与快捷创建尺寸 ==*/
const DEFAULT_ROOM_WIDTH_IN_GRIDS = 6;
const DEFAULT_ROOM_HEIGHT_IN_GRIDS = 4;

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

/*============================================================================
  useRoomCanvas — 画板交互 Hook
============================================================================*/
export function useRoomCanvas(options: UseRoomCanvasOptions = {}): UseRoomCanvasReturn {
    const { gridSize = 20, snapToGrid = true } = options;

    /*== 状态 ==*/
    const [rooms, setRooms] = useState<Room[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle' });
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [tool, setTool] = useState<Tool>('room');

    /*== Refs：避免事件监听器闭包过期 ==*/
    const canvasRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef(interaction);
    const roomsRef = useRef(rooms);
    const selectedIdRef = useRef(selectedId);
    const toolRef = useRef(tool);
    const panOffsetRef = useRef(panOffset);
    const zoomRef = useRef(zoom);
    const roomCounter = useRef(0);

    useEffect(() => {
        interactionRef.current = interaction;
    }, [interaction]);
    useEffect(() => {
        roomsRef.current = rooms;
    }, [rooms]);
    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);
    useEffect(() => {
        toolRef.current = tool;
    }, [tool]);
    useEffect(() => {
        panOffsetRef.current = panOffset;
    }, [panOffset]);
    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

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

    /*== 创建房间：序号只递增一次 ==*/
    const appendRoom = useCallback((rect: Rect) => {
        const room = createRoom(++roomCounter.current, rect);
        setRooms((currentRooms) => {
            const nextRooms = [...currentRooms, room];
            roomsRef.current = nextRooms;
            return nextRooms;
        });
        selectedIdRef.current = room.id;
        setSelectedId(room.id);
    }, []);

    const selectRoom = useCallback((id: string) => {
        selectedIdRef.current = id;
        setSelectedId(id);
    }, []);

    /*== 画板指针按下：根据当前工具决定行为 ==*/
    const handleCanvasPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();

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
            selectedIdRef.current = null;
            setSelectedId(null);
            updateInteraction({
                type: 'drawing',
                pointerId: e.pointerId,
                startX: sx,
                startY: sy,
                currentX: sx,
                currentY: sy,
            });
        },
        [getCoords, snap, updateInteraction]
    );

    /*== 房间指针按下：开始移动 ==*/
    const handleRoomPointerDown = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>, room: Room) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            selectRoom(room.id);
            const { x, y } = getCoords(e);
            const sx = snap(x);
            const sy = snap(y);
            updateInteraction({
                type: 'moving',
                pointerId: e.pointerId,
                id: room.id,
                offsetX: sx - room.x,
                offsetY: sy - room.y,
            });
        },
        [getCoords, selectRoom, snap, updateInteraction]
    );

    /*== 手柄指针按下：开始缩放 ==*/
    const handleHandlePointerDown = useCallback(
        (e: React.PointerEvent, handle: ResizeHandle) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const room = roomsRef.current.find((currentRoom) => currentRoom.id === selectedIdRef.current);
            if (!room) return;
            updateInteraction({
                type: 'resizing',
                pointerId: e.pointerId,
                id: room.id,
                handle,
                startRect: { x: room.x, y: room.y, width: room.width, height: room.height },
            });
        },
        [updateInteraction]
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

            if (current.type === 'drawing') {
                updateInteraction({ ...current, currentX: pointerX, currentY: pointerY });
                return;
            }

            setRooms((currentRooms) => {
                const nextRooms = currentRooms.map((room) => {
                    if (room.id !== current.id) return room;
                    if (current.type === 'moving') {
                        return { ...room, x: pointerX - current.offsetX, y: pointerY - current.offsetY };
                    }
                    return { ...room, ...computeResizedRect(current.handle, current.startRect, pointerX, pointerY) };
                });
                roomsRef.current = nextRooms;
                return nextRooms;
            });
        },
        [getCoords, snap, updateInteraction]
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

            /*-- 绘制完成：矩形足够大则创建房间 --*/
            const completed = interactionRef.current;
            if (completed.type === 'drawing') {
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
            }

            updateInteraction({ type: 'idle' });
        };

        const handlePointerCancel = (e: PointerEvent) => {
            const current = interactionRef.current;
            if (current.type === 'idle' || current.pointerId !== e.pointerId) return;
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
    }, [appendRoom, applyPointerMove, interaction.type, updateInteraction]);

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
        selectedIdRef.current = room.id;
        setSelectedId(room.id);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetType: 'room',
            roomId: room.id,
        });
    }, []);

    /*== 关闭右键菜单 ==*/
    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    /*== 删除房间 ==*/
    const deleteRoom = useCallback((id: string) => {
        setRooms((currentRooms) => {
            const nextRooms = currentRooms.filter((room) => room.id !== id);
            roomsRef.current = nextRooms;
            return nextRooms;
        });
        if (selectedIdRef.current === id) {
            selectedIdRef.current = null;
            setSelectedId(null);
        }
    }, []);

    /*== 清空所有房间 ==*/
    const clearAll = useCallback(() => {
        roomsRef.current = [];
        selectedIdRef.current = null;
        setRooms([]);
        setSelectedId(null);
    }, []);

    /*== 开始重命名：打开输入弹窗 ==*/
    const startRename = useCallback((id: string) => {
        setRenamingId(id);
    }, []);

    /*== 确认重命名 ==*/
    const confirmRename = useCallback(
        (name: string) => {
            if (!renamingId) return;
            setRooms((currentRooms) => {
                const nextRooms = currentRooms.map((room) => (room.id === renamingId ? { ...room, name } : room));
                roomsRef.current = nextRooms;
                return nextRooms;
            });
            setRenamingId(null);
        },
        [renamingId]
    );

    /*== 取消重命名 ==*/
    const cancelRename = useCallback(() => {
        setRenamingId(null);
    }, []);

    /*== 键盘快捷创建：在当前视口中心放置默认房间 ==*/
    const addRoom = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
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
    }, [appendRoom, gridSize, snap]);

    /*== 房间键盘操作：移动、调整大小、重命名、删除、打开菜单 ==*/
    const handleRoomKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLButtonElement>, room: Room) => {
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                selectRoom(room.id);
                setContextMenu({ x: rect.left + 12, y: rect.top + 12, targetType: 'room', roomId: room.id });
                return;
            }

            if (e.key === 'Enter' || e.key === 'F2') {
                e.preventDefault();
                selectRoom(room.id);
                startRename(room.id);
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteRoom(room.id);
                return;
            }

            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            selectRoom(room.id);
            const delta = getKeyboardDelta(e.key, gridSize);
            setRooms((currentRooms) => {
                const nextRooms = currentRooms.map((currentRoom) => {
                    if (currentRoom.id !== room.id) return currentRoom;

                    if (e.shiftKey) {
                        return {
                            ...currentRoom,
                            width: Math.max(MIN_ROOM_SIZE, currentRoom.width + delta.x),
                            height: Math.max(MIN_ROOM_SIZE, currentRoom.height + delta.y),
                        };
                    }

                    return {
                        ...currentRoom,
                        x: currentRoom.x + delta.x,
                        y: currentRoom.y + delta.y,
                    };
                });
                roomsRef.current = nextRooms;
                return nextRooms;
            });
        },
        [deleteRoom, gridSize, selectRoom, startRename]
    );

    /*== 键盘快捷键：Escape 取消选中 / Delete+Backspace 删除选中 ==*/
    useKeyPress('Escape', () => {
        selectedIdRef.current = null;
        setSelectedId(null);
    });

    useKeyPress(['Delete', 'Backspace'], () => {
        const id = selectedIdRef.current;
        if (id) deleteRoom(id);
    });

    /*== 以画布视口中心为锚点缩放，保持中心内容不偏移 ==*/
    const setZoomAtCanvasCenter = useCallback((nextZoom: number) => {
        const currentZoom = zoomRef.current;
        const zoom = clampZoom(nextZoom);
        if (zoom === currentZoom) return;

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
    }, []);

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

    return {
        rooms,
        selectedId,
        interaction,
        contextMenu,
        renamingId,
        zoom,
        panOffset,
        tool,
        canvasRef,
        handleCanvasPointerDown,
        handleRoomPointerDown,
        handleHandlePointerDown,
        handleRoomKeyDown,
        selectRoom,
        handleCanvasContextMenu,
        handleRoomContextMenu,
        handleWheel,
        closeContextMenu,
        deleteRoom,
        clearAll,
        startRename,
        confirmRename,
        cancelRename,
        zoomIn,
        zoomOut,
        addRoom,
        setTool,
    };
}
