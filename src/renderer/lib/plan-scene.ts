import type { Opening, Rect, Room, WallSide } from '../app/types';
import { bayGeometry, WALL_SIDES, wallSpan, wallSegments, type Line } from './plan-geometry.ts';

export const EXTERIOR_WALL = 14.4; // 240 mm at 60 px/m
export const INTERIOR_WALL = 7.2; // 120 mm
/** 阳台栏杆：100 mm 的细条，比隔墙还薄，远看是一条线而不是一道墙。 */
export const RAILING_THICKNESS = 5;
export const SNAP = 6; // 100 mm
export const MILLIMETERS_PER_PIXEL = 1000 / 60;
const EPSILON = 0.01;

export function boundsOf(rooms: Rect[]): Rect | null {
    if (!rooms.length) return null;
    const x = Math.min(...rooms.map((r) => r.x));
    const y = Math.min(...rooms.map((r) => r.y));
    return {
        x,
        y,
        width: Math.max(...rooms.map((r) => r.x + r.width)) - x,
        height: Math.max(...rooms.map((r) => r.y + r.height)) - y,
    };
}

export function overlapsRoom(rect: Rect, rooms: Room[], except?: string): boolean {
    return rooms.some(
        (r) =>
            r.id !== except &&
            rect.x < r.x + r.width - EPSILON &&
            rect.x + rect.width > r.x + EPSILON &&
            rect.y < r.y + r.height - EPSILON &&
            rect.y + rect.height > r.y + EPSILON,
    );
}

/** Edge snapping wins over the drafting grid, including legacy off-grid coordinates. */
export function snapCoordinate(
    value: number,
    axis: 'x' | 'y',
    rooms: Room[],
    tolerance: number,
): number {
    const candidates = rooms.flatMap((r) =>
        axis === 'x' ? [r.x, r.x + r.width] : [r.y, r.y + r.height],
    );
    const closest = candidates.sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
    return closest !== undefined && Math.abs(closest - value) <= tolerance
        ? closest
        : Math.round(value / SNAP) * SNAP;
}

export interface SceneWall extends Line {
    key: string;
    thickness: number;
    shared: boolean;
    /** 这段只属于户外空间（阳台/露台）的外侧，要画成栏杆而不是实心墙。 */
    outdoor: boolean;
}

interface Edge {
    start: number;
    end: number;
    roomId: string;
}
interface WallLine {
    horizontal: boolean;
    coordinate: number;
    edges: Edge[];
    holes: { pos: number; width: number }[];
}

/** Build a single wall graph. Shared walls are split at T junctions and drawn only once.
 * Openings are subtracted after merging, so the neighbouring room cannot fill them back in.
 * Square caps extend only room corners, never door or window jambs.
 */
