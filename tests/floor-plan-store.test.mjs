import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { openDatabase } = require('../src/main/database.cjs');
const { applyCommand, loadState, MIN_ROOM_SIZE } = require('../src/main/floor-plan-store.cjs');

/*============================================================================
  floor-plan-store — 户型图与房间的规则测试

  守住三件事：没建图不能加房间、房间序号只增不减、非法输入一律拒绝。
  用内存库跑真实 SQL，不 mock。
============================================================================*/

function createStore() {
    const db = openDatabase(':memory:');
    return { db, run: (command) => applyCommand(db, command), read: () => loadState(db) };
}

describe('atomic drawing restore', () => {
    it('restores room geometry, materials and openings together', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '家' });
        const initial = run({ type: 'add-room', rect: { x: 0, y: 0, width: 240, height: 180 } });
        const id = initial.rooms[0].id;
        const before = run({
            type: 'add-opening',
            roomId: id,
            kind: 'door',
            wall: 'top',
            pos: 120,
            width: 54,
        });
        run({ type: 'remove-room', id });
        assert.deepEqual(run({ type: 'replace-rooms', rooms: before.rooms }).rooms, before.rooms);
        db.close();
    });
    it('rolls back a malformed restore without losing the existing drawing', () => {
        const { db, run, read } = createStore();
        run({ type: 'create-plan', name: '家' });
        const before = run({ type: 'add-room', rect: { x: 0, y: 0, width: 240, height: 180 } });
        const invalid = [
            {
                ...before.rooms[0],
                name: 'changed',
                openings: [
                    { id: 'bad', kind: 'door', wall: 'top', pos: 200, width: 54, hinge: 'start' },
                ],
            },
        ];
        assert.throws(() => run({ type: 'replace-rooms', rooms: invalid }), /门窗/);
        assert.deepEqual(read(), before);
        db.close();
    });
    it('rejects shared-wall collisions from either room and rolls back', () => {
        const { db, run, read } = createStore();
        run({ type: 'create-plan', name: '家' });
        const a = run({ type: 'add-room', rect: { x: 0, y: 0, width: 240, height: 180 } }).rooms[0];
        const b = run({ type: 'add-room', rect: { x: 240, y: 0, width: 240, height: 180 } })
            .rooms[1];
        const before = run({
            type: 'add-opening',
            roomId: a.id,
            kind: 'door',
            wall: 'right',
            pos: 48,
            width: 54,
        });
        assert.throws(
            () =>
                run({
                    type: 'add-opening',
                    roomId: b.id,
                    kind: 'window',
                    wall: 'left',
                    pos: 72,
                    width: 54,
                }),
            /共享墙/,
        );
        assert.deepEqual(read(), before);
        db.close();
    });
    it('rejects shrinking through an existing opening', () => {
        const { db, run, read } = createStore();
        run({ type: 'create-plan', name: '家' });
        const a = run({ type: 'add-room', rect: { x: 0, y: 0, width: 240, height: 180 } }).rooms[0];
        const before = run({
            type: 'add-opening',
            roomId: a.id,
            kind: 'door',
            wall: 'top',
            pos: 180,
            width: 54,
        });
        assert.throws(
            () => run({ type: 'resize-room', id: a.id, rect: { ...a, width: 120 } }),
            /超出墙面/,
        );
        assert.deepEqual(read(), before);
        db.close();
    });
});

