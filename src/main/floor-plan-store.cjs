/*============================================================================
  floor-plan-store — 户型图与房间的读写

  单套户型：`floor_plan` 只有一行（id = 'singleton'），房间挂在它下面。
  所有写操作都返回完整状态（户型图 + 房间列表），渲染层不需要自己拼增量；
  这个规模下一次全量读取的成本可以忽略，换来的是两端不会出现状态漂移。
============================================================================*/

/** 房间最小边长：60px 即 1 米（60px = 1m），比这更小的空间放不下任何家具。
 * 同时保证扣掉两侧墙体后，房间内部仍有可见地面。
 */
const MIN_ROOM_SIZE = 60;

/** 名称长度上限，防止用户粘贴整段文本把标题栏和列表撑坏。 */
const MAX_NAME_LENGTH = 40;

/** 墙面方向：top/bottom 沿 x 轴（长度取 width），left/right 沿 y 轴（取 height）。 */
const WALLS = new Set(['top', 'right', 'bottom', 'left']);

/** 墙的固定书写顺序，写库与比较都用同一份，避免『top,left』和『left,top』被判成不同值。 */
const WALL_ORDER = ['top', 'right', 'bottom', 'left'];

/** 洞口类型：平开门、标准窗、飘窗（外凸一块带三面玻璃的平台）。 */
const KINDS = new Set(['door', 'window', 'bay']);

/** 门扇开向：朝房间内 / 朝房间外。窗与飘窗一律存 'in'。 */
const SWINGS = new Set(['in', 'out']);

/** 飘窗默认外凸进深 26px ≈ 430 mm，住宅飘窗的常见出挑量。 */
const DEFAULT_BAY_DEPTH = 26;

/** 进深可以调，但要有上下限：200 mm 以下画不出三线窗，1000 mm 以上会吃掉邻室地面。 */
const MIN_OPENING_DEPTH = 12; // 200 mm
const MAX_OPENING_DEPTH = 60; // 1000 mm

/**
 * 归一化洞口进深。undefined 表示「没提这一项」，用默认值；
 * 给了就必须是落在上下限内的有限数，不然画出来的飘窗没法看。
 * @param {unknown} value
 * @param {string} label
 */
