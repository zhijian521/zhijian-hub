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
    StorageDevice,
    StorageKind,
    StoredItem,
    WallSide,
} from '@/app/types';

export const PX_PER_METER = 60;
export const GRID_SIZE = 6;
export const MIN_ROOM_SIZE = 60;
export const DOOR_WIDTH = 54;
export const WINDOW_WIDTH = 90;
/** 飘窗默认洞口宽 120px = 2m：飘窗比普通窗窄了就不像飘窗了。 */
export const BAY_WIDTH = 120;
export function toMeters(px: number): number {
    return Math.round(px / 6) / 10;
}
export function roomArea(room: Pick<Room, 'width' | 'height'>): number {
    return Math.round((room.width * room.height) / 360) / 10;
}
const cloneRooms = (rooms: Room[]): Room[] => JSON.parse(JSON.stringify(rooms));
/** 撤销栈要连储物设备与物品一起存，否则撤销一次房间改动会把期间新增的东西抹掉。 */
const cloneStorage = (storage: StorageDevice[]): StorageDevice[] =>
    JSON.parse(JSON.stringify(storage));
const cloneItems = (items: StoredItem[]): StoredItem[] => JSON.parse(JSON.stringify(items));

/** 一次撤销快照：三张表一起，缺一张就不是同一个时刻的画面。 */
interface Snapshot {
    rooms: Room[];
    storage: StorageDevice[];
    items: StoredItem[];
}

export const useFloorPlanStore = defineStore('floor-plan', () => {
    const plan = ref<FloorPlan | null>(null);
    const rooms = ref<Room[]>([]);
    const status = ref<'loading' | 'ready' | 'failed'>('loading');
    const busy = ref(false);
    const errorMessage = ref('');
    const selectedId = ref<string | null>(null);
    const storage = ref<StorageDevice[]>([]);
    const items = ref<StoredItem[]>([]);
    const past = ref<Snapshot[]>([]);
    const future = ref<Snapshot[]>([]);
    const hasPlan = computed(() => plan.value !== null);
    const selectedRoom = computed(() => rooms.value.find((r) => r.id === selectedId.value) ?? null);
    const canUndo = computed(() => past.value.length > 0 && !busy.value);
    const canRedo = computed(() => future.value.length > 0 && !busy.value);

    function apply(state: FloorPlanState) {
        plan.value = state.plan;
        rooms.value = state.rooms;
        // 旧数据库升上来、或只关心房间的调用方，可能没带这两张表；
        // 这里统一成空数组，撤销栈与列表渲染就不用各自防一手。
        storage.value = state.storage ?? [];
        items.value = state.items ?? [];
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
        const before: Snapshot = {
            rooms: cloneRooms(rooms.value),
            storage: cloneStorage(storage.value),
            items: cloneItems(items.value),
        };
        try {
            // Vue's reactive room/opening proxies cannot cross contextBridge's structured clone.
            const payload: FloorPlanCommand = JSON.parse(JSON.stringify(command));
            const result = await window.zhijian.mutateFloorPlan(payload);
            if (!result.ok) {
                errorMessage.value = result.message;
                return false;
            }
            const changed =
                JSON.stringify(before.rooms) !== JSON.stringify(result.state.rooms) ||
                JSON.stringify(before.storage) !== JSON.stringify(result.state.storage) ||
                JSON.stringify(before.items) !== JSON.stringify(result.state.items);
            if (history && command.type !== 'create-plan' && changed) {
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
        const current: Snapshot = {
            rooms: cloneRooms(rooms.value),
            storage: cloneStorage(storage.value),
            items: cloneItems(items.value),
        };
        const command: FloorPlanCommand = {
            type: 'replace-rooms',
            rooms: cloneRooms(snapshot.rooms),
            storage: cloneStorage(snapshot.storage),
            items: cloneItems(snapshot.items),
        };
        if (await run(command, false)) {
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
        replaceRooms: (value: Room[]) =>
            run({
                type: 'replace-rooms',
                rooms: cloneRooms(value),
                storage: cloneStorage(storage.value),
                items: cloneItems(items.value),
            }),
        createPlan: (name: string) => run({ type: 'create-plan', name }),
        renameRoom: (id: string, name: string) => run({ type: 'rename-room', id, name }),
        moveRoom: (id: string, x: number, y: number) => run({ type: 'move-room', id, x, y }),
        resizeRoom: (id: string, rect: Rect) => run({ type: 'resize-room', id, rect }),
        removeRoom: (id: string) => run({ type: 'remove-room', id }),
        setRoomFloor: (id: string, floor: FloorMaterial | null) =>
            run({ type: 'set-room-floor', id, floor }),
        setRoomOutdoor: (id: string, outdoor: boolean) =>
            run({ type: 'set-room-outdoor', id, outdoor }),
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

        /*== 储物设备与物品 ==*/
        storage,
        items,
        addStorage: (roomId: string, name: string, kind: StorageKind) =>
            run({ type: 'add-storage', roomId, name, kind }),
        renameStorage: (id: string, name: string) => run({ type: 'rename-storage', id, name }),
        removeStorage: (id: string) => run({ type: 'remove-storage', id }),
        addItem: (input: {
            roomId: string;
            storageId?: string | null;
            name: string;
            category: string;
            quantity?: number;
            note?: string;
        }) => run({ type: 'add-item', ...input }),
        updateItem: (
            id: string,
            patch: {
                name?: string;
                category?: string;
                quantity?: number;
                note?: string;
                storageId?: string | null;
            },
        ) => run({ type: 'update-item', id, ...patch }),
        removeItem: (id: string) => run({ type: 'remove-item', id }),

        /**
         * 一次性导入整套储物与物品（示例户型用）。
         * 走 replace-rooms 这条已有的原子路径：房间原样带回，只换家具与物品。
         */
        importFurnishing: (nextStorage: StorageDevice[], nextItems: StoredItem[]) =>
            run({
                type: 'replace-rooms',
                rooms: cloneRooms(rooms.value),
                storage: cloneStorage(nextStorage),
                items: cloneItems(nextItems),
            }),
    };
});
