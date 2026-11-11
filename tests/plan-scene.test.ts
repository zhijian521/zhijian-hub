import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Room } from '../src/renderer/app/types.ts';
import { exampleRooms } from '../src/renderer/features/floor-plan/plan-template.ts';
import { wallSpan } from '../src/renderer/lib/plan-geometry.ts';
import {
    bayFits,
    buildWalls,
    connectableWalls,
    clampOpening,
    dimensionsOf,
    EXTERIOR_WALL,
    INTERIOR_WALL,
    RAILING_THICKNESS,
    openingFits,
    overlapsRoom,
    snapCoordinate,
    wallIsOpen,
    wallOpenings,
} from '../src/renderer/lib/plan-scene.ts';

const room = (id: string, x = 0, y = 0, width = 240, height = 180, outdoor = false): Room => ({
    id,
    name: id,
    x,
    y,
    width,
    height,
    floor: null,
    outdoor,
    openWalls: [],
    openings: [],
});

describe('physical wall graph', () => {
    it('merges the shared wall and subtracts a door from both rooms', () => {
        const a = room('a'),
            b = room('b', 240);
        a.openings = [
            {
                id: 'door',
                kind: 'door',
                wall: 'right',
                pos: 48,
                width: 54,
                hinge: 'start',
                swing: 'in' as const,
                depth: 26,
            },
        ];
        const walls = buildWalls([a, b]);
        const shared = walls.filter((w) => w.shared);
        assert.equal(shared.length, 2);
        assert.ok(
            shared.every((w) => w.thickness === INTERIOR_WALL && w.x1 === 240 && w.x2 === 240),
        );
        assert.equal(shared[0]!.y2, 48, 'jamb is not extended into door');
        assert.equal(shared[1]!.y1, 102);
        assert.ok(walls.filter((w) => !w.shared).every((w) => w.thickness === EXTERIOR_WALL));
    });
    it('splits a partially shared wall at a T junction', () => {
        const walls = buildWalls([room('a'), room('b', 240, 60, 120, 120)]);
        const right = walls.filter((w) => w.x1 === 240 && w.x2 === 240);
        assert.equal(right.length, 2);
        assert.equal(right.find((w) => w.shared)?.thickness, INTERIOR_WALL);
        assert.equal(right.find((w) => !w.shared)?.thickness, EXTERIOR_WALL);
    });
    it('keeps an opening flush to the corner fully clear', () => {
        const a = room('a');
        a.openings = [
            {
                id: 'window',
                kind: 'window',
                wall: 'top',
                pos: 0,
                width: 90,
                hinge: 'start',
                swing: 'in' as const,
                depth: 26,
            },
        ];
        const top = buildWalls([a]).find((w) => w.y1 === 0 && w.y2 === 0)!;
        assert.equal(top.x1, 90);
    });
    it('finds neighbouring openings by physical coordinates', () => {
        const a = room('a'),
            b = room('b', 240, 60, 120, 120);
        a.openings = [
            {
                id: 'door',
                kind: 'door',
                wall: 'right',
                pos: 90,
                width: 54,
                hinge: 'start',
                swing: 'in' as const,
                depth: 26,
            },
        ];
        assert.deepEqual(wallOpenings([a, b], b, 'left'), [{ pos: 30, width: 54 }]);
        assert.deepEqual(wallOpenings([a, b], b, 'left', 'door'), []);
    });
});