describe('floor-plan-store', () => {
    it('新库没有户型图', () => {
        const { db, read } = createStore();
        const state = read();

        assert.equal(state.plan, null);
        assert.deepEqual(state.rooms, []);
        db.close();
    });

    it('创建户型图后可以读回名称与序号', () => {
        const { db, run } = createStore();
        const state = run({ type: 'create-plan', name: '  我的家  ' });

        assert.equal(state.plan.name, '我的家');
        assert.equal(state.plan.roomSeq, 0);
        db.close();
    });

    it('拒绝重复创建户型图', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '我的家' });

        assert.throws(() => run({ type: 'create-plan', name: '另一套' }), /已存在/);
        db.close();
    });

    it('拒绝空名称', () => {
        const { db, run } = createStore();

        assert.throws(() => run({ type: 'create-plan', name: '   ' }), /不能为空/);
        db.close();
    });

    it('没建户型图不能加房间', () => {
        const { db, run } = createStore();

        assert.throws(
            () => run({ type: 'add-room', rect: { x: 0, y: 0, width: 120, height: 80 } }),
            /尚未创建户型图/,
        );
        db.close();
    });

    it('房间按序号命名，尺寸小于一格时拒绝', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '我的家' });

        const first = run({ type: 'add-room', rect: { x: 20, y: 20, width: 120, height: 80 } });
        const second = run({ type: 'add-room', rect: { x: 200, y: 20, width: 100, height: 80 } });

        assert.deepEqual(
            second.rooms.map((room) => room.name),
            ['房间 1', '房间 2'],
        );
        assert.equal(first.rooms.length, 1);

        assert.throws(
            () =>
                run({
                    type: 'add-room',
                    rect: { x: 0, y: 0, width: MIN_ROOM_SIZE - 1, height: 80 },
                }),
            /不能小于/,
        );
        db.close();
    });

    it('删除房间后序号不回收', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '我的家' });
        const created = run({ type: 'add-room', rect: { x: 0, y: 0, width: 100, height: 100 } });
        run({ type: 'remove-room', id: created.rooms[0].id });

        const next = run({ type: 'add-room', rect: { x: 0, y: 0, width: 100, height: 100 } });

        assert.equal(next.rooms.length, 1);
        assert.equal(next.rooms[0].name, '房间 2');
        db.close();
    });

    it('重命名与移动房间', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '我的家' });
        const created = run({ type: 'add-room', rect: { x: 0, y: 0, width: 100, height: 100 } });
        const id = created.rooms[0].id;

        run({ type: 'rename-room', id, name: '客厅' });
        const moved = run({ type: 'move-room', id, x: 60, y: 40 });

        assert.equal(moved.rooms[0].name, '客厅');
        assert.equal(moved.rooms[0].x, 60);
        assert.equal(moved.rooms[0].y, 40);
        assert.equal(moved.rooms[0].width, 100, '移动不应改变尺寸');
        db.close();
    });

    it('操作不存在的房间会报错', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '我的家' });

        assert.throws(() => run({ type: 'remove-room', id: 'room-missing' }), /房间不存在/);
        assert.throws(
            () => run({ type: 'rename-room', id: 'room-missing', name: '客厅' }),
            /房间不存在/,
        );
        db.close();
    });

    it('清空房间后仍保留户型图与序号', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '我的家' });
        run({ type: 'add-room', rect: { x: 0, y: 0, width: 100, height: 100 } });

        const cleared = run({ type: 'clear-rooms' });

        assert.deepEqual(cleared.rooms, []);
        assert.equal(cleared.plan.name, '我的家');
        assert.equal(cleared.plan.roomSeq, 1);
        db.close();
    });

    it('拒绝未知命令与非法坐标', () => {
        const { db, run } = createStore();
        run({ type: 'create-plan', name: '我的家' });
        const created = run({ type: 'add-room', rect: { x: 0, y: 0, width: 100, height: 100 } });

        assert.throws(() => run({ type: 'unknown' }), /未知命令/);
        assert.throws(
            () => run({ type: 'move-room', id: created.rooms[0].id, x: Number.NaN, y: 0 }),
            /坐标无效/,
        );
        db.close();
    });
});

