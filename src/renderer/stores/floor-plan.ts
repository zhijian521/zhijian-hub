import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
    FloorMaterial,
    FloorPlan,
    FloorPlanCommand,
    FloorPlanState,
    HingeSide,
    OpeningKind,
    Rect,
    Room,
    WallSide,
} from '@/app/types';

export const PX_PER_METER = 60;
export const GRID_SIZE = 6;
export const MIN_ROOM_SIZE = 60;
export const DOOR_WIDTH = 54;
export const WINDOW_WIDTH = 90;
export function toMeters(px: number): number {
    return Math.round(px / 6) / 10;
}
export function roomArea(room: Pick<Room, 'width' | 'height'>): number {
    return Math.round((room.width * room.height) / 360) / 10;
}
const cloneRooms = (rooms: Room[]): Room[] => JSON.parse(JSON.stringify(rooms));

export const useFloorPlanStore = defineStore('floor-plan', () => {
    const plan = ref<FloorPlan | null>(null);
    const rooms = ref<Room[]>([]);
    const status = ref<'loading' | 'ready' | 'failed'>('loading');
    const busy = ref(false);
    const errorMessage = ref('');
    const selectedId = ref<string | null>(null);
    const past = ref<Room[][]>([]);
    const future = ref<Room[][]>([]);
    const hasPlan = computed(() => plan.value !== null);
    const selectedRoom = computed(() => rooms.value.find((r) => r.id === selectedId.value) ?? null);
    const canUndo = computed(() => past.value.length > 0 && !busy.value);
    const canRedo = computed(() => future.value.length > 0 && !busy.value);

    function apply(state: FloorPlanState) {
        plan.value = state.plan;
        rooms.value = state.rooms;
        if (!state.rooms.some((r) => r.id === selectedId.value)) selectedId.value = null;
    }
    async function load() {
        status.value = 'loading';
        try {
            if (!window.zhijian) throw new Error('请从知简 Hub 桌面应用打开户型编辑器。');
            apply(await window.zhijian.loadFloorPlan());
            errorMessage.value = '';
            status.value = 'ready';
        } catch (error) {
            status.value = 'failed';
            errorMessage.value = error instanceof Error ? error.message : '读取户型图失败';
        }
    }
    async function run(command: FloorPlanCommand, history = true): Promise<boolean> {
        if (busy.value || !window.zhijian) return false;
        busy.value = true;
        const before = cloneRooms(rooms.value);
        try {
            // Vue's reactive room/opening proxies cannot cross contextBridge's structured clone.
            const payload: FloorPlanCommand = JSON.parse(JSON.stringify(command));
            const result = await window.zhijian.mutateFloorPlan(payload);
            if (!result.ok) {
                errorMessage.value = result.message;
                return false;
            }
            if (
                history &&
                command.type !== 'create-plan' &&
                JSON.stringify(before) !== JSON.stringify(result.state.rooms)
            ) {
                past.value = [...past.value.slice(-49), before];
                future.value = [];
            }
            apply(result.state);
            errorMessage.value = '';
            return true;
        } catch (error) {
            errorMessage.value = error instanceof Error ? error.message : '保存失败，请重试';
            return false;
        } finally {
            busy.value = false;
        }
    }
    async function travel(direction: 'undo' | 'redo') {
        const source = direction === 'undo' ? past : future;
        const target = direction === 'undo' ? future : past;
        const snapshot = source.value.at(-1);
        if (!snapshot || busy.value) return;
        const current = cloneRooms(rooms.value);
        if (await run({ type: 'replace-rooms', rooms: cloneRooms(snapshot) }, false)) {
            source.value = source.value.slice(0, -1);
            target.value = [...target.value, current];
        }
    }
    async function addRoom(rect: Rect): Promise<Room | null> {
        const ids = new Set(rooms.value.map((r) => r.id));
        if (!(await run({ type: 'add-room', rect }))) return null;
        const created = rooms.value.find((r) => !ids.has(r.id)) ?? null;
        if (created) selectedId.value = created.id;
        return created;
    }
    return {
        plan,
        rooms,
        status,
        busy,
        errorMessage,
        selectedId,
        hasPlan,
        selectedRoom,
        canUndo,
        canRedo,
        load,
        run,
        addRoom,
        select: (id: string | null) => {
            selectedId.value = id;
        },
        undo: () => travel('undo'),
        redo: () => travel('redo'),
        replaceRooms: (value: Room[]) => run({ type: 'replace-rooms', rooms: cloneRooms(value) }),
        createPlan: (name: string) => run({ type: 'create-plan', name }),
        renameRoom: (id: string, name: string) => run({ type: 'rename-room', id, name }),
        moveRoom: (id: string, x: number, y: number) => run({ type: 'move-room', id, x, y }),
        resizeRoom: (id: string, rect: Rect) => run({ type: 'resize-room', id, rect }),
        removeRoom: (id: string) => run({ type: 'remove-room', id }),
        setRoomFloor: (id: string, floor: FloorMaterial | null) =>
            run({ type: 'set-room-floor', id, floor }),
        addOpening: (
            roomId: string,
            kind: OpeningKind,
            wall: WallSide,
            pos: number,
            width: number,
        ) => run({ type: 'add-opening', roomId, kind, wall, pos, width }),
        updateOpening: (id: string, patch: { pos?: number; width?: number; hinge?: HingeSide }) =>
            run({ type: 'update-opening', id, ...patch }),
        removeOpening: (id: string) => run({ type: 'remove-opening', id }),
    };
});
