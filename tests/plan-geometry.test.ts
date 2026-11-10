import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    arcPath,
    doorGeometry,
    floorMaterial,
    hitWall,
    openingBox,
    placeOpening,
    resizeRect,
    resolveFloor,
    wallSegments,
    wallSpan,
    windowLines,
} from '../src/renderer/lib/plan-geometry.ts';
import type { Opening, Rect, Room } from '../src/renderer/app/types.ts';

/*============================================================================
  plan-geometry — 户型图的几何规则

  这些函数一旦算错，画出来的墙会断、门会朝外开、缩放会翻转，
  而且肉眼很难一眼看出是哪一个环节错了。所以逐条固定。
============================================================================*/

const ROOM: Rect = { x: 100, y: 100, width: 300, height: 200 };

function opening(patch: Partial<Opening>): Opening {
    return {
        id: 'o1',
        kind: 'door',
        wall: 'top',
        pos: 100,
        width: 54,
        hinge: 'start',
        ...patch,
    };
}

describe('wallSpan', () => {
    it('四方向的起点、长度与法向都指向室内', () => {
        const top = wallSpan(ROOM, 'top');
        assert.deepEqual([top.x, top.y, top.length], [100, 100, 300]);
        assert.deepEqual([top.nx, top.ny], [0, 1], '顶墙法向朝下，即室内');

        const right = wallSpan(ROOM, 'right');
        assert.deepEqual([right.x, right.y, right.length], [400, 100, 200]);
        assert.deepEqual([right.nx, right.ny], [-1, 0], '右墙法向朝左');

        const bottom = wallSpan(ROOM, 'bottom');
        assert.deepEqual([bottom.x, bottom.y, bottom.length], [100, 300, 300]);
        assert.deepEqual([bottom.nx, bottom.ny], [0, -1], '底墙法向朝上');

        const left = wallSpan(ROOM, 'left');
        assert.deepEqual([left.x, left.y, left.length], [100, 100, 200]);
        assert.deepEqual([left.nx, left.ny], [1, 0], '左墙法向朝右');
    });
});

describe('wallSegments', () => {
    it('没有洞口时是一整段', () => {
        assert.deepEqual(wallSegments(300, []), [{ start: 0, end: 300 }]);
    });

    it('一个洞口切成两段', () => {
        assert.deepEqual(wallSegments(300, [{ pos: 100, width: 54 }]), [
            { start: 0, end: 100 },
            { start: 154, end: 300 },
        ]);
    });

    it('多个洞口按位置排序，不依赖传入顺序', () => {
        assert.deepEqual(
            wallSegments(300, [
                { pos: 200, width: 40 },
                { pos: 100, width: 54 },
            ]),
            [
                { start: 0, end: 100 },
                { start: 154, end: 200 },
                { start: 240, end: 300 },
            ],
        );
    });

    it('洞口贴着墙端时不产生零长度墙段', () => {
        assert.deepEqual(wallSegments(300, [{ pos: 0, width: 60 }]), [{ start: 60, end: 300 }]);
        assert.deepEqual(wallSegments(300, [{ pos: 240, width: 60 }]), [{ start: 0, end: 240 }]);
    });

    it('洞口占满整面墙时没有墙段', () => {
        assert.deepEqual(wallSegments(60, [{ pos: 0, width: 60 }]), []);
    });
});

describe('arcPath', () => {
    it('从正下方扫到正右方是逆时针，sweep 为 0', () => {
        const path = arcPath(0, 0, 0, 54, 54, 0);
        assert.match(path, /^M 0 54 A 54 54 0 0 0 54 0$/);
    });

    it('从正右方扫到正下方是顺时针，sweep 为 1', () => {
        const path = arcPath(0, 0, 54, 0, 0, 54);
        assert.match(path, /A 54 54 0 0 1 0 54$/);
    });
});

describe('doorGeometry', () => {
    it('门扇一律伸向室内，铰链落在洞口起点', () => {
        const top = doorGeometry(ROOM, opening({ wall: 'top' }));
        assert.deepEqual(top.hinge, { x: 200, y: 100 });
        assert.deepEqual(top.leaf, { x: 200, y: 154 }, '顶墙朝下开');

        const bottom = doorGeometry(ROOM, opening({ wall: 'bottom' }));
        assert.deepEqual(bottom.hinge, { x: 200, y: 300 });
        assert.deepEqual(bottom.leaf, { x: 200, y: 246 }, '底墙朝上开');

        const left = doorGeometry(ROOM, opening({ wall: 'left' }));
        assert.deepEqual(left.hinge, { x: 100, y: 200 });
        assert.deepEqual(left.leaf, { x: 154, y: 200 }, '左墙朝右开');

        const right = doorGeometry(ROOM, opening({ wall: 'right' }));
        assert.deepEqual(right.hinge, { x: 400, y: 200 });
        assert.deepEqual(right.leaf, { x: 346, y: 200 }, '右墙朝左开');
    });

    it('铰链换到另一端时门扇贴另一侧墙', () => {
        const door = doorGeometry(ROOM, opening({ wall: 'top', hinge: 'end' }));
        assert.deepEqual(door.hinge, { x: 254, y: 100 }, '铰链在洞口终点');
        assert.deepEqual(door.leaf, { x: 254, y: 154 });
    });
});

