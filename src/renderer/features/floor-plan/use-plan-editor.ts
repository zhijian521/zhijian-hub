import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { Opening, Rect, Room } from '@/app/types';
import {
    BAY_DEPTH,
    hitWall,
    resizeRect,
    wallSpan,
    type Point,
    type ResizeDir,
} from '@/lib/plan-geometry';
import {
    bayFits,
    boundsOf,
    wallIsOpen,
    clampOpening,
    openingFits,
    overlapsRoom,
    snapCoordinate,
    wallOpenings,
    SNAP,
} from '@/lib/plan-scene';
import {
    BAY_WIDTH,
    DOOR_WIDTH,
    MIN_ROOM_SIZE,
    WINDOW_WIDTH,
    useFloorPlanStore,
} from '@/stores/floor-plan';

/** 绘图工具。door / window / bay 三种都走同一条「点墙放洞」的路径，只是洞口类型不同。 */
export type PlanTool = 'select' | 'room' | 'door' | 'window' | 'bay' | 'hand';
/** 会往墙上开洞的工具，判断时不用每次写三个 ||。 */
const OPENING_TOOLS: PlanTool[] = ['door', 'window', 'bay'];

/**
 * 浏览模式是默认态：只能看和搜，拖动是平移，点一下只做选中。
 * 改户型（画房间、挪墙、放门窗、删房间）必须先显式进入编辑模式，
 * 这样"手滑拖了一下房间"就不会再发生。
 *
 * furniture 是第三态：摆家具时房间几何完全锁死 —— 没有缩放柄、拖着画布只是平移，
 * 能拖动的只有家具。两件事分开，界面才不会互相打岔。
 */
export type PlanMode = 'browse' | 'edit' | 'furniture';

type Drag =
    | {
          kind: 'pan';
          pointer: number;
          start: Point;
          x: number;
          y: number;
          /** 浏览模式下按下左键：抬起时若没拖动过，就把点到的房间选上 */
          pick: boolean;
          moved: boolean;
      }
    | { kind: 'draw'; pointer: number; start: Point }
    | { kind: 'move' | 'resize'; pointer: number; start: Point; room: Room; dir?: ResizeDir }
    | { kind: 'opening'; pointer: number; start: Point; room: Room; opening: Opening };