describe('floor-plan-store · 门窗与缩放', () => {
    function setup() {
        const db = openDatabase(':memory:');
        const run = (command) => applyCommand(db, command);
        run({ type: 'create-plan', name: '我的家' });
        const state = run({ type: 'add-room', rect: { x: 0, y: 0, width: 300, height: 200 } });
        return { db, run, room: state.rooms[0] };
    }

    it('新房间自带空的洞口列表', () => {
        const { db, room } = setup();
        assert.deepEqual(room.openings, []);
        db.close();
    });

    it('加门后洞口挂在房间下，位置与宽度原样保留', () => {
        const { db, run, room } = setup();
        const state = run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'door',
            wall: 'top',
            pos: 100,
            width: 54,
        });

        assert.equal(state.rooms[0].openings.length, 1);
        const door = state.rooms[0].openings[0];
        assert.equal(door.kind, 'door');
        assert.equal(door.wall, 'top');
        assert.equal(door.pos, 100);
        assert.equal(door.width, 54);
        assert.equal(door.hinge, 'start');
        db.close();
    });

    it('洞口超出墙面长度时拒绝', () => {
        const { db, run, room } = setup();

        assert.throws(
            () =>
                run({
                    type: 'add-opening',
                    roomId: room.id,
                    kind: 'window',
                    wall: 'top',
                    pos: 280,
                    width: 90,
                }),
            /超出墙面/,
        );
        db.close();
    });

    it('同一面墙上不允许洞口重叠，不同墙可以共存', () => {
        const { db, run, room } = setup();
        run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'door',
            wall: 'top',
            pos: 100,
            width: 54,
        });

        assert.throws(
            () =>
                run({
                    type: 'add-opening',
                    roomId: room.id,
                    kind: 'window',
                    wall: 'top',
                    pos: 120,
                    width: 90,
                }),
            /不能重叠/,
        );

        const state = run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'window',
            wall: 'left',
            pos: 60,
            width: 54,
        });
        assert.equal(state.rooms[0].openings.length, 2);
        db.close();
    });

    it('拒绝非法墙面方向与类型', () => {
        const { db, run, room } = setup();

        assert.throws(
            () =>
                run({
                    type: 'add-opening',
                    roomId: room.id,
                    kind: 'door',
                    wall: 'middle',
                    pos: 0,
                    width: 54,
                }),
            /墙面方向无效/,
        );
        assert.throws(
            () =>
                run({
                    type: 'add-opening',
                    roomId: room.id,
                    kind: 'hatch',
                    wall: 'top',
                    pos: 0,
                    width: 54,
                }),
            /洞口类型无效/,
        );
        db.close();
    });

    it('删除洞口', () => {
        const { db, run, room } = setup();
        const withDoor = run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'door',
            wall: 'top',
            pos: 100,
            width: 54,
        });
        const id = withDoor.rooms[0].openings[0].id;

        assert.deepEqual(run({ type: 'remove-opening', id }).rooms[0].openings, []);
        assert.throws(() => run({ type: 'remove-opening', id }), /门窗不存在/);
        db.close();
    });

    it('删除房间时洞口级联删除', () => {
        const { db, run, room } = setup();
        run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'door',
            wall: 'top',
            pos: 100,
            width: 54,
        });
        run({ type: 'remove-room', id: room.id });

        const remaining = db.prepare('SELECT COUNT(*) AS count FROM openings').get();
        assert.equal(remaining.count, 0, '房间没了，洞口不能留成孤儿');
        db.close();
    });

    it('缩放房间写入完整矩形', () => {
        const { db, run, room } = setup();
        const state = run({
            type: 'resize-room',
            id: room.id,
            rect: { x: 20, y: 40, width: 180, height: 160 },
        });

        assert.deepEqual(
            [state.rooms[0].x, state.rooms[0].y, state.rooms[0].width, state.rooms[0].height],
            [20, 40, 180, 160],
        );
        db.close();
    });

    it('缩放到小于最小边长时拒绝', () => {
        const { db, run, room } = setup();

        assert.throws(
            () =>
                run({
                    type: 'resize-room',
                    id: room.id,
                    rect: { x: 0, y: 0, width: MIN_ROOM_SIZE - 1, height: 200 },
                }),
            /不能小于/,
        );
        db.close();
    });
});

describe('floor-plan-store · 飘窗', () => {
    function setup() {
        const db = openDatabase(':memory:');
        const run = (command) => applyCommand(db, command);
        run({ type: 'create-plan', name: '我的家' });
        const state = run({ type: 'add-room', rect: { x: 0, y: 0, width: 300, height: 200 } });
        return { db, run, room: state.rooms[0] };
    }

    it("kind='bay' 能写进库并原样读回（版本 2 的 CHECK 曾把它拦下）", () => {
        const { db, run, room } = setup();
        const state = run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'bay',
            wall: 'top',
            pos: 90,
            width: 120,
        });

        assert.equal(state.rooms[0].openings.length, 1);
        assert.equal(state.rooms[0].openings[0].kind, 'bay');
        const stored = db.prepare('SELECT kind FROM openings WHERE room_id = ?').get(room.id);
        assert.equal(stored.kind, 'bay');
        db.close();
    });

    it('恢复图纸时飘窗不丢', () => {
        const { db, run, room } = setup();
        run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'bay',
            wall: 'top',
            pos: 90,
            width: 120,
        });
        const before = run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'window',
            wall: 'bottom',
            pos: 40,
            width: 90,
        });
        const after = run({ type: 'replace-rooms', rooms: before.rooms });
        assert.deepEqual(
            after.rooms[0].openings.map((opening) => opening.kind),
            ['bay', 'window'],
        );
        db.close();
    });

    it('未知洞口类型仍然拒绝', () => {
        const { db, run, room } = setup();
        assert.throws(
            () =>
                run({
                    type: 'add-opening',
                    roomId: room.id,
                    kind: 'porthole',
                    wall: 'top',
                    pos: 10,
                    width: 40,
                }),
            /洞口类型无效/,
        );
        db.close();
    });
});

