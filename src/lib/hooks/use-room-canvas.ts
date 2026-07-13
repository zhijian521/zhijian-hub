'use client';

/*============================================================================
  use-room-canvas — 画板交互逻辑 Hook

  职责：管理房间列表状态、鼠标绘制/移动/缩放交互、键盘快捷键、
        右键菜单状态、重命名/删除/清空操作、画板缩放
  不负责渲染，只提供数据和事件回调
============================================================================*/

/*== 依赖导入 ==*/
import { useState, useRef, useEffect, useCallback } from 'react';

/*== Hook 导入 ==*/
import { useKeyPress } from '@/lib/hooks/use-key-press';

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
    handleCanvasMouseDown: (e: React.MouseEvent) => void;
    handleRoomMouseDown: (e: React.MouseEvent, room: Room) => void;
    handleHandleMouseDown: (e: React.MouseEvent, handle: ResizeHandle) => void;
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
    setTool: (tool: Tool) => void;
}

/*== 最小房间尺寸（像素） ==*/
const MIN_ROOM_SIZE = 20;

/*== 缩放范围与步进 ==*/
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

/*== 缩放钳制函数 ==*/
function clampZoom(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/*============================================================================
  computeResizedRect — 根据手柄方向和鼠标位置计算新矩形

  手柄方位含 n/s/e/w 字母，分别对应北/南/东/西四条边
  拖动某条边时，对边保持不动，当前边跟随鼠标
============================================================================*/
function computeResizedRect(handle: ResizeHandle, startRect: Rect, mouseX: number, mouseY: number): Rect {
    let { x, y, width, height } = startRect;

    /*-- 西边（w）：左边界跟随鼠标，右边界不动 --*/
    if (handle.includes('w')) {
        const newWidth = startRect.x + startRect.width - mouseX;
        if (newWidth >= MIN_ROOM_SIZE) {
            x = mouseX;
            width = newWidth;
        } else {
            x = startRect.x + startRect.width - MIN_ROOM_SIZE;
            width = MIN_ROOM_SIZE;
        }
    }

    /*-- 东边（e）：右边界跟随鼠标，左边界不动 --*/
    if (handle.includes('e')) {
        width = Math.max(MIN_ROOM_SIZE, mouseX - startRect.x);
    }

    /*-- 北边（n）：上边界跟随鼠标，下边界不动 --*/
    if (handle.includes('n')) {
        const newHeight = startRect.y + startRect.height - mouseY;
        if (newHeight >= MIN_ROOM_SIZE) {
            y = mouseY;
            height = newHeight;
        } else {
            y = startRect.y + startRect.height - MIN_ROOM_SIZE;
            height = MIN_ROOM_SIZE;
        }
    }

    /*-- 南边（s）：下边界跟随鼠标，上边界不动 --*/
    if (handle.includes('s')) {
        height = Math.max(MIN_ROOM_SIZE, mouseY - startRect.y);
    }

    return { x, y, width, height };
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

    /*== 鼠标坐标 → 画板坐标（考虑缩放和平移） ==*/
    const getCoords = useCallback((e: MouseEvent | React.MouseEvent) => {
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

    /*== 生成唯一 ID ==*/
    const generateId = useCallback(() => {
        return `room-${Date.now()}-${++roomCounter.current}`;
    }, []);

    /*== 画板鼠标按下：根据当前工具决定行为 ==*/
    const handleCanvasMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;

            /*-- 选取工具：开始拖拽画布 --*/
            if (toolRef.current === 'select') {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                setInteraction({
                    type: 'panning',
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
            setSelectedId(null);
            setInteraction({
                type: 'drawing',
                startX: sx,
                startY: sy,
                currentX: sx,
                currentY: sy,
            });
        },
        [getCoords, snap]
    );

    /*== 房间鼠标按下：开始移动 ==*/
    const handleRoomMouseDown = useCallback(
        (e: React.MouseEvent, room: Room) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            setSelectedId(room.id);
            const { x, y } = getCoords(e);
            const sx = snap(x);
            const sy = snap(y);
            setInteraction({
                type: 'moving',
                id: room.id,
                offsetX: sx - room.x,
                offsetY: sy - room.y,
            });
        },
        [getCoords, snap]
    );

    /*== 手柄鼠标按下：开始缩放 ==*/
    const handleHandleMouseDown = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const room = roomsRef.current.find((r) => r.id === selectedIdRef.current);
        if (!room) return;
        setInteraction({
            type: 'resizing',
            id: room.id,
            handle,
            startRect: { x: room.x, y: room.y, width: room.width, height: room.height },
        });
    }, []);

    /*== 全局鼠标移动/抬起（交互期间挂载） ==*/
    useEffect(() => {
        if (interaction.type === 'idle') return;

        const handleMove = (e: MouseEvent) => {
            const current = interactionRef.current;
            if (current.type === 'idle') return;

            const { x, y } = getCoords(e);
            const sx = snap(x);
            const sy = snap(y);

            if (current.type === 'drawing') {
                setInteraction({ ...current, currentX: sx, currentY: sy });
            } else if (current.type === 'moving') {
                setRooms((prev) =>
                    prev.map((r) =>
                        r.id === current.id ? { ...r, x: sx - current.offsetX, y: sy - current.offsetY } : r
                    )
                );
            } else if (current.type === 'resizing') {
                const newRect = computeResizedRect(current.handle, current.startRect, sx, sy);
                setRooms((prev) => prev.map((r) => (r.id === current.id ? { ...r, ...newRect } : r)));
            } else if (current.type === 'panning') {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const viewX = e.clientX - rect.left;
                const viewY = e.clientY - rect.top;
                setPanOffset({
                    x: current.panStartX + (viewX - current.startMouseX),
                    y: current.panStartY + (viewY - current.startMouseY),
                });
            }
        };

        const handleUp = () => {
            const current = interactionRef.current;

            /*-- 绘制完成：矩形足够大则创建房间 --*/
            if (current.type === 'drawing') {
                const w = Math.abs(current.currentX - current.startX);
                const h = Math.abs(current.currentY - current.startY);
                if (w >= MIN_ROOM_SIZE && h >= MIN_ROOM_SIZE) {
                    const newRoom: Room = {
                        id: generateId(),
                        name: `房间 ${++roomCounter.current}`,
                        x: Math.min(current.startX, current.currentX),
                        y: Math.min(current.startY, current.currentY),
                        width: w,
                        height: h,
                    };
                    setRooms((prev) => [...prev, newRoom]);
                    setSelectedId(newRoom.id);
                }
            }

            setInteraction({ type: 'idle' });
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [interaction.type, getCoords, snap, generateId]);

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
        setRooms((prev) => prev.filter((r) => r.id !== id));
        setSelectedId((prev) => (prev === id ? null : prev));
    }, []);

    /*== 清空所有房间 ==*/
    const clearAll = useCallback(() => {
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
            setRooms((prev) => prev.map((r) => (r.id === renamingId ? { ...r, name } : r)));
            setRenamingId(null);
        },
        [renamingId]
    );

    /*== 取消重命名 ==*/
    const cancelRename = useCallback(() => {
        setRenamingId(null);
    }, []);

    /*== 键盘快捷键：Escape 取消选中 / Delete+Backspace 删除选中 ==*/
    useKeyPress('Escape', () => {
        setSelectedId(null);
    });

    useKeyPress(['Delete', 'Backspace'], () => {
        const id = selectedIdRef.current;
        if (id) deleteRoom(id);
    });

    /*== 滚轮缩放：Ctrl+滚轮 ==*/
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        setZoom((z) => clampZoom(z + delta));
    }, []);

    /*== ZoomControl 按钮缩放 ==*/
    const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
    const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);

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
        handleCanvasMouseDown,
        handleRoomMouseDown,
        handleHandleMouseDown,
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
        setTool,
    };
}