describe('windowLines', () => {
    it('三条线分别落在墙的内侧、中线、外侧', () => {
        const lines = windowLines(ROOM, opening({ kind: 'window', wall: 'top' }), 12);
        assert.equal(lines.length, 3);
        assert.deepEqual(
            lines.map((line) => line.y1),
            [94, 100, 106],
        );
        assert.deepEqual(
            lines.map((line) => line.x1),
            [200, 200, 200],
        );
    });
});

describe('openingBox', () => {
    it('横墙洞口的高是墙厚，竖墙洞口的宽是墙厚', () => {
        assert.deepEqual(openingBox(ROOM, opening({ wall: 'top' }), 12), {
            x: 200,
            y: 94,
            width: 54,
            height: 12,
        });
        assert.deepEqual(openingBox(ROOM, opening({ wall: 'right', pos: 40 }), 12), {
            x: 394,
            y: 140,
            width: 12,
            height: 54,
        });
    });
});

describe('resizeRect', () => {
    const base: Rect = { x: 100, y: 100, width: 200, height: 200 };

    it('向东只改宽，向西同时移动左边', () => {
        assert.deepEqual(resizeRect(base, 'e', 40, 0, 60), {
            x: 100,
            y: 100,
            width: 240,
            height: 200,
        });
        assert.deepEqual(resizeRect(base, 'w', 40, 0, 60), {
            x: 140,
            y: 100,
            width: 160,
            height: 200,
        });
    });

    it('西北角同时改两个方向', () => {
        assert.deepEqual(resizeRect(base, 'nw', -40, -40, 60), {
            x: 60,
            y: 60,
            width: 240,
            height: 240,
        });
    });

    it('触到最小尺寸就夹住，不翻转成负尺寸', () => {
        const shrunk = resizeRect(base, 'w', 500, 0, 60);
        assert.equal(shrunk.width, 60);
        assert.equal(shrunk.x, 240, '右边固定不动');
    });
});

describe('placeOpening', () => {
    it('空墙居中放置', () => {
        assert.equal(placeOpening(300, 54, []), 123);
    });

    it('居中撞到已有洞口时顺延到最前面的空位', () => {
        assert.equal(placeOpening(300, 54, [{ pos: 100, width: 100 }]), 0);
    });

    it('放不下返回 null', () => {
        assert.equal(placeOpening(60, 90, []), null);
    });
});

describe('floorMaterial', () => {
    it('按房间用途选材质', () => {
        assert.equal(floorMaterial('主卧'), 'wood');
        assert.equal(floorMaterial('书房'), 'wood');
        assert.equal(floorMaterial('客厅'), 'tile');
        assert.equal(floorMaterial('卫生间'), 'small');
        assert.equal(floorMaterial('厨房'), 'small');
        assert.equal(floorMaterial('房间 1'), 'tile');
    });
});

describe('hitWall', () => {
    it('点在墙上时返回该墙与沿墙偏移', () => {
        assert.deepEqual(hitWall(ROOM, 200, 103, 10), { wall: 'top', along: 100 });
        assert.deepEqual(hitWall(ROOM, 102, 180, 10), { wall: 'left', along: 80 });
        assert.deepEqual(hitWall(ROOM, 380, 302, 10), { wall: 'bottom', along: 280 });
        assert.deepEqual(hitWall(ROOM, 398, 220, 10), { wall: 'right', along: 120 });
    });

    it('离所有墙都远时返回 null', () => {
        assert.equal(hitWall(ROOM, 250, 200, 10), null);
    });

    it('转角处取最近的一面墙，结果稳定不跳变', () => {
        const hit = hitWall(ROOM, 102, 100, 10);
        assert.ok(hit);
        assert.ok(['top', 'left'].includes(hit.wall));
    });
});

describe('resolveFloor', () => {
    const base: Room = {
        id: 'r1',
        name: '主卧',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        floor: null,
        openings: [],
    };

    it('未指定时按房间名推断', () => {
        assert.equal(resolveFloor(base), 'wood');
        assert.equal(resolveFloor({ ...base, name: '厨房' }), 'small');
        assert.equal(resolveFloor({ ...base, name: '客厅' }), 'tile');
    });

    it('手动指定优先于房间名', () => {
        assert.equal(resolveFloor({ ...base, floor: 'tile' }), 'tile');
        assert.equal(resolveFloor({ ...base, name: '客厅', floor: 'wood' }), 'wood');
    });
});