function normalizeDepth(value, label) {
    if (value === undefined || value === null) return DEFAULT_BAY_DEPTH;
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}进深必须是数字`);
    if (value < MIN_OPENING_DEPTH || value > MAX_OPENING_DEPTH) {
        fail(`${label}进深必须在 ${MIN_OPENING_DEPTH}–${MAX_OPENING_DEPTH} 像素之间`);
    }
    return value;
}

/** 地面材质。NULL 表示按房间名自动推断。
 * 只有 wood / tile / small 能按房间名推断，其余都只能手动指定。
 * 新增材质必须同时改 src/renderer/app/types.ts 的 FloorMaterial
 * 与 plan-drawing.vue 里对应的 pattern。 */
const FLOORS = new Set([
    'wood',
    'walnut',
    'diagonal',
    'tile',
    'subway',
    'small',
    'marble',
    'terrazzo',
    'microcement',
    'carpet',
]);

/** 家具的四种形态。只影响图标与画布排布，不影响归属关系。
 * 家具与储物是一件事：柜子、床、冰箱都是"房间里放东西的地方"。 */
const STORAGE_KINDS = new Set(['cabinet', 'shelf', 'box', 'furniture']);

/** 家具能被缩到的最小边长：20px ≈ 330 mm，再小就只剩一个点。 */
const MIN_FURNITURE_SIZE = 20;

/** 单件家具的边长上限 600px = 10 m，超过就是数据写错了。 */
const MAX_FURNITURE_SIDE = 600;

/** 家具只允许直角四档转角：户型图上斜着摆的家具没有意义。 */
const FURNITURE_ROTATIONS = new Set([0, 90, 180, 270]);

/** 脏数据一律当 0 度：宁可画成正的，也不要画成一个歪的方框。 */
function normalizeRotation(value) {
    return FURNITURE_ROTATIONS.has(value) ? value : 0;
}

/** 从原始对象里读可空数字：读不到一律 null，表示这件家具还没摆过位置。 */
function optionalNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 家具原型 id 只做长度校验：原型清单在渲染层，主进程不复制一份。 */
function optionalPreset(value) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') fail('家具原型无效');
    if (value.length > MAX_NAME_LENGTH) fail('家具原型无效');
    return value;
}

/** 物品数量上限：再大就不是"记一下在哪"，而是进销存了。 */
const MAX_QUANTITY = 9999;

/** 物品备注上限。 */
const MAX_NOTE_LENGTH = 200;

/** 门窗最小宽度 24px ≈ 40cm，再窄就不是洞而是一道缝。 */
const MIN_OPENING_WIDTH = 24;

const PLAN_ID = 'singleton';

/** 库里存的 'top,left' → ['top', 'left']；空串和老库里的脏值都归一到空数组。 */
function parseOpenWalls(value) {
    if (typeof value !== 'string' || value === '') return [];
    const seen = new Set(value.split(','));
    return WALL_ORDER.filter((wall) => seen.has(wall));
}

/**
 * 校验并归一来自命令或恢复数据的「拆掉的边墙」。
 *
 * 允许缺省（老客户端不带这个字段），缺省即四面墙都在；给了就必须是墙名的数组，
 * 重复值会被去重而不是报错 —— 前端四个开关随手点两下不该让整张图存不下去。
 */
function normalizeOpenWalls(value) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail('拆掉的墙必须是数组');
    if (value.length > WALL_ORDER.length) fail('拆掉的墙数量无效');
    const seen = new Set();
    for (const wall of value) {
        if (!WALLS.has(wall)) fail('拆掉的墙必须是 top / right / bottom / left');
        seen.add(wall);
    }
    return WALL_ORDER.filter((wall) => seen.has(wall));
}

/** 一段墙的几何：朝向、所在直线的坐标、沿墙区间。 */
function wallLineOf(room, side) {
    const horizontal = side === 'top' || side === 'bottom';
    return {
        horizontal,
        coordinate: horizontal
            ? room.y + (side === 'bottom' ? room.height : 0)
            : room.x + (side === 'right' ? room.width : 0),
        start: horizontal ? room.x : room.y,
        end: horizontal ? room.x + room.width : room.y + room.height,
    };
}

/**
 * 这面物理墙是不是已经被拆掉了。
 *
 * 拆墙不分是谁拆的：一面墙物理上只有一个，隔壁宣布拆掉，自己这边也就没墙了。
 * 所以判断要把全屋的 open_walls 都看一遍，不能只查自己那一间。
 */
function openWallAt(db, roomId, wall) {
    const rooms = db.prepare('SELECT id, x, y, width, height, open_walls FROM rooms').all();
    const self = rooms.find((room) => room.id === roomId);
    if (!self) return false;
    const line = wallLineOf(self, wall);
    return rooms.some((other) =>
        parseOpenWalls(other.open_walls).some((side) => {
            const target = wallLineOf(other, side);
            return (
                line.horizontal === target.horizontal &&
                Math.abs(line.coordinate - target.coordinate) < 0.01 &&
                line.start < target.end - 0.01 &&
                target.start < line.end - 0.01
            );
        }),
    );
}

// A door belongs to a room, but occupies a physical wall shared by both rooms.
function checkSharedOpenings(state) {
    const list = state.rooms.flatMap((room) =>
        room.openings.map((o) => {
            const horizontal = o.wall === 'top' || o.wall === 'bottom';
            return {
                id: o.id,
                horizontal,
                line: horizontal
                    ? room.y + (o.wall === 'bottom' ? room.height : 0)
                    : room.x + (o.wall === 'right' ? room.width : 0),
                start: (horizontal ? room.x : room.y) + o.pos,
                width: o.width,
            };
        }),
    );
    for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i],
                b = list[j];
            if (
                a.horizontal === b.horizontal &&
                Math.abs(a.line - b.line) < 0.01 &&
                a.start < b.start + b.width - 0.01 &&
                b.start < a.start + a.width - 0.01
            ) {
                fail('共享墙上已有门窗，不能重叠');
            }
        }
}

/** Atomic history/template restore. Validate every field before committing; never partially save a plan. */
function replaceRooms(db, rawRooms, rawStorage = [], rawItems = []) {
    if (!db.prepare('SELECT id FROM floor_plan').get()) fail('尚未创建户型图');
    if (!Array.isArray(rawRooms) || rawRooms.length > 500) fail('房间列表无效');
    if (!Array.isArray(rawStorage) || rawStorage.length > 2000) fail('储物设备列表无效');
    if (!Array.isArray(rawItems) || rawItems.length > 5000) fail('物品列表无效');
    db.exec('SAVEPOINT replace_rooms');
    try {
        db.exec('DELETE FROM rooms');
        const insertRoom = db.prepare(
            'INSERT INTO rooms (id, name, x, y, width, height, floor, outdoor, open_walls, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const insertOpening = db.prepare(
            'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, swing, depth, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const ids = new Set();
        rawRooms.forEach((room, order) => {
            if (!room || typeof room !== 'object') fail('房间无效');
            const id = normalizeName(room.id, '房间 id');
            if (ids.has(id)) fail('房间 id 重复');
            ids.add(id);
            const rect = normalizeRect(room);
            const name = normalizeName(room.name, '房间名称');
            if (room.floor !== null && !FLOORS.has(room.floor)) fail('地面材质无效');
            if (room.outdoor !== undefined && typeof room.outdoor !== 'boolean') {
                fail('户外标记必须是布尔值');
            }
            if (!Array.isArray(room.openings) || room.openings.length > 200) fail('门窗列表无效');
            insertRoom.run(
                id,
                name,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                room.floor,
                room.outdoor === true ? 1 : 0,
                normalizeOpenWalls(room.openWalls).join(','),
                order,
            );
            room.openings.forEach((o, index) => {
                if (
                    !o ||
                    typeof o !== 'object' ||
                    !WALLS.has(o.wall) ||
                    !KINDS.has(o.kind) ||
                    !['start', 'end'].includes(o.hinge) ||
                    (o.swing !== undefined && !SWINGS.has(o.swing))
                )
                    fail('门窗参数无效');
                const openingId = normalizeName(o.id, '门窗 id');
                const length = o.wall === 'top' || o.wall === 'bottom' ? rect.width : rect.height;
                if (
                    typeof o.pos !== 'number' ||
                    !Number.isFinite(o.pos) ||
                    o.pos < 0 ||
                    typeof o.width !== 'number' ||
                    !Number.isFinite(o.width) ||
                    o.width < MIN_OPENING_WIDTH ||
                    o.pos + o.width > length + 0.01
                )
                    fail('门窗超出墙面或尺寸无效');
                insertOpening.run(
                    openingId,
                    id,
                    o.kind,
                    o.wall,
                    o.pos,
                    o.width,
                    o.hinge,
                    o.swing === 'out' ? 'out' : 'in',
                    normalizeDepth(o.depth, '门窗'),
                    index,
                );
            });
        });
        // 储物设备与物品跟在房间后面恢复：撤销一次房间改动时，
        // 期间新增的柜子和物品不能因为 DELETE FROM rooms 的级联而消失。
        const insertStorage = db.prepare(
            `INSERT INTO storage
                 (id, room_id, name, kind, sort_order, preset, x, y, width, height, rotation)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const roomIds = new Set(ids);
        const storageIds = new Set();
        rawStorage.forEach((device, order) => {
            if (!device || typeof device !== 'object') fail('储物设备无效');
            const id = normalizeName(device.id, '储物设备 id');
            if (storageIds.has(id)) fail('储物设备 id 重复');
            storageIds.add(id);
            if (!roomIds.has(device.roomId)) fail('储物设备所属房间不存在');
            if (!STORAGE_KINDS.has(device.kind)) fail('储物设备类型无效');
            insertStorage.run(
                id,
                device.roomId,
                normalizeName(device.name, '储物设备名称'),
                device.kind,
                order,
                optionalPreset(device.preset),
                optionalNumber(device.x),
                optionalNumber(device.y),
                optionalNumber(device.width),
                optionalNumber(device.height),
                normalizeRotation(device.rotation),
            );
        });

        const insertItem = db.prepare(
            `INSERT INTO items (id, room_id, storage_id, name, category, quantity, note, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const itemIds = new Set();
        rawItems.forEach((item, order) => {
            if (!item || typeof item !== 'object') fail('物品无效');
            const id = normalizeName(item.id, '物品 id');
            if (itemIds.has(id)) fail('物品 id 重复');
            itemIds.add(id);
            if (!roomIds.has(item.roomId)) fail('物品所属房间不存在');
            const storageId = item.storageId ?? null;
            if (storageId !== null && !storageIds.has(storageId)) fail('物品所属储物设备不存在');
            insertItem.run(
                id,
                item.roomId,
                storageId,
                normalizeName(item.name, '物品名称'),
                normalizeName(item.category, '物品分类'),
                normalizeQuantity(item.quantity),
                normalizeNote(item.note),
                order,
            );
        });

        const state = loadState(db);
        checkSharedOpenings(state);
        // Sequences remain monotonic even after restoring an earlier drawing.
        const largest = Math.max(
            rawRooms.length,
            ...rawRooms.map((r) => Number(/^房间 (\d+)$/.exec(r.name)?.[1] ?? 0)),
        );
        db.prepare('UPDATE floor_plan SET room_seq = MAX(room_seq, ?)').run(largest);
        db.exec('RELEASE replace_rooms');
        return loadState(db);
    } catch (error) {
        db.exec('ROLLBACK TO replace_rooms');
        db.exec('RELEASE replace_rooms');
        throw error;
    }
}

function fail(message) {
    throw new TypeError(`户型图数据校验失败：${message}`);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function normalizeName(value, label) {
    if (typeof value !== 'string') fail(`${label}必须是文本`);
    const name = value.trim();
    if (name.length === 0) fail(`${label}不能为空`);
    if (name.length > MAX_NAME_LENGTH) fail(`${label}不能超过 ${MAX_NAME_LENGTH} 个字符`);
    return name;
}

/**
 * 生成主键。
 *
 * 早先写的是 `prefix-${Date.now()}-${Math.random() * 1e4}`：同一毫秒里连建两条
 * 就只剩一万分之一的随机空间，实测在测试里真的撞出过
 * `UNIQUE constraint failed: openings.id`。现在加上进程内自增序号，
 * 同毫秒内必不重复；保留随机后缀是为了跨进程/重启也不易撞。
 * @param {string} prefix
 */
let idSequence = 0;
function makeId(prefix) {
    idSequence = (idSequence + 1) % 1296;
    const random = Math.floor(Math.random() * 1296)
        .toString(36)
        .padStart(2, '0');
    return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36).padStart(2, '0')}${random}`;
}