describe('floor-plan-store · 储物设备与物品', () => {
    /** 建一套最小户型：一间房 + 一个柜子。 */
    function seed() {
        const store = createStore();
        store.run({ type: 'create-plan', name: '家' });
        const room = store.run({ type: 'add-room', rect: { x: 0, y: 0, width: 240, height: 180 } })
            .rooms[0];
        const withStorage = store.run({
            type: 'add-storage',
            roomId: room.id,
            name: '衣柜',
            kind: 'cabinet',
        });
        return { ...store, room, storage: withStorage.storage[0] };
    }

    it('新增储物设备后能读回，类型非法则拒绝', () => {
        const { db, run, read, room } = seed();
        const state = read();
        assert.equal(state.storage.length, 1);
        assert.equal(state.storage[0].roomId, room.id);
        assert.equal(state.storage[0].kind, 'cabinet');
        assert.throws(
            () => run({ type: 'add-storage', roomId: room.id, name: '奇怪的东西', kind: 'vault' }),
            /类型无效/,
        );
        db.close();
    });

    it('登记物品默认数量为 1，数量必须是正整数', () => {
        const { db, run, room, storage } = seed();
        const state = run({
            type: 'add-item',
            roomId: room.id,
            storageId: storage.id,
            name: '被子',
            category: '衣物',
        });
        assert.equal(state.items[0].quantity, 1);
        assert.equal(state.items[0].storageId, storage.id);
        for (const quantity of [0, -2, 1.5, '3']) {
            assert.throws(
                () =>
                    run({
                        type: 'add-item',
                        roomId: room.id,
                        name: '坏数量',
                        category: '杂物',
                        quantity,
                    }),
                /数量/,
            );
        }
        db.close();
    });

    it('拒绝把物品放进别的房间的柜子', () => {
        const { db, run, room, storage } = seed();
        const other = run({ type: 'add-room', rect: { x: 400, y: 0, width: 240, height: 180 } })
            .rooms[1];
        assert.throws(
            () =>
                run({
                    type: 'add-item',
                    roomId: other.id,
                    storageId: storage.id,
                    name: '毛衣',
                    category: '衣物',
                }),
            /不在所选房间/,
        );
        assert.equal(
            run({ type: 'add-item', roomId: room.id, name: '钥匙', category: '杂物' }).items.length,
            1,
        );
        db.close();
    });

    it('删掉柜子后物品留在原房间，只是不再挂在柜子上', () => {
        const { db, run, room, storage } = seed();
        run({
            type: 'add-item',
            roomId: room.id,
            storageId: storage.id,
            name: '被子',
            category: '衣物',
        });
        const state = run({ type: 'remove-storage', id: storage.id });
        assert.equal(state.storage.length, 0);
        assert.equal(state.items.length, 1);
        assert.equal(state.items[0].storageId, null);
        assert.equal(state.items[0].roomId, room.id);
        db.close();
    });

    it('删房间会连带删掉里面的柜子与物品', () => {
        const { db, run, room, storage } = seed();
        run({
            type: 'add-item',
            roomId: room.id,
            storageId: storage.id,
            name: '被子',
            category: '衣物',
        });
        const state = run({ type: 'remove-room', id: room.id });
        assert.deepEqual(state.storage, []);
        assert.deepEqual(state.items, []);
        db.close();
    });

    it('replace-rooms 能一次恢复三张表，坏数据整体回滚', () => {
        const { db, run, read, room, storage } = seed();
        const before = run({
            type: 'add-item',
            roomId: room.id,
            storageId: storage.id,
            name: '被子',
            category: '衣物',
        });
        const snapshot = { rooms: before.rooms, storage: before.storage, items: before.items };

        run({ type: 'remove-item', id: before.items[0].id });
        run({ type: 'remove-storage', id: storage.id });
        const restored = run({ type: 'replace-rooms', ...snapshot });
        assert.equal(restored.items.length, 1);
        assert.equal(restored.items[0].storageId, storage.id);

        assert.throws(
            () =>
                run({
                    type: 'replace-rooms',
                    rooms: snapshot.rooms,
                    storage: [{ ...snapshot.storage[0], kind: 'vault' }],
                    items: snapshot.items,
                }),
            /类型无效/,
        );
        assert.deepEqual(read(), restored);
        db.close();
    });
});

