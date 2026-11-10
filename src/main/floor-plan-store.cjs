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

/** 洞口类型。 */
const KINDS = new Set(['door', 'window']);

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

/** 储物设备的四种形态。只影响图标与画布排布，不影响归属关系。 */
const STORAGE_KINDS = new Set(['cabinet', 'shelf', 'box', 'furniture']);

/** 物品数量上限：再大就不是"记一下在哪"，而是进销存了。 */
const MAX_QUANTITY = 9999;

/** 物品备注上限。 */
const MAX_NOTE_LENGTH = 200;

/** 门窗最小宽度 24px ≈ 40cm，再窄就不是洞而是一道缝。 */
const MIN_OPENING_WIDTH = 24;

const PLAN_ID = 'singleton';

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
            'INSERT INTO rooms (id, name, x, y, width, height, floor, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const insertOpening = db.prepare(
            'INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
            if (!Array.isArray(room.openings) || room.openings.length > 200) fail('门窗列表无效');
            insertRoom.run(id, name, rect.x, rect.y, rect.width, rect.height, room.floor, order);
            room.openings.forEach((o, index) => {
                if (
                    !o ||
                    typeof o !== 'object' ||
                    !WALLS.has(o.wall) ||
                    !KINDS.has(o.kind) ||
                    !['start', 'end'].includes(o.hinge)
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
                insertOpening.run(openingId, id, o.kind, o.wall, o.pos, o.width, o.hinge, index);
            });
        });
        // 储物设备与物品跟在房间后面恢复：撤销一次房间改动时，
        // 期间新增的柜子和物品不能因为 DELETE FROM rooms 的级联而消失。
        const insertStorage = db.prepare(
            'INSERT INTO storage (id, room_id, name, kind, sort_order) VALUES (?, ?, ?, ?, ?)',
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
        .prepare('SELECT id, name, x, y, width, height, floor FROM rooms ORDER BY sort_order')
        .all()
        .map((room) => ({
            id: room.id,
            name: room.name,
            x: room.x,
            y: room.y,
            width: room.width,
            height: room.height,
            floor: room.floor ?? null,
            openings: [],
        }));

    const openings = db
        .prepare(
            'SELECT id, room_id, kind, wall, pos, width, hinge FROM openings ORDER BY sort_order',
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
        });
        byRoom.set(item.room_id, list);
    }

    const storage = db
        .prepare('SELECT id, room_id, name, kind FROM storage ORDER BY sort_order')
        .all()
        .map((item) => ({
            id: item.id,
            roomId: item.room_id,
            name: item.name,
            kind: item.kind,
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
    const room = db.prepare('SELECT width, height FROM rooms WHERE id = ?').get(roomId);
    if (!room) fail('房间不存在');

    const wall = raw.wall;
    if (typeof wall !== 'string' || !WALLS.has(wall)) fail('墙面方向无效');
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
    const order = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM openings')
        .get();
    const id = makeId('opening');

    db.prepare(
        `INSERT INTO openings (id, room_id, kind, wall, pos, width, hinge, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, roomId, kind, wall, pos, width, hinge, order.next);

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
        .prepare('SELECT id, room_id, wall, pos, width, hinge FROM openings WHERE id = ?')
        .get(id);
    if (!row) fail('门窗不存在');

    const room = db.prepare('SELECT width, height FROM rooms WHERE id = ?').get(row.room_id);
    if (!room) fail('房间不存在');

    const pos = patch.pos === undefined ? row.pos : Number(patch.pos);
    const width = patch.width === undefined ? row.width : Number(patch.width);
    const hinge = patch.hinge === undefined ? row.hinge : patch.hinge;

    if (!Number.isFinite(pos) || pos < 0) fail('洞口位置无效');
    if (!Number.isFinite(width) || width < MIN_OPENING_WIDTH) {
        fail(`门窗宽度不能小于 ${MIN_OPENING_WIDTH} 像素`);
    }
    if (hinge !== 'start' && hinge !== 'end') fail('开启方向无效');

    const wallLength = row.wall === 'top' || row.wall === 'bottom' ? room.width : room.height;
    if (pos + width > wallLength + 0.5) fail('洞口超出墙面长度');

    const conflict = db
        .prepare('SELECT pos, width FROM openings WHERE room_id = ? AND wall = ? AND id != ?')
        .all(row.room_id, row.wall, id)
        .some((other) => pos < other.pos + other.width - 0.5 && other.pos < pos + width - 0.5);
    if (conflict) fail('与同墙其他门窗重叠');

    db.prepare('UPDATE openings SET pos = ?, width = ?, hinge = ? WHERE id = ?').run(
        pos,
        width,
        hinge,
        id,
    );
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
    if (typeof raw !== 'object' || raw === null) fail('储物设备参数无效');
    const roomId = normalizeName(raw.roomId, '房间 id');
    if (!db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId)) fail('房间不存在');
    if (!STORAGE_KINDS.has(raw.kind)) fail('储物设备类型无效');

    const name = normalizeName(raw.name, '储物设备名称');
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM storage').get();
    const id = makeId('storage');
    db.prepare(
        'INSERT INTO storage (id, room_id, name, kind, sort_order) VALUES (?, ?, ?, ?, ?)',
    ).run(id, roomId, name, raw.kind, order.next);
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
        case 'add-storage':
            return addStorage(db, /** @type {Record<string, unknown>} */ (command));
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