export function buildWalls(rooms: Room[]): SceneWall[] {
    const graph = new Map<string, WallLine>();
    const outdoorRooms = new Map(rooms.map((room) => [room.id, room.outdoor]));
    for (const room of rooms)
        for (const side of WALL_SIDES) {
            const span = wallSpan(room, side);
            const horizontal = side === 'top' || side === 'bottom';
            const coordinate = horizontal ? span.y : span.x;
            const start = horizontal ? span.x : span.y;
            const key = `${horizontal ? 'h' : 'v'}:${coordinate}`;
            const line = graph.get(key) ?? { horizontal, coordinate, edges: [], holes: [] };
            line.edges.push({ start, end: start + span.length, roomId: room.id });
            line.holes.push(
                ...room.openings
                    .filter((o) => o.wall === side)
                    .map((o) => ({ pos: start + o.pos, width: o.width })),
            );
            // 整面拆掉的边：把整段当成一个大洞交出去，wallSegments 便一段墙都不产出。
            // 拆墙不区分是谁拆的 —— 一面墙在物理上只有一个，只要一侧宣布拆掉，
            // 这一段的墙体就不存在，隔壁那间自然连通（否则「打通」只打通一半）。
            if (room.openWalls.includes(side)) line.holes.push({ pos: start, width: span.length });
            graph.set(key, line);
        }
    const result: SceneWall[] = [];
    for (const [key, line] of graph) {
        const stops = [...new Set(line.edges.flatMap((e) => [e.start, e.end]))].sort(
            (a, b) => a - b,
        );
        for (let i = 0; i < stops.length - 1; i++) {
            const start = stops[i]!;
            const end = stops[i + 1]!;
            const owners = line.edges.filter((e) => e.start <= start && e.end >= end);
            if (!owners.length) continue;
            const shared = new Set(owners.map((e) => e.roomId)).size > 1;
            // 户外空间朝外的那几面不砌墙：阳台上砌墙就没有阳台了。
            // 只有「独占这段墙的房间全是户外空间」才算，与室内共用的墙照旧砌。
            const outdoor = !shared && owners.every((e) => outdoorRooms.get(e.roomId) === true);
            const thickness = shared ? INTERIOR_WALL : outdoor ? RAILING_THICKNESS : EXTERIOR_WALL;
            const holes = line.holes
                .map((h) => ({
                    pos: Math.max(h.pos, start) - start,
                    width: Math.min(h.pos + h.width, end) - Math.max(h.pos, start),
                }))
                .filter((h) => h.width > 0);
            for (const [j, segment] of wallSegments(end - start, holes).entries()) {
                const a =
                    start +
                    segment.start -
                    (segment.start === 0 &&
                    // 用闭区间：洞口刚好收在这一端时也不能往外扩墙厚，
                    // 否则拆掉的整条墙会在洞口里留一小截伸出来的墙头。
                    !line.holes.some((h) => h.pos <= start && h.pos + h.width >= start)
                        ? thickness / 2
                        : 0);
                const b =
                    start +
                    segment.end +
                    (segment.end === end - start &&
                    !line.holes.some((h) => h.pos < end && h.pos + h.width >= end)
                        ? thickness / 2
                        : 0);
                result.push({
                    key: `${key}:${i}:${j}`,
                    shared,
                    outdoor,
                    thickness,
                    x1: line.horizontal ? a : line.coordinate,
                    y1: line.horizontal ? line.coordinate : a,
                    x2: line.horizontal ? b : line.coordinate,
                    y2: line.horizontal ? line.coordinate : b,
                });
            }
        }
    }
    return result;
}

/**
 * 两条边是不是**同一面物理墙**：共线、同向，而且沿墙有重叠。
 *
 * 门窗的共用墙判断、拆墙的连通判断、墙面能不能凿洞，全用这一套标准，
 * 这样「界面上说这两间房挨着」与「拆墙后真的连通」不会互相打脸。
 */
function samePhysicalWall(a: Room, aSide: WallSide, b: Room, bSide: WallSide): boolean {
    if (a.id === b.id) return false;
    const span = wallSpan(a, aSide);
    const target = wallSpan(b, bSide);
    const along = (target.x - span.x) * span.ux + (target.y - span.y) * span.uy;
    const across = (target.x - span.x) * span.nx + (target.y - span.y) * span.ny;
    return (
        Math.abs(span.ux - target.ux) < EPSILON &&
        Math.abs(across) < EPSILON &&
        along < span.length - EPSILON &&
        along + target.length > EPSILON
    );
}

/** 贴着某条边的邻居房间（可有多个：一堵墙可能同时挨着两间）。 */
export function sideNeighbours(rooms: Room[], room: Room, side: WallSide): Room[] {
    return rooms.filter((other) =>
        WALL_SIDES.some((otherSide) => samePhysicalWall(room, side, other, otherSide)),
    );
}

/**
 * 这面物理墙是不是已经拆掉了。
 *
 * 拆墙不分是谁拆的 —— 一面墙物理上只有一个，只要任意一侧宣布拆掉，这一段就没有墙了。
 * 所以这里不能只看 `room.openWalls`：隔壁拆了墙，自己挂在这面墙上的门窗同样悬空，
 * 画出来就成了飘在半空的门扇。
 */
export function wallIsOpen(rooms: Room[], room: Room, side: WallSide): boolean {
    if (room.openWalls.includes(side)) return true;
    return rooms.some((other) =>
        other.openWalls.some((otherSide) => samePhysicalWall(room, side, other, otherSide)),
    );
}