describe('floor-plan-store · 门窗编辑与地面材质', () => {
    function setup() {
        const db = openDatabase(':memory:');
        const run = (command) => applyCommand(db, command);
        run({ type: 'create-plan', name: '我的家' });
        const state = run({ type: 'add-room', rect: { x: 0, y: 0, width: 300, height: 200 } });
        return { db, run, room: state.rooms[0] };
    }

    function withDoor(run, roomId) {
        const state = run({
            type: 'add-opening',
            roomId,
            kind: 'door',
            wall: 'top',
            pos: 60,
            width: 54,
        });
        return state.rooms[0].openings[0];
    }

    it('新房间默认是室内，不是阳台', () => {
        const { db, room } = setup();
        assert.equal(room.outdoor, false);
        db.close();
    });

    it('标记与取消阳台', () => {
        const { db, run, room } = setup();

        assert.equal(
            run({ type: 'set-room-outdoor', id: room.id, outdoor: true }).rooms[0].outdoor,
            true,
        );
        assert.equal(
            run({ type: 'set-room-outdoor', id: room.id, outdoor: false }).rooms[0].outdoor,
            false,
        );
        db.close();
    });

    it('阳台标记只接受布尔值，且房间必须存在', () => {
        const { db, run, room } = setup();

        assert.throws(
            () => run({ type: 'set-room-outdoor', id: room.id, outdoor: 'true' }),
            /布尔值/,
        );
        assert.throws(
            () => run({ type: 'set-room-outdoor', id: 'nope', outdoor: true }),
            /房间不存在/,
        );
        db.close();
    });

    it('恢复图纸时保留阳台标记', () => {
        const { db, run, room } = setup();
        const state = run({ type: 'set-room-outdoor', id: room.id, outdoor: true });

        const restored = run({ type: 'replace-rooms', rooms: state.rooms });
        assert.equal(restored.rooms[0].outdoor, true);
        db.close();
    });

    it('新房间的地面材质是未指定（按名字推断）', () => {
        const { db, room } = setup();
        assert.equal(room.floor, null);
        db.close();
    });

    it('设置与清除地面材质', () => {
        const { db, run, room } = setup();

        assert.equal(
            run({ type: 'set-room-floor', id: room.id, floor: 'wood' }).rooms[0].floor,
            'wood',
        );
        assert.equal(
            run({ type: 'set-room-floor', id: room.id, floor: null }).rooms[0].floor,
            null,
        );
        db.close();
    });

    it('接受只能手动指定的材质（大理石 / 水磨石 / 地毯）', () => {
        const { db, run, room } = setup();

        for (const floor of ['marble', 'terrazzo', 'carpet']) {
            assert.equal(run({ type: 'set-room-floor', id: room.id, floor }).rooms[0].floor, floor);
        }
        db.close();
    });

    it('拒绝非法地面材质', () => {
        const { db, run, room } = setup();

        assert.throws(
            () => run({ type: 'set-room-floor', id: room.id, floor: 'granite' }),
            /地面材质无效/,
        );
        db.close();
    });

    it('修改门窗位置', () => {
        const { db, run, room } = setup();
        const door = withDoor(run, room.id);

        const moved = run({ type: 'update-opening', id: door.id, pos: 120 });
        assert.equal(moved.rooms[0].openings[0].pos, 120);
        assert.equal(moved.rooms[0].openings[0].width, 54, '没传的字段保持不变');
        db.close();
    });

    it('修改门窗宽度与开启方向', () => {
        const { db, run, room } = setup();
        const door = withDoor(run, room.id);

        const resized = run({ type: 'update-opening', id: door.id, width: 90 });
        assert.equal(resized.rooms[0].openings[0].width, 90);

        const flipped = run({ type: 'update-opening', id: door.id, hinge: 'end' });
        assert.equal(flipped.rooms[0].openings[0].hinge, 'end');
        db.close();
    });

    it('门窗不能超出墙面', () => {
        const { db, run, room } = setup();
        const door = withDoor(run, room.id);

        assert.throws(() => run({ type: 'update-opening', id: door.id, width: 400 }), /超出墙面/);
        db.close();
    });

    it('门窗宽度不能小于下限', () => {
        const { db, run, room } = setup();
        const door = withDoor(run, room.id);

        assert.throws(() => run({ type: 'update-opening', id: door.id, width: 10 }), /不能小于/);
        db.close();
    });

    it('挪动门窗时与同墙其他洞口重叠会被拒绝', () => {
        const { db, run, room } = setup();
        const door = withDoor(run, room.id);
        run({
            type: 'add-opening',
            roomId: room.id,
            kind: 'window',
            wall: 'top',
            pos: 180,
            width: 60,
        });

        assert.throws(() => run({ type: 'update-opening', id: door.id, pos: 170 }), /重叠/);
        db.close();
    });

    it('修改不存在的门窗会报错', () => {
        const { db, run } = setup();

        assert.throws(
            () => run({ type: 'update-opening', id: 'opening-missing', pos: 10 }),
            /门窗不存在/,
        );
        db.close();
    });
});
