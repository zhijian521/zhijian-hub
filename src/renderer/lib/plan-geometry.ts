/*============================================================================
  plan-geometry — 户型图的纯几何计算

  房间矩形存的是墙的中心线。所有位置计算都从「起点 + 沿墙偏移」出发，
  这样房间移动、缩放时门窗自动跟随，不需要改动洞口自身的坐标。

  这里不碰 DOM、不碰状态，只吃数字吐数字，便于单测覆盖。
============================================================================*/

import type { FloorMaterial, Opening, Rect, Room, WallSide } from '@/app/types';

/** 四面墙的固定顺序，渲染与校验共用，避免各处各写一份数组。 */
export const WALL_SIDES: WallSide[] = ['top', 'right', 'bottom', 'left'];

/** 墙的参考系：起点、沿墙单位向量 u、指向室内的单位法向 n、长度。 */
export interface WallSpan {
    x: number;
    y: number;
    ux: number;
    uy: number;
    nx: number;
    ny: number;
    length: number;
}

/**
 * 取一面墙的参考系。
 * top/bottom 从左端起算，left/right 从上端起算；法向一律指向房间内部。
 */
export function wallSpan(room: Rect, wall: WallSide): WallSpan {
    const { x, y, width, height } = room;
    switch (wall) {
        case 'top':
            return { x, y, ux: 1, uy: 0, nx: 0, ny: 1, length: width };
        case 'right':
            return { x: x + width, y, ux: 0, uy: 1, nx: -1, ny: 0, length: height };
        case 'bottom':
            return { x, y: y + height, ux: 1, uy: 0, nx: 0, ny: -1, length: width };
        case 'left':
            return { x, y, ux: 0, uy: 1, nx: 1, ny: 0, length: height };
    }
}

export interface WallSegment {
    start: number;
    end: number;
}

/**
 * 把一面墙按门窗切成若干墙段。
 * 洞口之间、洞口与墙端之间的部分保留为实墙；洞口覆盖的区间不再画墙。
 */
export function wallSegments(
    length: number,
    holes: Array<{ pos: number; width: number }>,
): WallSegment[] {
    const sorted = [...holes].sort((a, b) => a.pos - b.pos);
    const segments: WallSegment[] = [];
    let cursor = 0;

    for (const hole of sorted) {
        if (hole.pos > cursor) segments.push({ start: cursor, end: Math.min(hole.pos, length) });
        cursor = Math.max(cursor, hole.pos + hole.width);
    }
    if (cursor < length) segments.push({ start: cursor, end: length });

    return segments.filter((segment) => segment.end - segment.start > 0.5);
}

/**
 * 以 (cx, cy) 为圆心、从 (x1, y1) 到 (x2, y2) 的圆弧路径。
 *
 * sweep 标志由角度差的正负决定：SVG 坐标 y 向下，角度增大即视觉顺时针，
 * 对应 sweep=1。写成通用计算而不是按八种情况硬编码，避免方向判断出错。
 */