describe('drafting constraints', () => {
    it('offers a non-overlapping sample with every room reachable through a door', () => {
        const rooms = exampleRooms();
        const visited = new Set(['sample-entrance']);
        const connections = rooms.flatMap((r) =>
            r.openings
                .filter((o) => o.kind === 'door')
                .flatMap((o) => {
                    const span = wallSpan(r, o.wall);
                    const x = span.x + span.ux * (o.pos + o.width / 2) - span.nx;
                    const y = span.y + span.uy * (o.pos + o.width / 2) - span.ny;
                    const neighbour = rooms.find(
                        (other) =>
                            other.id !== r.id &&
                            x > other.x &&
                            x < other.x + other.width &&
                            y > other.y &&
                            y < other.y + other.height,
                    );
                    return neighbour ? [[r.id, neighbour.id]] : [];
                }),
        );
        for (let i = 0; i < rooms.length; i++)
            for (const [a, b] of connections) {
                if (visited.has(a!)) visited.add(b!);
                if (visited.has(b!)) visited.add(a!);
            }
        assert.equal(visited.size, rooms.length);
        for (const r of rooms) {
            assert.equal(overlapsRoom(r, rooms, r.id), false);
            assert.equal(openingFits(r, r), true);
        }
    });
    it('snaps to off-grid legacy edges before using the 100 mm grid', () => {
        assert.equal(snapCoordinate(102, 'x', [room('a', 101)], 8), 101);
        assert.equal(snapCoordinate(90, 'x', [], 8), 90);
    });
    it('allows shared boundaries but rejects overlapping floors', () => {
        assert.equal(overlapsRoom(room('b', 240), [room('a')]), false);
        assert.equal(overlapsRoom(room('b', 239), [room('a')]), true);
        assert.equal(overlapsRoom(room('a'), [room('a')], 'a'), false);
    });
    it('keeps holes inside walls while moving and rejects impossible sizes', () => {
        assert.equal(clampOpening(90, 54, 180, [{ pos: 90, width: 54 }]), 36);
        assert.equal(clampOpening(0, 200, 180, []), null);
        const a = room('a');
        a.openings = [
            {
                id: 'door',
                kind: 'door',
                wall: 'top',
                pos: 150,
                width: 54,
                hinge: 'start',
                swing: 'in' as const,
                depth: 26,
            },
        ];
        assert.equal(openingFits(a, { ...a, width: 180 }), false);
    });
    it('reports millimeter dimension chains and handles negative origins', () => {
        const dimensions = dimensionsOf([room('a', -120), room('b', 120, 0, 120)]);
        assert.equal(dimensions.find((d) => !d.vertical && d.offset === -58)?.label, '6000');
        assert.deepEqual(
            dimensions.filter((d) => !d.vertical && d.offset === -30).map((d) => d.label),
            ['4000', '2000'],
        );
        assert.deepEqual(dimensionsOf([]), []);
    });
});

describe('outdoor rooms', () => {
    it('阳台朝外的那几面墙按栏杆厚度画', () => {
        const walls = buildWalls([room('balcony', 0, 0, 240, 180, true)]);
        assert.ok(walls.length > 0);
        assert.ok(walls.every((w) => w.outdoor));
        assert.ok(walls.every((w) => w.thickness === RAILING_THICKNESS));
    });

    it('阳台与室内共用的墙仍是实心隔墙', () => {
        const walls = buildWalls([room('balcony', 0, 0, 240, 180, true), room('living', 240)]);
        const shared = walls.filter((w) => w.shared);
        assert.equal(shared.length, 1);
        assert.equal(shared[0]!.thickness, INTERIOR_WALL);
        assert.equal(shared[0]!.outdoor, false);
        // 阳台自己另外三面朝外，仍画栏杆。
        assert.equal(walls.filter((w) => w.outdoor).length, 3);
    });

    it('两个阳台贴在一起时共用的仍是隔墙，不画成两道栏杆', () => {
        const walls = buildWalls([
            room('balcony-a', 0, 0, 240, 180, true),
            room('balcony-b', 240, 0, 240, 180, true),
        ]);
        const shared = walls.filter((w) => w.shared);
        assert.equal(shared.length, 1);
        assert.equal(shared[0]!.thickness, INTERIOR_WALL);
        assert.equal(shared[0]!.outdoor, false);
    });
});

