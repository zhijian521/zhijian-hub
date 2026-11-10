import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Room } from '../src/renderer/app/types.ts';
import { exampleRooms } from '../src/renderer/features/floor-plan/plan-template.ts';
import { wallSpan } from '../src/renderer/lib/plan-geometry.ts';
import {
    buildWalls,
    clampOpening,
    dimensionsOf,
    EXTERIOR_WALL,
    INTERIOR_WALL,
    openingFits,
    overlapsRoom,
    snapCoordinate,
    wallOpenings,
} from '../src/renderer/lib/plan-scene.ts';

const room = (id: string, x = 0, y = 0, width = 240, height = 180): Room => ({
    id,
    name: id,
    x,
    y,
    width,
    height,
    floor: null,
    openings: [],
});

describe('physical wall graph', () => {
    it('merges the shared wall and subtracts a door from both rooms', () => {
        const a = room('a'),
            b = room('b', 240);
        a.openings = [
            { id: 'door', kind: 'door', wall: 'right', pos: 48, width: 54, hinge: 'start' },
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
            { id: 'window', kind: 'window', wall: 'top', pos: 0, width: 90, hinge: 'start' },
        ];
        const top = buildWalls([a]).find((w) => w.y1 === 0 && w.y2 === 0)!;
        assert.equal(top.x1, 90);
    });
    it('finds neighbouring openings by physical coordinates', () => {
        const a = room('a'),
            b = room('b', 240, 60, 120, 120);
        a.openings = [
            { id: 'door', kind: 'door', wall: 'right', pos: 90, width: 54, hinge: 'start' },
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
            { id: 'door', kind: 'door', wall: 'top', pos: 150, width: 54, hinge: 'start' },
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