/** 物品数量：正整数，缺省 1。只接受数字类型，避免 "3" 这种字符串被悄悄换算。 */
function normalizeQuantity(value) {
    if (value === undefined || value === null) return 1;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        fail(`物品数量必须是 1–${MAX_QUANTITY} 的整数`);
    }
    if (value < 1 || value > MAX_QUANTITY) fail(`物品数量必须是 1–${MAX_QUANTITY} 的整数`);
    return value;
}

/** 物品备注：可空文本，超长截断没有意义，直接拒绝。 */
function normalizeNote(value) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') fail('物品备注必须是文本');
    const note = value.trim();
    if (note.length > MAX_NOTE_LENGTH) fail(`物品备注不能超过 ${MAX_NOTE_LENGTH} 个字符`);
    return note;
}

/**
 * @param {unknown} value
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function normalizeRect(value) {
    if (typeof value !== 'object' || value === null) fail('矩形不是对象');
    const { x, y, width, height } = /** @type {Record<string, unknown>} */ (value);

    for (const [key, amount] of Object.entries({ x, y, width, height })) {
        if (typeof amount !== 'number' || !Number.isFinite(amount)) fail(`矩形 ${key} 无效`);
    }
    if (width < MIN_ROOM_SIZE || height < MIN_ROOM_SIZE) {
        fail(`房间宽高不能小于 ${MIN_ROOM_SIZE} 像素（1 米）`);
    }

    return { x, y, width, height };
}