/**
 * 这间房哪几条边贴着别的房间 —— 也就是「拆掉之后真的会连通」的那几条。
 *
 * 朝室外的墙拆掉只是把家开个口子，看着像图纸漏画了，那种情况应该用门或窗；
 * 所以界面上只把能真正连通两间房的边做成可勾选项。
 */
export function connectableWalls(rooms: Room[], room: Room): WallSide[] {
    return WALL_SIDES.filter((side) => sideNeighbours(rooms, room, side).length > 0);
}

/** All openings on a physical wall, including those owned by an adjacent room. */
export function wallOpenings(
    rooms: Room[],
    room: Rect,
    side: WallSide,
    except?: string,
): { pos: number; width: number }[] {
    const span = wallSpan(room, side);
    const horizontal = span.ux === 1;
    const base = horizontal ? span.x : span.y;
    return rooms.flatMap((other) =>
        other.openings
            .filter((o) => o.id !== except)
            .flatMap((o) => {
                const target = wallSpan(other, o.wall);
                if (
                    target.ux !== span.ux ||
                    Math.abs(horizontal ? target.y - span.y : target.x - span.x) > EPSILON
                )
                    return [];
                const pos = (horizontal ? target.x : target.y) + o.pos - base;
                return pos < span.length && pos + o.width > 0 ? [{ pos, width: o.width }] : [];
            }),
    );
}

export function clampOpening(
    position: number,
    width: number,
    length: number,
    holes: { pos: number; width: number }[],
): number | null {
    if (width > length) return null;
    const desired = Math.min(Math.max(position, 0), length - width);
    const candidates = [
        desired,
        0,
        length - width,
        ...holes.flatMap((h) => [h.pos - width, h.pos + h.width]),
    ]
        .filter((p) => p >= 0 && p + width <= length)
        .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
    return (
        candidates.find(
            (p) => !holes.some((h) => p < h.pos + h.width - EPSILON && p + width > h.pos + EPSILON),
        ) ?? null
    );
}

/**
 * 飘窗必须朝室外凸出，因此它凸出来的那块窗台不能插进别的房间。
 *
 * 隔墙两侧都是室内，把飘窗开在隔墙上，窗台就正好长在邻居家里 —— 画出来是
 * 一块悬空的玻璃盒子卡在两个房间之间。所以除了「这段墙不是共用墙」之外，
 * 还要用真实几何校验一次：窗台矩形和任何别的房间都不许相交。
 */
export function bayFits(rooms: Room[], room: Room, opening: Opening): boolean {
    if (opening.kind !== 'bay') return true;
    return !overlapsRoom(bayGeometry(room, opening).box, rooms, room.id);
}

export function openingFits(room: Room, rect: Rect): boolean {
    return room.openings.every(
        (o: Opening) => o.pos + o.width <= wallSpan(rect, o.wall).length + EPSILON,
    );
}

export interface Dimension {
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    offset: number;
    label: string;
    vertical: boolean;
}

export function dimensionsOf(rooms: Room[]): Dimension[] {
    const bounds = boundsOf(rooms);
    if (!bounds) return [];
    const result: Dimension[] = [];
    for (const vertical of [false, true]) {
        const base = vertical ? bounds.y : bounds.x;
        const end = base + (vertical ? bounds.height : bounds.width);
        const axis = vertical ? bounds.x : bounds.y;
        const stops = [
            ...new Set(
                rooms.flatMap((r) => (vertical ? [r.y, r.y + r.height] : [r.x, r.x + r.width])),
            ),
        ].sort((a, b) => a - b);
        const add = (a: number, b: number, offset: number) =>
            result.push({
                key: `${vertical}:${a}:${b}:${offset}`,
                vertical,
                offset,
                x1: vertical ? axis : a,
                y1: vertical ? a : axis,
                x2: vertical ? axis : b,
                y2: vertical ? b : axis,
                label: String(Math.round((b - a) * MILLIMETERS_PER_PIXEL)),
            });
        if (stops.length > 2)
            for (let i = 0; i < stops.length - 1; i++) add(stops[i]!, stops[i + 1]!, -30);
        add(base, end, -58);
    }
    return result;
}
