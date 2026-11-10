import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { Opening, Rect, Room } from '@/app/types';
import { hitWall, resizeRect, wallSpan, type Point, type ResizeDir } from '@/lib/plan-geometry';
import {
    boundsOf,
    clampOpening,
    openingFits,
    overlapsRoom,
    snapCoordinate,
    wallOpenings,
    SNAP,
} from '@/lib/plan-scene';
import { DOOR_WIDTH, MIN_ROOM_SIZE, WINDOW_WIDTH, useFloorPlanStore } from '@/stores/floor-plan';

export type PlanTool = 'select' | 'room' | 'door' | 'window' | 'hand';
type Drag =
    | { kind: 'pan'; pointer: number; start: Point; x: number; y: number }
    | { kind: 'draw'; pointer: number; start: Point }
    | { kind: 'move' | 'resize'; pointer: number; start: Point; room: Room; dir?: ResizeDir }
    | { kind: 'opening'; pointer: number; start: Point; room: Room; opening: Opening };

export function usePlanEditor() {
    const store = useFloorPlanStore();
    const stage = ref<SVGSVGElement | null>(null);
    const tool = ref<PlanTool>('select');
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
        if (!hover.value || !['door', 'window'].includes(tool.value)) return null;
        let nearest: { room: Room; wall: Opening['wall']; along: number; distance: number } | null =
            null;
        for (const room of store.rooms) {
            const hit = hitWall(room, hover.value.x, hover.value.y, 16 / zoom.value);
            if (!hit) continue;
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
        const width = tool.value === 'door' ? DOOR_WIDTH : WINDOW_WIDTH;
        const span = wallSpan(nearest.room, nearest.wall);
        const desired = Math.round((nearest.along - width / 2) / SNAP) * SNAP;
        const pos = clampOpening(
            desired,
            width,
            span.length,
            wallOpenings(store.rooms, nearest.room, nearest.wall),
        );
        if (pos === null) return null;
        return {
            room: nearest.room,
            opening: {
                id: 'preview',
                kind: tool.value as 'door' | 'window',
                wall: nearest.wall,
                pos,
                width,
                hinge: 'start' as const,
            },
        };
    });
    function chooseTool(value: PlanTool) {
        cancel();
        tool.value = value;
        message.value = '';
        void nextTick(() => stage.value?.focus({ preventScroll: true }));
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
        if (event.button === 1 || space.value || tool.value === 'hand') {
            event.preventDefault();
            drag.value = {
                kind: 'pan',
                pointer: event.pointerId,
                start: { x: event.clientX, y: event.clientY },
                ...pan.value,
            };
            capture(event);
            return;
        }
        if (store.busy) return;
        message.value = '';
        if (tool.value === 'door' || tool.value === 'window') {
            hover.value = p;
            const target = placement.value;
            if (!target) {
                message.value = '请在有足够空间的墙面上放置门窗';
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
            pan.value = {
                x: current.x + event.clientX - current.start.x,
                y: current.y + event.clientY - current.start.y,
            };
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