/**
 * 一次读出整套户型：户型图 + 房间 + 每个房间墙上的门窗。
 * 门窗挂在房间对象下，渲染层不用自己按 roomId 分组。
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ plan: object | null, rooms: Array<object> }}
 */
function loadState(db) {
    const row = db.prepare('SELECT id, name, room_seq, created_at FROM floor_plan').get();
    const rooms = db
        .prepare(
            'SELECT id, name, x, y, width, height, floor, outdoor, open_walls FROM rooms ORDER BY sort_order',
        )
        .all()
        .map((room) => ({
            id: room.id,
            name: room.name,
            x: room.x,
            y: room.y,
            width: room.width,
            height: room.height,
            floor: room.floor ?? null,
            outdoor: room.outdoor === 1,
            openWalls: parseOpenWalls(room.open_walls),
            openings: [],
        }));

    const openings = db
        .prepare(
            'SELECT id, room_id, kind, wall, pos, width, hinge, swing, depth FROM openings ORDER BY sort_order',
        )
        .all();

    const byRoom = new Map();
    for (const item of openings) {
        const list = byRoom.get(item.room_id) ?? [];
        list.push({
            id: item.id,
            kind: item.kind,
            wall: item.wall,
            pos: item.pos,
            width: item.width,
            hinge: item.hinge,
            // 老库（schema 第 8 版之前）没有这一列，或者脏值，都归一到朝内开。
            swing: item.swing === 'out' ? 'out' : 'in',
            // 同理：第 9 版之前没有 depth，脏值一律退回默认进深。
            depth:
                typeof item.depth === 'number' && Number.isFinite(item.depth)
                    ? item.depth
                    : DEFAULT_BAY_DEPTH,
        });
        byRoom.set(item.room_id, list);
    }

    const storage = db
        .prepare(
            `SELECT id, room_id, name, kind, preset, x, y, width, height, rotation
               FROM storage ORDER BY sort_order`,
        )
        .all()
        .map((item) => ({
            id: item.id,
            roomId: item.room_id,
            name: item.name,
            kind: item.kind,
            preset: item.preset ? item.preset : null,
            x: item.x ?? null,
            y: item.y ?? null,
            width: item.width ?? null,
            height: item.height ?? null,
            rotation: normalizeRotation(item.rotation),
        }));

    const items = db
        .prepare(
            'SELECT id, name, category, quantity, note, room_id, storage_id FROM items ORDER BY sort_order',
        )
        .all()
        .map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            note: item.note,
            roomId: item.room_id,
            storageId: item.storage_id ?? null,
        }));

    return {
        plan: row
            ? {
                  id: row.id,
                  name: row.name,
                  roomSeq: row.room_seq,
                  createdAt: row.created_at,
              }
            : null,
        rooms: rooms.map((room) => ({ ...room, openings: byRoom.get(room.id) ?? [] })),
        storage,
        items,
    };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawName
 */
function createPlan(db, rawName) {
    const existing = db.prepare('SELECT id FROM floor_plan').get();
    if (existing) fail('户型图已存在，不能重复创建');

    const name = normalizeName(rawName, '户型图名称');
    db.prepare('INSERT INTO floor_plan (id, name, room_seq, created_at) VALUES (?, ?, 0, ?)').run(
        PLAN_ID,
        name,
        new Date().toISOString(),
    );

    return loadState(db);
}

/**
 * 新建房间：序号只增不减，删除或清空都不回收。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawRect
 */