export function usePlanEditor() {
    const store = useFloorPlanStore();
    const stage = ref<SVGSVGElement | null>(null);
    const tool = ref<PlanTool>('select');
    const mode = ref<PlanMode>('browse');
    const zoom = ref(1);
    const pan = ref({ x: 130, y: 130 });
    const size = ref({ width: 800, height: 600 });
    const drag = ref<Drag | null>(null);
    const draftRoom = ref<Room | null>(null);
    const drawRect = ref<Rect | null>(null);
    const hover = ref<Point | null>(null);
    const selectedOpeningId = ref<string | null>(null);
    const space = ref(false);
    const message = ref('');
    const rooms = computed(() =>
        store.rooms.map((r) => (r.id === draftRoom.value?.id ? draftRoom.value : r)),
    );
    const selectedRoom = computed(() => rooms.value.find((r) => r.id === store.selectedId) ?? null);
    const selectedOpening = computed(
        () => selectedRoom.value?.openings.find((o) => o.id === selectedOpeningId.value) ?? null,
    );
    const invalid = computed(() => {
        if (drawRect.value) return overlapsRoom(drawRect.value, store.rooms);
        if (!draftRoom.value) return false;
        return (
            overlapsRoom(draftRoom.value, store.rooms, draftRoom.value.id) ||
            !openingFits(draftRoom.value, draftRoom.value)
        );
    });
    /** 浏览模式下鼠标压在哪个房间上：用来把边界描出来，让人知道这里能点。 */
    const hoveredRoomId = computed(() => {
        if (mode.value !== 'browse' || drag.value || !hover.value) return null;
        const point = hover.value;
        return (
            store.rooms.find(
                (room) =>
                    point.x >= room.x &&
                    point.x <= room.x + room.width &&
                    point.y >= room.y &&
                    point.y <= room.y + room.height,
            )?.id ?? null
        );
    });
    const otherRooms = (id?: string) => store.rooms.filter((r) => r.id !== id);
    const snapped = (p: Point, id?: string): Point => ({
        x: snapCoordinate(p.x, 'x', otherRooms(id), 8 / zoom.value),
        y: snapCoordinate(p.y, 'y', otherRooms(id), 8 / zoom.value),
    });
    function local(event: { clientX: number; clientY: number }): Point {
        const rect = stage.value?.getBoundingClientRect();
        return {
            x: (event.clientX - (rect?.left ?? 0) - pan.value.x) / zoom.value,
            y: (event.clientY - (rect?.top ?? 0) - pan.value.y) / zoom.value,
        };
    }
    const placement = computed(() => {
        if (mode.value !== 'edit') return null;
        if (!hover.value || !OPENING_TOOLS.includes(tool.value)) return null;
        let nearest: { room: Room; wall: Opening['wall']; along: number; distance: number } | null =
            null;
        for (const room of store.rooms) {
            const hit = hitWall(room, hover.value.x, hover.value.y, 16 / zoom.value);
            if (!hit) continue;
            // 拆掉的边上一段墙都没有，没地方凿门窗；不拦的话会存下一个看不见的洞口，
            // 哪天把墙补回来它就自己冒出来。拆墙不分是哪一侧拆的，所以用 wallIsOpen。
            if (wallIsOpen(store.rooms, room, hit.wall)) continue;
            const span = wallSpan(room, hit.wall);
            const distance = Math.abs(
                (hover.value.x - span.x) * span.nx + (hover.value.y - span.y) * span.ny,
            );
            // Selecting a room chooses which side of a shared wall the door swings into.
            if (
                !nearest ||
                distance < nearest.distance ||
                (distance === nearest.distance && room.id === store.selectedId)
            )
                nearest = { room, ...hit, distance };
        }
        if (!nearest) return null;
        const width =
            tool.value === 'door' ? DOOR_WIDTH : tool.value === 'bay' ? BAY_WIDTH : WINDOW_WIDTH;
        const span = wallSpan(nearest.room, nearest.wall);
        const desired = Math.round((nearest.along - width / 2) / SNAP) * SNAP;
        const pos = clampOpening(
            desired,
            width,
            span.length,
            wallOpenings(store.rooms, nearest.room, nearest.wall),
        );
        if (pos === null) return null;
        const opening: Opening = {
            id: 'preview',
            kind: tool.value as 'door' | 'window' | 'bay',
            wall: nearest.wall,
            pos,
            width,
            hinge: 'start',
            swing: 'in',
            depth: BAY_DEPTH,
        };
        // 飘窗要凸到屋外：落在隔墙上时窗台会插进邻居家，这里直接判掉。
        return {
            room: nearest.room,
            opening,
            blocked: !bayFits(store.rooms, nearest.room, opening),
        };
    });
    function chooseTool(value: PlanTool) {
        cancel();
        tool.value = value;
        // 选了绘图工具就等于宣布"我要改"，不用先专门点一次模式开关。
        if (value !== 'select') mode.value = 'edit';
        message.value = '';
        void nextTick(() => stage.value?.focus({ preventScroll: true }));
    }

    /** 切换浏览 / 修改。离开编辑模式时收回工具与缩放柄，避免残留半截操作。 */
    function setMode(value: PlanMode) {
        if (mode.value === value) return;
        cancel();
        mode.value = value;
        message.value = '';
        if (value !== 'edit') {
            tool.value = 'select';
            selectedOpeningId.value = null;
        }
        void nextTick(() => stage.value?.focus({ preventScroll: true }));
    }

    /** 命中画布上某个房间；浏览模式下用它把点击翻译成选中。 */
    function roomAt(clientX: number, clientY: number): string | null {
        const element = document.elementFromPoint(clientX, clientY);
        const id = element?.closest('[data-room]')?.getAttribute('data-room') ?? null;
        return id && store.rooms.some((room) => room.id === id) ? id : null;
    }

    /** 把某个房间移到视线中心：搜索命中与列表点击都走这里。 */
    function focusRoom(id: string) {
        const room = store.rooms.find((item) => item.id === id);
        if (!room) return;
        const viewport = { width: size.value.width, height: size.value.height };
        const fits =
            room.width * zoom.value < viewport.width - 360 &&
            room.height * zoom.value < viewport.height - 300;
        const nextZoom = fits
            ? zoom.value
            : Math.min(
                  1.5,
                  Math.max(
                      0.2,
                      Math.min(
                          (viewport.width - 360) / room.width,
                          (viewport.height - 300) / room.height,
                      ),
                  ),
              );
        zoom.value = nextZoom;
        pan.value = {
            x: viewport.width / 2 - (room.x + room.width / 2) * nextZoom,
            y: viewport.height / 2 - (room.y + room.height / 2) * nextZoom,
        };
    }
    function selectRoom(id: string | null) {
        store.select(id);
        selectedOpeningId.value = null;
    }
    function capture(event: PointerEvent) {
        stage.value?.focus();
        stage.value?.setPointerCapture(event.pointerId);
    }
    function down(event: PointerEvent) {
        if (!store.hasPlan || (event.button !== 0 && event.button !== 1)) return;
        const p = local(event);
        // 浏览与摆家具两种非编辑态：左键也只是平移（浏览态抬起时若没动过就当作一次点选）。
        if (event.button === 1 || space.value || mode.value !== 'edit' || tool.value === 'hand') {
            event.preventDefault();
            drag.value = {
                kind: 'pan',
                pointer: event.pointerId,
                start: { x: event.clientX, y: event.clientY },
                x: pan.value.x,
                y: pan.value.y,
                // 摆家具时点房间也要能选中（决定新家具放进哪一间），所以两档都 pick。
                pick: mode.value !== 'edit' && event.button === 0 && !space.value,
                moved: false,
            };
            capture(event);
            return;
        }
        if (store.busy) return;
        message.value = '';
        if (OPENING_TOOLS.includes(tool.value)) {
            hover.value = p;
            const target = placement.value;
            if (!target || target.blocked) {
                message.value = target
                    ? '飘窗只能开在外墙上，凸出的窗台不能伸进隔壁房间'
                    : '请在有足够空间的墙面上放置门窗';
                return;
            }
            store.select(target.room.id);
            void store.addOpening(
                target.room.id,
                target.opening.kind,
                target.opening.wall,
                target.opening.pos,
                target.opening.width,
            );
            return;
        }
        if (tool.value === 'room') {
            const start = snapped(p);
            drag.value = { kind: 'draw', pointer: event.pointerId, start };
            drawRect.value = { ...start, width: 0, height: 0 };
            capture(event);
            return;
        }
        const target = event.target instanceof Element ? event.target : null;
        const id = target?.closest('[data-room]')?.getAttribute('data-room');
        const room = store.rooms.find((r) => r.id === id);
        if (!room) {
            selectRoom(null);
            return;
        }
        store.select(room.id);
        const openingId = target?.closest('[data-opening]')?.getAttribute('data-opening');
        const opening = room.openings.find((o) => o.id === openingId);
        selectedOpeningId.value = opening?.id ?? null;
        const dir = target
            ?.closest('[data-handle]')
            ?.getAttribute('data-handle') as ResizeDir | null;
        drag.value = opening
            ? { kind: 'opening', pointer: event.pointerId, start: p, room, opening }
            : {
                  kind: dir ? 'resize' : 'move',
                  pointer: event.pointerId,
                  start: p,
                  room,
                  ...(dir ? { dir } : {}),
              };
        capture(event);
    }
    function move(event: PointerEvent) {
        const p = local(event);
        hover.value = p;
        const current = drag.value;
        if (!current || current.pointer !== event.pointerId) return;
        if (current.kind === 'pan') {
            const dx = event.clientX - current.start.x;
            const dy = event.clientY - current.start.y;
            if (Math.hypot(dx, dy) > 3) current.moved = true;
            pan.value = { x: current.x + dx, y: current.y + dy };
            return;
        }
        if (current.kind === 'draw') {
            const end = snapped(p);
            drawRect.value = {
                x: Math.min(current.start.x, end.x),
                y: Math.min(current.start.y, end.y),
                width: Math.abs(end.x - current.start.x),
                height: Math.abs(end.y - current.start.y),
            };
            return;
        }
        const dx = p.x - current.start.x,
            dy = p.y - current.start.y;
        if (Math.hypot(dx, dy) * zoom.value < 3 && !draftRoom.value) return;
        if (current.kind === 'opening') {
            const span = wallSpan(current.room, current.opening.wall);
            const position =
                Math.round((current.opening.pos + dx * span.ux + dy * span.uy) / SNAP) * SNAP;
            const pos = clampOpening(
                position,
                current.opening.width,
                span.length,
                wallOpenings(store.rooms, current.room, current.opening.wall, current.opening.id),
            );
            if (pos !== null)
                draftRoom.value = {
                    ...current.room,
                    openings: current.room.openings.map((o) =>
                        o.id === current.opening.id ? { ...o, pos } : o,
                    ),
                };
            return;
        }
        const base = current.room;
        if (current.kind === 'resize' && current.dir) {
            const dir = current.dir;
            const edge = snapped(
                {
                    x: (dir.includes('w') ? base.x : base.x + base.width) + dx,
                    y: (dir.includes('n') ? base.y : base.y + base.height) + dy,
                },
                base.id,
            );
            draftRoom.value = {
                ...base,
                ...resizeRect(
                    base,
                    dir,
                    edge.x - (dir.includes('w') ? base.x : base.x + base.width),
                    edge.y - (dir.includes('n') ? base.y : base.y + base.height),
                    MIN_ROOM_SIZE,
                ),
            };
        } else {
            const raw = { x: base.x + dx, y: base.y + dy };
            const a = snapped(raw, base.id);
            const b = snapped({ x: raw.x + base.width, y: raw.y + base.height }, base.id);
            draftRoom.value = {
                ...base,
                x:
                    Math.abs(a.x - raw.x) <= Math.abs(b.x - base.width - raw.x)
                        ? a.x
                        : b.x - base.width,
                y:
                    Math.abs(a.y - raw.y) <= Math.abs(b.y - base.height - raw.y)
                        ? a.y
                        : b.y - base.height,
            };
        }
    }
    async function up(event: PointerEvent) {
        const current = drag.value;
        if (!current || current.pointer !== event.pointerId) return;
        if (current.kind === 'pan') {
            const clicked =
                current.pick && !current.moved ? roomAt(event.clientX, event.clientY) : undefined;
            cancel();
            if (current.pick && !current.moved) selectRoom(clicked ?? null);
            return;
        }
        const rect = drawRect.value,
            draft = draftRoom.value,
            isInvalid = invalid.value;
        cancel();
        if (isInvalid) {
            message.value = '房间不能重叠，门窗也不能超出墙面；本次修改已取消';
            return;
        }
        if (current.kind === 'draw' && rect) {
            if (rect.width < MIN_ROOM_SIZE || rect.height < MIN_ROOM_SIZE) {
                message.value = '房间的宽和深至少为 1000 mm';
                return;
            }
            if (await store.addRoom(rect)) tool.value = 'select';
        } else if (draft && current.kind === 'opening') {
            const opening = draft.openings.find((o) => o.id === current.opening.id);
            if (opening) await store.updateOpening(opening.id, { pos: opening.pos });
        } else if (draft) await store.resizeRoom(draft.id, draft);
    }
    function cancel() {
        const pointer = drag.value?.pointer;
        drag.value = null;
        draftRoom.value = null;
        drawRect.value = null;
        if (pointer !== undefined && stage.value?.hasPointerCapture(pointer))
            stage.value.releasePointerCapture(pointer);
    }
    function setZoom(
        value: number,
        center = { x: size.value.width / 2, y: size.value.height / 2 },
    ) {
        const next = Math.min(4, Math.max(0.2, value));
        pan.value = {
            x: center.x - ((center.x - pan.value.x) * next) / zoom.value,
            y: center.y - ((center.y - pan.value.y) * next) / zoom.value,
        };
        zoom.value = next;
    }
    function wheel(event: WheelEvent) {
        const rect = stage.value?.getBoundingClientRect();
        setZoom(zoom.value * Math.exp(-event.deltaY * 0.0015), {
            x: event.clientX - (rect?.left ?? 0),
            y: event.clientY - (rect?.top ?? 0),
        });
    }
    function fit() {
        const viewport = stage.value?.getBoundingClientRect();
        if (viewport?.width && viewport.height) {
            size.value = { width: viewport.width, height: viewport.height };
        }
        const bounds = boundsOf(store.rooms);
        if (!bounds) {
            zoom.value = 1;
            pan.value = { x: 130, y: 130 };
            return;
        }
        zoom.value = Math.min(
            1.5,
            Math.max(
                0.2,
                Math.min(
                    (size.value.width - 180) / bounds.width,
                    (size.value.height - 180) / bounds.height,
                ),
            ),
        );
        pan.value = {
            x: (size.value.width - bounds.width * zoom.value) / 2 - bounds.x * zoom.value + 15,
            y: (size.value.height - bounds.height * zoom.value) / 2 - bounds.y * zoom.value + 15,
        };
    }
    async function removeSelection() {
        if (mode.value !== 'edit') return;
        if (selectedOpening.value) await store.removeOpening(selectedOpening.value.id);
        else if (selectedRoom.value) await store.removeRoom(selectedRoom.value.id);
        selectedOpeningId.value = null;
    }
    async function setDimension(axis: 'width' | 'height', mm: number) {
        const room = store.selectedRoom;
        if (!room || !Number.isFinite(mm) || mm < 1000 || mm > 100000) {
            message.value = '请输入 1000–100000 mm 的有效尺寸';
            return false;
        }
        const rect = { ...room, [axis]: (mm * 60) / 1000 };
        if (overlapsRoom(rect, store.rooms, room.id) || !openingFits(room, rect)) {
            message.value = '该尺寸会与其他房间重叠或使门窗超出墙面';
            return false;
        }
        message.value = '';
        return store.resizeRoom(room.id, rect);
    }
    function keydown(event: KeyboardEvent) {
        if (
            event.target instanceof Element &&
            event.target.closest(
                'input, select, textarea, button, [contenteditable], [role="dialog"]',
            )
        )
            return;
        if (!store.hasPlan) return;
        const key = event.key.toLowerCase();
        if (event.code === 'Space') {
            event.preventDefault();
            space.value = true;
        }
        if (key === '0') fit();
        // E 只在「浏览 / 修改」之间来回；摆家具是另一档，别让一个按键把
        // 房间几何的工具有重新放出来。
        if (key === 'e' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (mode.value === 'furniture') return;
            setMode(mode.value === 'edit' ? 'browse' : 'edit');
            return;
        }
        if (mode.value !== 'edit') {
            // 浏览模式：除了平移、缩放和 Esc 清空选中，其余快捷键一律不生效。
            if (key === 'escape') {
                cancel();
                selectRoom(null);
            }
            return;
        }
        if (event.ctrlKey || event.metaKey) {
            if (key === 'z' || key === 'y') {
                event.preventDefault();
                cancel();
                if (key === 'y' || event.shiftKey) void store.redo();
                else void store.undo();
            }
            return;
        }
        if (key === 'escape') {
            cancel();
            tool.value = 'select';
            selectRoom(null);
        }
        if (key === 'delete' || key === 'backspace') {
            event.preventDefault();
            void removeSelection();
        }
        const shortcuts: Record<string, PlanTool> = {
            v: 'select',
            r: 'room',
            d: 'door',
            w: 'window',
            b: 'bay',
            h: 'hand',
        };
        if (shortcuts[key]) chooseTool(shortcuts[key]);
        if (key === '0') fit();
    }
    function keyup(event: KeyboardEvent) {
        if (event.code === 'Space') space.value = false;
    }
    function blur() {
        space.value = false;
        cancel();
    }
    let observer: ResizeObserver | undefined;
    onMounted(async () => {
        observer = new ResizeObserver(([entry]) => {
            if (entry)
                size.value = { width: entry.contentRect.width, height: entry.contentRect.height };
        });
        if (stage.value) observer.observe(stage.value);
        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);
        window.addEventListener('blur', blur);
        await store.load();
        await nextTick();
        fit();
    });
    onUnmounted(() => {
        observer?.disconnect();
        window.removeEventListener('keydown', keydown);
        window.removeEventListener('keyup', keyup);
        window.removeEventListener('blur', blur);
    });
    return {
        store,
        stage,
        tool,
        mode,
        hoveredRoomId,
        zoom,
        pan,
        size,
        rooms,
        selectedRoom,
        selectedOpening,
        selectedOpeningId,
        drawRect,
        draftRoom,
        invalid,
        hover,
        placement,
        space,
        drag,
        message,
        chooseTool,
        setMode,
        focusRoom,
        selectRoom,
        down,
        move,
        up,
        cancel,
        setZoom,
        wheel,
        fit,
        removeSelection,
        setDimension,
    };
}