export function arcPath(
    cx: number,
    cy: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): string {
    const a1 = Math.atan2(y1 - cy, x1 - cx);
    const a2 = Math.atan2(y2 - cy, x2 - cx);

    let delta = a2 - a1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const sweep = delta > 0 ? 1 : 0;
    const radius = Math.hypot(x1 - cx, y1 - cy);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 ${sweep} ${x2} ${y2}`;
}

export interface Point {
    x: number;
    y: number;
}

export interface DoorGeometry {
    /** 铰链点 */
    hinge: Point;
    /** 门扇末端：从铰链垂直伸进房间 */
    leaf: Point;
    /** 门开启的扫掠弧线 */
    arc: string;
}

/**
 * 门的几何：铰链落在洞口一端，门扇垂直伸进房间，扫掠弧连到洞口另一端。
 * 门一律朝室内开 —— 这是住宅的常态，也省掉了额外一个开向开关。
 */
export function doorGeometry(room: Rect, opening: Opening): DoorGeometry {
    const span = wallSpan(room, opening.wall);
    const start = { x: span.x + span.ux * opening.pos, y: span.y + span.uy * opening.pos };
    const end = {
        x: start.x + span.ux * opening.width,
        y: start.y + span.uy * opening.width,
    };

    const hinge = opening.hinge === 'end' ? end : start;
    const far = opening.hinge === 'end' ? start : end;
    const leaf = {
        x: hinge.x + span.nx * opening.width,
        y: hinge.y + span.ny * opening.width,
    };

    return { hinge, leaf, arc: arcPath(hinge.x, hinge.y, leaf.x, leaf.y, far.x, far.y) };
}

export interface Line {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * 洞口在墙上的矩形范围：沿墙方向是洞宽，垂直方向是墙厚，中心线与墙重合。
 * 用来铺洞口底色（不然墙被切开后会露出画布点阵，像破了个洞）。
 */
export function openingBox(room: Rect, opening: Opening, thickness: number): Rect {
    const span = wallSpan(room, opening.wall);
    const along = {
        x: span.x + span.ux * opening.pos,
        y: span.y + span.uy * opening.pos,
    };

    if (opening.wall === 'top' || opening.wall === 'bottom') {
        return { x: along.x, y: along.y - thickness / 2, width: opening.width, height: thickness };
    }
    return { x: along.x - thickness / 2, y: along.y, width: thickness, height: opening.width };
}

/**
 * 窗的画法：墙洞内三条平行细线，分别贴在墙的内侧、中线、外侧，
 * 视觉上就是建筑图里常见的「双线窗」。
 */
export function windowLines(room: Rect, opening: Opening, thickness: number): Line[] {
    const span = wallSpan(room, opening.wall);
    const start = { x: span.x + span.ux * opening.pos, y: span.y + span.uy * opening.pos };
    const end = {
        x: start.x + span.ux * opening.width,
        y: start.y + span.uy * opening.width,
    };

    return [-thickness / 2, 0, thickness / 2].map((distance) => ({
        x1: start.x + span.nx * distance,
        y1: start.y + span.ny * distance,
        x2: end.x + span.nx * distance,
        y2: end.y + span.ny * distance,
    }));
}

/*== 八方向缩放 ==*/

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * 按方向缩放矩形。朝西/朝北拖动时左上角跟着移动、尺寸反向变化；
 * 任一维度触到最小值就夹住，不允许翻转成负尺寸。
 */
export function resizeRect(base: Rect, dir: ResizeDir, dx: number, dy: number, min: number): Rect {
    let { x, y, width, height } = base;

    if (dir.includes('w')) {
        const next = width - dx;
        if (next >= min) {
            x += dx;
            width = next;
        } else {
            x = base.x + base.width - min;
            width = min;
        }
    }
    if (dir.includes('e')) {
        width = Math.max(min, width + dx);
    }
    if (dir.includes('n')) {
        const next = height - dy;
        if (next >= min) {
            y += dy;
            height = next;
        } else {
            y = base.y + base.height - min;
            height = min;
        }
    }
    if (dir.includes('s')) {
        height = Math.max(min, height + dy);
    }

    return { x, y, width, height };
}

/**
 * 为一扇门窗找落位：优先居中，居中会与已有洞口重叠时顺延到第一个空位。
 * 返回 null 表示这面墙放不下。
 */
export function placeOpening(
    length: number,
    width: number,
    holes: Array<{ pos: number; width: number }>,
): number | null {
    if (width > length) return null;

    const overlaps = (pos: number) =>
        holes.some((hole) => pos < hole.pos + hole.width - 0.5 && hole.pos < pos + width - 0.5);

    const center = (length - width) / 2;
    if (!overlaps(center)) return center;

    const sorted = [...holes].sort((a, b) => a.pos - b.pos);
    let cursor = 0;
    for (const hole of sorted) {
        if (hole.pos - cursor >= width) return cursor;
        cursor = Math.max(cursor, hole.pos + hole.width);
    }
    return length - cursor >= width ? cursor : null;
}

/*== 地面材质 ==*/

/**
 * 按房间名推断地面材质：卧室与书房木地板，厨卫小砖，其余（客厅、餐厅、过道）大砖。
 * 名字本身就是用途说明，因此没手动指定时不需要额外存材质。
 */
export function floorMaterial(name: string): FloorMaterial {
    if (/卧|书房|儿童房|衣帽间/.test(name)) return 'wood';
    if (/卫|厕|厨/.test(name)) return 'small';
    return 'tile';
}

/** 房间实际使用的地面材质：手动指定优先，否则按名字推断。 */
export function resolveFloor(room: Room): FloorMaterial {
    return room.floor ?? floorMaterial(room.name);
}

/*== 命中测试 ==*/

export interface WallHit {
    wall: WallSide;
    /** 命中点沿墙的偏移，已夹到 [0, 墙长]。 */
    along: number;
}

/**
 * 判断某个点落在房间的哪面墙上，用于「在墙上双击开门窗」。
 * 取垂直距离最近且在容差内的那面墙，转角处取最近的一面，结果稳定。
 */
export function hitWall(room: Rect, x: number, y: number, tolerance: number): WallHit | null {
    let best: { wall: WallSide; along: number; distance: number } | null = null;

    for (const wall of WALL_SIDES) {
        const span = wallSpan(room, wall);
        const dx = x - span.x;
        const dy = y - span.y;
        const along = dx * span.ux + dy * span.uy;
        const across = Math.abs(dx * span.nx + dy * span.ny);

        if (along < -tolerance || along > span.length + tolerance) continue;
        if (across > tolerance) continue;
        if (best && across >= best.distance) continue;

        best = { wall, along: Math.min(Math.max(along, 0), span.length), distance: across };
    }

    return best ? { wall: best.wall, along: best.along } : null;
}