function addRoom(db, rawRect) {
    const rect = normalizeRect(rawRect);
    const plan = db.prepare('SELECT room_seq FROM floor_plan').get();
    if (!plan) fail('尚未创建户型图');

    const sequence = plan.room_seq + 1;
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM rooms').get();
    const id = `room-${Date.now()}-${sequence}`;

    db.exec('BEGIN');
    try {
        db.prepare(
            `INSERT INTO rooms (id, name, x, y, width, height, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, `房间 ${sequence}`, rect.x, rect.y, rect.width, rect.height, order.next);
        db.prepare('UPDATE floor_plan SET room_seq = ? WHERE id = ?').run(sequence, PLAN_ID);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    return loadState(db);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {unknown} rawName
 */
function renameRoom(db, rawId, rawName) {
    const id = normalizeName(rawId, '房间 id');
    const name = normalizeName(rawName, '房间名称');
    const result = db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, id);
    if (result.changes === 0) fail('房间不存在');
    return loadState(db);
}

/**
 * 移动房间：只改左上角坐标，尺寸不动。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {unknown} rawX
 * @param {unknown} rawY
 */
function moveRoom(db, rawId, rawX, rawY) {
    const id = normalizeName(rawId, '房间 id');
    for (const amount of [rawX, rawY]) {
        if (typeof amount !== 'number' || !Number.isFinite(amount)) fail('房间坐标无效');
    }

    const result = db.prepare('UPDATE rooms SET x = ?, y = ? WHERE id = ?').run(rawX, rawY, id);
    if (result.changes === 0) fail('房间不存在');
    return loadState(db);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 */
function removeRoom(db, rawId) {
    const id = normalizeName(rawId, '房间 id');
    const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    if (result.changes === 0) fail('房间不存在');
    return loadState(db);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
function clearRooms(db) {
    db.exec('DELETE FROM rooms');
    return loadState(db);
}

/**
 * 缩放房间：一次写入完整矩形，避免「先改宽再改高」的中间态。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {unknown} rawRect
 */
function resizeRoom(db, rawId, rawRect) {
    const id = normalizeName(rawId, '房间 id');
    const rect = normalizeRect(rawRect);

    const holes = db.prepare('SELECT wall, pos, width FROM openings WHERE room_id = ?').all(id);
    if (
        holes.some(
            (o) =>
                o.pos + o.width >
                (o.wall === 'top' || o.wall === 'bottom' ? rect.width : rect.height) + 0.01,
        )
    ) {
        fail('缩小后门窗将超出墙面，请先移动门窗');
    }

    const result = db
        .prepare('UPDATE rooms SET x = ?, y = ?, width = ?, height = ? WHERE id = ?')
        .run(rect.x, rect.y, rect.width, rect.height, id);
    if (result.changes === 0) fail('房间不存在');
    return loadState(db);
}

/**
 * 在房间的某面墙上开一个门或窗。
 *
 * 位置用「沿墙起点 + 宽度」表示：房间移动或缩放时洞口自动跟随，
 * 不需要同步改写绝对坐标。同一面墙上不允许两个洞口重叠。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Record<string, unknown>} raw
 */
function addOpening(db, raw) {
    if (typeof raw !== 'object' || raw === null) fail('洞口参数无效');
    const roomId = normalizeName(raw.roomId, '房间 id');
    const room = db.prepare('SELECT width, height, open_walls FROM rooms WHERE id = ?').get(roomId);
    if (!room) fail('房间不存在');

    const wall = raw.wall;
    if (typeof wall !== 'string' || !WALLS.has(wall)) fail('墙面方向无效');
    // 拆掉的边上一个墙段都没有，凿不出洞来 —— 放行会让图里多一个看不见的门窗。
    if (openWallAt(db, roomId, wall)) fail('这条边已经拆掉了，先补回墙再放门窗');
    const kind = raw.kind;
    if (typeof kind !== 'string' || !KINDS.has(kind)) fail('洞口类型无效');

    const wallLength = wall === 'top' || wall === 'bottom' ? room.width : room.height;
    const width = Number(raw.width);
    const pos = Number(raw.pos);
    if (!Number.isFinite(width) || width < MIN_OPENING_WIDTH) {
        fail(`门窗宽度不能小于 ${MIN_OPENING_WIDTH} 像素`);
    }
    if (!Number.isFinite(pos) || pos < 0) fail('洞口位置无效');
    if (pos + width > wallLength + 0.5) fail('洞口超出墙面长度');

    const conflict = db
        .prepare('SELECT pos, width FROM openings WHERE room_id = ? AND wall = ?')
        .all(roomId, wall)
        .some((other) => pos < other.pos + other.width - 0.5 && other.pos < pos + width - 0.5);
    if (conflict) fail('该位置已有门窗，不能重叠');

    const hinge = raw.hinge === 'end' ? 'end' : 'start';
    if (raw.swing !== undefined && !SWINGS.has(raw.swing)) fail('门扇开向无效');
    const swing = raw.swing === 'out' ? 'out' : 'in';
    const depth = normalizeDepth(raw.depth, '门窗');
    const order = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM openings')
        .get();
    const id = makeId('opening');

    db.prepare(
        `INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, swing, depth, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, roomId, kind, wall, pos, width, hinge, swing, depth, order.next);

    return loadState(db);
}

/**
 * 设置房间地面材质。传 null 表示恢复「按房间名自动推断」。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {unknown} rawFloor
 */
function setRoomFloor(db, rawId, rawFloor) {
    const id = normalizeName(rawId, '房间 id');
    if (rawFloor !== null && (typeof rawFloor !== 'string' || !FLOORS.has(rawFloor))) {
        fail('地面材质无效');
    }

    const result = db.prepare('UPDATE rooms SET floor = ? WHERE id = ?').run(rawFloor, id);
    if (result.changes === 0) fail('房间不存在');
    return loadState(db);
}

/**
 * 设置房间是否为户外空间（阳台 / 露台）。
 *
 * 只改一个标记位：几何、门窗、储物一概不动。渲染层据此把那几面朝外的墙
 * 换成栏杆；与邻室共用的墙仍然照旧画实心墙（阳台与客厅之间本来就有墙和推拉门）。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {unknown} rawOutdoor
 */
function setRoomOutdoor(db, rawId, rawOutdoor) {
    const id = normalizeName(rawId, '房间 id');
    if (typeof rawOutdoor !== 'boolean') fail('户外标记必须是布尔值');
    const result = db
        .prepare('UPDATE rooms SET outdoor = ? WHERE id = ?')
        .run(rawOutdoor ? 1 : 0, id);
    if (result.changes === 0) fail('房间不存在');
    return loadState(db);
}

/**
 * 设定「哪几条边整面拆掉」。
 *
 * 整体替换而不是逐边增删：四个开关本来就是一份完整状态，
 * 传进来的是这次勾选的全部结果，服务端不需要猜哪些是要反选的。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {unknown} rawWalls
 */
function setRoomOpenWalls(db, rawId, rawWalls) {
    const id = normalizeName(rawId, '房间 id');
    const walls = normalizeOpenWalls(rawWalls);
    const result = db
        .prepare('UPDATE rooms SET open_walls = ? WHERE id = ?')
        .run(walls.join(','), id);
    if (result.changes === 0) fail('房间不存在');
    return loadState(db);
}

/**
 * 修改已有门窗：位置、宽度、开启方向，只传要改的字段。
 *
 * 校验按合并后的结果做，而不是逐字段 —— 单独把宽度调大会超出墙面，
 * 但如果是同时往前挪一点就合法，逐字段校验会把这种合法操作挡掉。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {Record<string, unknown>} patch
 */
function updateOpening(db, rawId, patch) {
    const id = normalizeName(rawId, '洞口 id');
    const row = db
        .prepare(
            'SELECT id, room_id, wall, pos, width, hinge, swing, depth FROM openings WHERE id = ?',
        )
        .get(id);
    if (!row) fail('门窗不存在');

    const room = db.prepare('SELECT width, height FROM rooms WHERE id = ?').get(row.room_id);
    if (!room) fail('房间不存在');

    const pos = patch.pos === undefined ? row.pos : Number(patch.pos);
    const width = patch.width === undefined ? row.width : Number(patch.width);
    const hinge = patch.hinge === undefined ? row.hinge : patch.hinge;
    const swing = patch.swing === undefined ? row.swing : patch.swing;
    const depth = normalizeDepth(patch.depth === undefined ? row.depth : patch.depth, '门窗');

    if (!Number.isFinite(pos) || pos < 0) fail('洞口位置无效');
    if (!Number.isFinite(width) || width < MIN_OPENING_WIDTH) {
        fail(`门窗宽度不能小于 ${MIN_OPENING_WIDTH} 像素`);
    }
    if (hinge !== 'start' && hinge !== 'end') fail('开启方向无效');
    if (!SWINGS.has(swing)) fail('门扇开向无效');

    const wallLength = row.wall === 'top' || row.wall === 'bottom' ? room.width : room.height;
    if (pos + width > wallLength + 0.5) fail('洞口超出墙面长度');

    const conflict = db
        .prepare('SELECT pos, width FROM openings WHERE room_id = ? AND wall = ? AND id != ?')
        .all(row.room_id, row.wall, id)
        .some((other) => pos < other.pos + other.width - 0.5 && other.pos < pos + width - 0.5);
    if (conflict) fail('与同墙其他门窗重叠');

    db.prepare(
        'UPDATE openings SET pos = ?, width = ?, hinge = ?, swing = ?, depth = ? WHERE id = ?',
    ).run(pos, width, hinge, swing, depth, id);
    return loadState(db);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 */
function removeOpening(db, rawId) {
    const id = normalizeName(rawId, '洞口 id');
    const result = db.prepare('DELETE FROM openings WHERE id = ?').run(id);
    if (result.changes === 0) fail('门窗不存在');
    return loadState(db);
}

/**
 * 新增储物设备。名称缺省按类型给一个，用户之后可以改。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Record<string, unknown>} raw
 */
function addStorage(db, raw) {
    if (typeof raw !== 'object' || raw === null) fail('家具参数无效');
    const roomId = normalizeName(raw.roomId, '房间 id');
    if (!db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId)) fail('房间不存在');
    if (!STORAGE_KINDS.has(raw.kind)) fail('家具类型无效');

    const name = normalizeName(raw.name, '家具名称');
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM storage').get();
    const id = makeId('storage');
    // 位置是可选参数：从家具库"点一下加进来"时不带坐标，先按房间宽度自动排。
    db.prepare(
        `INSERT INTO storage
             (id, room_id, name, kind, sort_order, preset, x, y, width, height, rotation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        roomId,
        name,
        raw.kind,
        order.next,
        optionalPreset(raw.preset),
        optionalNumber(raw.x),
        optionalNumber(raw.y),
        optionalNumber(raw.width),
        optionalNumber(raw.height),
        normalizeRotation(raw.rotation),
    );
    return loadState(db);
}

/**
 * 把一件家具摆到房间里（拖放落点）。
 *
 * 这里只存数字与旋转，不管夹边界：房间尺寸随时会变，夹取放在渲染层
 * （plan-storage 的 placedBox）做，房间一缩放家具就自动跟着收回来。
 * 但明显写错的数据必须拦住 —— 非有限数、负尺寸、超出全局上限都直接失败。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Record<string, unknown>} raw
 */
function placeStorage(db, raw) {
    if (typeof raw !== 'object' || raw === null) fail('家具参数无效');
    const id = normalizeName(raw.id, '家具 id');
    if (!db.prepare('SELECT id FROM storage WHERE id = ?').get(id)) fail('家具不存在');

    /** @param {unknown} value @param {string} label */
    const side = (value, label) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}必须是数字`);
        if (value < MIN_FURNITURE_SIZE || value > MAX_FURNITURE_SIDE) {
            fail(`${label}必须在 ${MIN_FURNITURE_SIZE}–${MAX_FURNITURE_SIDE} 像素之间`);
        }
        return value;
    };

    const width = side(raw.width, '家具宽度');
    const height = side(raw.height, '家具深度');
    /** @param {unknown} value @param {string} label */
    const coord = (value, label) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}必须是数字`);
        if (Math.abs(value) > MAX_FURNITURE_SIDE * 20) fail(`${label}超出图纸范围`);
        return value;
    };

    const rotation = raw.rotation === undefined || raw.rotation === null ? 0 : raw.rotation;
    if (!FURNITURE_ROTATIONS.has(rotation)) fail('家具转角只能是 0 / 90 / 180 / 270 度');

    /* 搬去另一个房间：家具的归属跟着坐标一起变，否则会出现「坐标落在次卧、
       room_id 还写着主卧」这种两处矛盾的记录。 */
    const roomId =
        raw.roomId === undefined || raw.roomId === null
            ? null
            : normalizeName(raw.roomId, '房间 id');
    if (roomId && !db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId)) {
        fail('房间不存在');
    }

    if (roomId) {
        db.prepare(
            `UPDATE storage
                SET room_id = ?, x = ?, y = ?, width = ?, height = ?, rotation = ?
              WHERE id = ?`,
        ).run(
            roomId,
            coord(raw.x, '家具横坐标'),
            coord(raw.y, '家具纵坐标'),
            width,
            height,
            rotation,
            id,
        );
        /* 柜子里装着的东西跟着柜子一起搬房间。物品的 room_id 是必填的，
           不同步就会出现「柜子在次卧、里面的东西还记在主卧」——
           搜索定位会把人带到空房间。 */
        db.prepare('UPDATE items SET room_id = ? WHERE storage_id = ?').run(roomId, id);
    } else {
        db.prepare(
            'UPDATE storage SET x = ?, y = ?, width = ?, height = ?, rotation = ? WHERE id = ?',
        ).run(coord(raw.x, '家具横坐标'), coord(raw.y, '家具纵坐标'), width, height, rotation, id);
    }
    return loadState(db);
}

/**
 * 重命名储物设备。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {unknown} rawName
 */
function renameStorage(db, rawId, rawName) {
    const id = normalizeName(rawId, '储物设备 id');
    const name = normalizeName(rawName, '储物设备名称');
    const result = db.prepare('UPDATE storage SET name = ? WHERE id = ?').run(name, id);
    if (result.changes === 0) fail('储物设备不存在');
    return loadState(db);
}

/**
 * 删除储物设备。物品保留在原房间（storage_id 置空），
 * 否则用户会以为"东西跟着柜子一起被删了"。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 */
function removeStorage(db, rawId) {
    const id = normalizeName(rawId, '储物设备 id');
    const result = db.prepare('DELETE FROM storage WHERE id = ?').run(id);
    if (result.changes === 0) fail('储物设备不存在');
    return loadState(db);
}

/**
 * 登记物品。roomId 必填（搜到就能去拿），storageId 可空。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Record<string, unknown>} raw
 */
function addItem(db, raw) {
    if (typeof raw !== 'object' || raw === null) fail('物品参数无效');
    const roomId = normalizeName(raw.roomId, '房间 id');
    if (!db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId)) fail('房间不存在');

    const storageId = raw.storageId ?? null;
    if (storageId !== null) {
        const device = db
            .prepare('SELECT room_id FROM storage WHERE id = ?')
            .get(normalizeName(storageId, '储物设备 id'));
        if (!device) fail('储物设备不存在');
        // 物品必须跟柜子在同一个房间里，否则「位置」会有两个互相矛盾的答案。
        if (device.room_id !== roomId) fail('储物设备不在所选房间里');
    }

    const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM items').get();
    const id = makeId('item');
    db.prepare(
        `INSERT INTO items (id, room_id, storage_id, name, category, quantity, note, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        roomId,
        storageId,
        normalizeName(raw.name, '物品名称'),
        normalizeName(raw.category, '物品分类'),
        normalizeQuantity(raw.quantity),
        normalizeNote(raw.note),
        order.next,
    );
    return loadState(db);
}