describe('bay placement', () => {
    const bay = (
        wall: 'top' | 'right' | 'bottom' | 'left',
        pos: number,
        width = 120,
        depth = 26,
    ) => ({
        id: 'bay',
        kind: 'bay' as const,
        wall,
        pos,
        width,
        hinge: 'start' as const,
        swing: 'in' as const,
        depth,
    });

    it('贴外墙的飘窗放行', () => {
        const only = room('bed', 0, 0, 300, 240);
        assert.equal(bayFits([only], only, bay('top', 90)), true);
    });

    it('开在隔墙上的飘窗会被拦下 —— 窗台会凸进隔壁房间', () => {
        const a = room('a', 0, 0, 240, 180);
        const b = room('b', 240, 0, 240, 180);
        // a 的右墙与 b 的左墙是同一面墙，飘窗凸出去正好落在 b 里。
        assert.equal(bayFits([a, b], a, bay('right', 30)), false);
        assert.equal(bayFits([a, b], b, bay('left', 30)), false);
    });

    it('普通窗不受这条限制：开在隔墙上合法（那是室内窗/垭口）', () => {
        const a = room('a', 0, 0, 240, 180);
        const b = room('b', 240, 0, 240, 180);
        const opening = {
            id: 'w',
            kind: 'window' as const,
            wall: 'right' as const,
            pos: 30,
            width: 90,
            hinge: 'start' as const,
            swing: 'in' as const,
            depth: 26,
        };
        assert.equal(bayFits([a, b], a, opening), true);
    });

    it('进深越大越容易撞到隔壁：bayFits 读的是这一个飘窗自己的进深', () => {
        const a = room('a', 0, 0, 240, 180);
        // 楼上那间与 a 的顶墙之间留 30px 空隙（above 占 -210 ~ -30）
        const above = room('above', 0, -210, 240, 180);
        // 26px 的出挑够不到 above，放行
        assert.equal(bayFits([a, above], a, bay('top', 40, 120, 26)), true);
        // 40px 的出挑跨过 -30 这条边，拦下
        assert.equal(bayFits([a, above], a, bay('top', 40, 120, 40)), false);
    });

    it('上下相邻时同理，横墙上的飘窗会插进楼上/楼下', () => {
        const a = room('a', 0, 0, 240, 180);
        const b = room('b', 0, 180, 240, 180);
        assert.equal(bayFits([a, b], a, bay('bottom', 40)), false);
    });
});

/*============================================================================
  拆墙（openWalls）

  一间房宣布某条边拆掉，物理上那堵墙就不该再存在 —— 连同隔壁那侧的墙一起，
  否则「打通」只打通一半，邻居家里还立着一堵看不见对面的墙。
============================================================================*/

describe('open walls', () => {
    const pair = (openWalls: Room['openWalls']): Room[] => [
        { ...room('a', 0, 0, 240, 180), openWalls },
        room('b', 240, 0, 240, 180),
    ];

    it('拆掉的边一段墙都不产出，隔壁那侧也跟着消失', () => {
        const walls = buildWalls(pair(['right']));
        // x=240 那条共线墙被房 a 整条挖空：物理上墙只有一个，一侧宣布拆掉就没有了。
        assert.equal(walls.filter((wall) => Math.abs(wall.x1 - 240) < 0.01).length, 0);
        // 两间房的上下外轮廓照旧。
        assert.equal(walls.filter((wall) => Math.abs(wall.y1 - wall.y2) < 0.01).length, 4);
    });

    it('只在自己那一段上挖空：邻居的顶墙还在', () => {
        const open = buildWalls(pair(['top']));
        const top = open.filter((wall) => Math.abs(wall.y1) < 0.01);
        // 房 a 的顶墙（x 0–240）没了，只剩房 b 的那段（240–480）。
        assert.equal(top.length, 1);
        assert.ok(Math.min(top[0]!.x1, top[0]!.x2) >= 240 - 0.01);
        // 一条边都没拆时，顶墙横贯 480（在 x=240 的丁字路口被切成两段，合起来是整条）。
        const intact = buildWalls(pair([])).filter((wall) => Math.abs(wall.y1) < 0.01);
        const lo = Math.min(...intact.flatMap((wall) => [wall.x1, wall.x2]));
        const hi = Math.max(...intact.flatMap((wall) => [wall.x1, wall.x2]));
        assert.ok(intact.length >= 1);
        assert.ok(hi - lo > 480);
    });

    it('connectableWalls 只给出真的贴着邻居的边', () => {
        const rooms = pair([]);
        assert.deepEqual(connectableWalls(rooms, rooms[0]!), ['right']);
        assert.deepEqual(connectableWalls(rooms, rooms[1]!), ['left']);
    });

    it('隔壁拆了墙，自己这面墙上的门窗同样算悬空', () => {
        // 墙只有一个：b 宣布拆掉 left，a 的 right 也就没有了。
        const rooms = pair([]);
        rooms[1] = { ...rooms[1]!, openWalls: ['left'] };
        assert.equal(wallIsOpen(rooms, rooms[0]!, 'right'), true);
        assert.equal(wallIsOpen(rooms, rooms[0]!, 'top'), false);
        // 自己拆的那面当然也算
        const self = pair(['right']);
        assert.equal(wallIsOpen(self, self[0]!, 'right'), true);
    });

    it('朝室外的边不算可打通：四周没邻居时为空', () => {
        const lonely = [room('solo')];
        assert.deepEqual(connectableWalls(lonely, lonely[0]!), []);
    });
});