/**
 * 修改物品。只传要改的字段；换柜子时校验新柜子与物品同房间。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 * @param {Record<string, unknown>} patch
 */
function updateItem(db, rawId, patch) {
    const id = normalizeName(rawId, '物品 id');
    const row = db.prepare('SELECT id, room_id, storage_id FROM items WHERE id = ?').get(id);
    if (!row) fail('物品不存在');

    const name = patch.name === undefined ? undefined : normalizeName(patch.name, '物品名称');
    const category =
        patch.category === undefined ? undefined : normalizeName(patch.category, '物品分类');
    const quantity = patch.quantity === undefined ? undefined : normalizeQuantity(patch.quantity);
    const note = patch.note === undefined ? undefined : normalizeNote(patch.note);

    let storageId = row.storage_id;
    if (patch.storageId !== undefined) {
        if (patch.storageId === null) storageId = null;
        else {
            const next = normalizeName(patch.storageId, '储物设备 id');
            const device = db.prepare('SELECT room_id FROM storage WHERE id = ?').get(next);
            if (!device) fail('储物设备不存在');
            if (device.room_id !== row.room_id) fail('储物设备不在该物品所在的房间');
            storageId = next;
        }
    }

    db.prepare(
        'UPDATE items SET name = COALESCE(?, name), category = COALESCE(?, category), quantity = COALESCE(?, quantity), note = COALESCE(?, note), storage_id = ? WHERE id = ?',
    ).run(name ?? null, category ?? null, quantity ?? null, note ?? null, storageId, id);
    return loadState(db);
}

/**
 * 删除物品。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} rawId
 */
function removeItem(db, rawId) {
    const id = normalizeName(rawId, '物品 id');
    const result = db.prepare('DELETE FROM items WHERE id = ?').run(id);
    if (result.changes === 0) fail('物品不存在');
    return loadState(db);
}

/**
 * 命令分发：渲染层只发语义化命令，具体 SQL 与校验都留在主进程。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ type: string } & Record<string, unknown>} command
 */
function dispatchCommand(db, command) {
    if (typeof command !== 'object' || command === null || typeof command.type !== 'string') {
        fail('命令结构无效');
    }

    switch (command.type) {
        case 'replace-rooms':
            return replaceRooms(db, command.rooms, command.storage, command.items);
        case 'create-plan':
            return createPlan(db, command.name);
        case 'add-room':
            return addRoom(db, command.rect);
        case 'rename-room':
            return renameRoom(db, command.id, command.name);
        case 'move-room':
            return moveRoom(db, command.id, command.x, command.y);
        case 'resize-room':
            return resizeRoom(db, command.id, command.rect);
        case 'remove-room':
            return removeRoom(db, command.id);
        case 'clear-rooms':
            return clearRooms(db);
        case 'add-opening':
            return addOpening(db, /** @type {Record<string, unknown>} */ (command));
        case 'update-opening':
            return updateOpening(db, command.id, /** @type {Record<string, unknown>} */ (command));
        case 'remove-opening':
            return removeOpening(db, command.id);
        case 'set-room-floor':
            return setRoomFloor(db, command.id, command.floor ?? null);
        case 'set-room-outdoor':
            return setRoomOutdoor(db, command.id, command.outdoor);
        case 'set-room-open-walls':
            return setRoomOpenWalls(db, command.id, command.openWalls);
        case 'add-storage':
            return addStorage(db, /** @type {Record<string, unknown>} */ (command));
        case 'place-storage':
            return placeStorage(db, /** @type {Record<string, unknown>} */ (command));
        case 'rename-storage':
            return renameStorage(db, command.id, command.name);
        case 'remove-storage':
            return removeStorage(db, command.id);
        case 'add-item':
            return addItem(db, /** @type {Record<string, unknown>} */ (command));
        case 'update-item':
            return updateItem(db, command.id, /** @type {Record<string, unknown>} */ (command));
        case 'remove-item':
            return removeItem(db, command.id);
        default:
            return fail(`未知命令：${command.type}`);
    }
}

function applyCommand(db, command) {
    const checksPhysicalWall =
        command &&
        ['add-opening', 'update-opening', 'move-room', 'resize-room'].includes(command.type);
    if (!checksPhysicalWall) return dispatchCommand(db, command);
    db.exec('SAVEPOINT physical_wall');
    try {
        const state = dispatchCommand(db, command);
        checkSharedOpenings(state);
        db.exec('RELEASE physical_wall');
        return state;
    } catch (error) {
        db.exec('ROLLBACK TO physical_wall');
        db.exec('RELEASE physical_wall');
        throw error;
    }
}

module.exports = {
    MIN_ROOM_SIZE,
    MAX_NAME_LENGTH,
    applyCommand,
    loadState,
};
