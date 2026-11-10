<script setup lang="ts">
import { computed } from 'vue';
import type { Rect, Room, WallSide } from '@/app/types';
import {
    doorGeometry,
    openingBox,
    resolveFloor,
    wallSpan,
    windowLines,
    WALL_SIDES,
} from '@/lib/plan-geometry';
import { buildWalls, dimensionsOf, EXTERIOR_WALL, INTERIOR_WALL } from '@/lib/plan-scene';
import { roomArea } from '@/stores/floor-plan';

const props = withDefaults(
    defineProps<{ rooms: Room[]; dimensions?: boolean; materials?: boolean }>(),
    { dimensions: true, materials: false },
);
const walls = computed(() => buildWalls(props.rooms));
const dimensions = computed(() => dimensionsOf(props.rooms));
const openings = computed(() =>
    props.rooms.flatMap((room) =>
        room.openings.map((opening) => {
            const span = wallSpan(room, opening.wall);
            const shared = props.rooms.some(
                (r) =>
                    r.id !== room.id &&
                    WALL_SIDES.some((side) => {
                        const other = wallSpan(r, side);
                        const along = (other.x - span.x) * span.ux + (other.y - span.y) * span.uy;
                        const across = (other.x - span.x) * span.nx + (other.y - span.y) * span.ny;
                        return (
                            span.ux === other.ux &&
                            Math.abs(across) < 0.01 &&
                            along < opening.pos + opening.width &&
                            along + other.length > opening.pos
                        );
                    }),
            );
            const thickness = shared ? INTERIOR_WALL : EXTERIOR_WALL;
            return {
                room,
                opening,
                box: openingBox(room, opening, thickness),
                door: doorGeometry(room, opening),
                panes: windowLines(room, opening, thickness),
                jambs: jambsOf(openingBox(room, opening, thickness), opening.wall),
            };
        }),
    ),
);
const ticks = (x: number, y: number) => `M ${x - 3} ${y + 4} l 6 -8`;

/**
 * 洞口两侧的墙垛断面：垂直于墙、长度等于墙厚的两根短线。
 * 少了这两笔，门洞和窗洞看起来就是墙上「缺了一块」，而不是被切开的洞口。
 */
function jambsOf(box: Rect, wall: WallSide) {
    const horizontal = wall === 'top' || wall === 'bottom';
    return horizontal
        ? [
              { x1: box.x, y1: box.y, x2: box.x, y2: box.y + box.height },
              {
                  x1: box.x + box.width,
                  y1: box.y,
                  x2: box.x + box.width,
                  y2: box.y + box.height,
              },
          ]
        : [
              { x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y },
              {
                  x1: box.x,
                  y1: box.y + box.height,
                  x2: box.x + box.width,
                  y2: box.y + box.height,
              },
          ];
}
</script>

<template>
    <!--
        图纸里的文字用行内 font-family 而不是 CSS 变量：这份 SVG 会被序列化导出成独立文件，
        导出后没有 CSS 上下文，只有写在属性上的字体栈才能跟着走。
        字体栈与 --font-sans 保持一致；导出文件在没装文楷的机器上会退到系统中文黑体。

        所有 pattern 都在 userSpaceOnUse 下按 60px = 1m 的真实尺寸定义：
        木地板板宽 0.15 m、800 砖 48px、300 小砖 18px，缩放画布时材质跟着一起放大，
        量出来的纹理密度就是真实的铺装密度。
    -->
    <g
        data-plan-drawing="true"
        font-family="'LXGW WenKai Screen', 'Microsoft YaHei', 'PingFang SC', sans-serif"
    >
        <defs>
            <!-- 木地板：橡木直铺，板宽 9px(0.15m)、板长 60px(1m)，四行一循环并错缝。 -->
            <pattern id="plan-wood" width="60" height="36" patternUnits="userSpaceOnUse">
                <rect width="60" height="36" fill="#f0e7d8" />
                <path d="M0 9H60M0 18H60M0 27H60" fill="none" stroke="#dbcab2" stroke-width="0.7" />
                <path
                    d="M18 0V9M42 9V18M6 18V27M30 27V36"
                    fill="none"
                    stroke="#e2d4bf"
                    stroke-width="0.6"
                />
                <path
                    d="M6 4.5h22M34 13.5h18M11 22.5h26M41 31.5h14M24 4.5h12"
                    fill="none"
                    stroke="#e9dfcd"
                    stroke-width="0.5"
                />
            </pattern>

            <!-- 大砖：800×800，砖缝 1px，内圈一道高光让砖面有厚度。 -->
            <pattern id="plan-tile" width="48" height="48" patternUnits="userSpaceOnUse">
                <rect width="48" height="48" fill="#f6f5ef" />
                <path d="M0 48V0H48" fill="none" stroke="#dcdcd2" stroke-width="1" />
                <path d="M0.9 48V0.9H48" fill="none" stroke="#fdfdfa" stroke-width="0.8" />
            </pattern>

            <!-- 小方砖：300×300，厨卫常用。 -->
            <pattern id="plan-small" width="18" height="18" patternUnits="userSpaceOnUse">
                <rect width="18" height="18" fill="#eef4f0" />
                <path d="M0 18V0H18" fill="none" stroke="#d2ddd5" stroke-width="0.8" />
                <path d="M0.7 18V0.7H18" fill="none" stroke="#f8fbf9" stroke-width="0.6" />
            </pattern>

            <!-- 大理石：800×800 大板 + 淡灰纹路，纹路故意不接缝，重复时看起来是天然石。 -->
            <pattern id="plan-marble" width="48" height="48" patternUnits="userSpaceOnUse">
                <rect width="48" height="48" fill="#f8f8f5" />
                <path
                    d="M0 14c6 3 9-2 15 1s7 6 13 4 9-5 14-2M4 40c5-4 10 2 15-1s8-7 13-4 8 5 14 2M-2 28c7 2 10-4 16-1"
                    fill="none"
                    stroke="#e6e7e1"
                    stroke-width="1.1"
                />
                <path
                    d="M9 2c3 5-1 8 2 13s6 6 3 12"
                    fill="none"
                    stroke="#ecede7"
                    stroke-width="0.7"
                />
                <path d="M0 48V0H48" fill="none" stroke="#e4e5df" stroke-width="0.9" />
            </pattern>

            <!-- 水磨石：米白底 + 随机石粒，24px 一循环（0.4m）已经看不出重复。 -->
            <pattern id="plan-terrazzo" width="24" height="24" patternUnits="userSpaceOnUse">
                <rect width="24" height="24" fill="#f4f3ee" />
                <g fill="#d8d3c6">
                    <circle cx="3.5" cy="5" r="1.4" />
                    <circle cx="15" cy="3" r="1" />
                    <circle cx="20" cy="9.5" r="1.3" />
                    <circle cx="7" cy="14" r="1.1" />
                    <circle cx="17.5" cy="17" r="1.5" />
                    <circle cx="2.5" cy="19.5" r="0.9" />
                    <circle cx="11" cy="21" r="1.2" />
                </g>
                <g fill="#c9c3b2" opacity="0.75">
                    <circle cx="9.5" cy="8.5" r="0.8" />
                    <circle cx="22" cy="14.5" r="0.9" />
                    <circle cx="13" cy="12" r="0.6" />
                    <circle cx="5" cy="10.5" r="0.7" />
                    <circle cx="19" cy="22" r="0.7" />
                </g>
            </pattern>

            <!-- 地毯：细密绒毛，用虚线交叉铺出织物感，不做高对比以免抢走房间名。 -->
            <pattern id="plan-carpet" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="#f0efe9" />
                <path
                    d="M0 2h8M0 6h8M2 0v8M6 0v8"
                    fill="none"
                    stroke="#e2e0d7"
                    stroke-width="0.55"
                    stroke-dasharray="0.9 0.9"
                />
            </pattern>
        </defs>

        <!-- 地面 -->
        <g>
            <rect
                v-for="room in rooms"
                :key="room.id"
                :data-room="room.id"
                :x="room.x"
                :y="room.y"
                :width="room.width"
                :height="room.height"
                :fill="materials ? `url(#plan-${resolveFloor(room)})` : '#ffffff'"
            />
        </g>

        <!--
            墙体分两遍描：先按墙厚描一遍深色作轮廓，再收窄 2.6px 描一遍浅色作墙身。
            剩下的那一圈深色就是建筑图里的双线墙——比单根粗线像墙，又不用算矩形拼角。
            两次描边的端点都随线段走，转角处的厚薄由 buildWalls 的端部延长负责。
        -->
        <g fill="none" stroke-linecap="butt">
            <line
                v-for="wall in walls"
                :key="`edge-${wall.key}`"
                :x1="wall.x1"
                :y1="wall.y1"
                :x2="wall.x2"
                :y2="wall.y2"
                :stroke-width="wall.thickness"
                :stroke="wall.shared ? '#3b463f' : '#2b352f'"
                pointer-events="none"
            />
            <line
                v-for="wall in walls"
                :key="`body-${wall.key}`"
                :x1="wall.x1"
                :y1="wall.y1"
                :x2="wall.x2"
                :y2="wall.y2"
                :stroke-width="Math.max(wall.thickness - 2.6, 1)"
                stroke="#f4f5f0"
                pointer-events="none"
            />
        </g>

        <!-- 门窗：先挖白洞口，再补墙垛断面，最后画门扇 / 玻璃 -->
        <g
            v-for="item in openings"
            :key="item.opening.id"
            :data-room="item.room.id"
            :data-opening="item.opening.id"
        >
            <rect v-bind="item.box" :fill="item.opening.kind === 'door' ? '#ffffff' : '#eaf2f4'" />
            <line
                v-for="(jamb, index) in item.jambs"
                :key="`jamb-${index}`"
                v-bind="jamb"
                stroke="#2b352f"
                stroke-width="1.4"
            />
            <template v-if="item.opening.kind === 'door'">
                <path :d="item.door.arc" fill="none" stroke="#93a099" stroke-width="0.8" />
                <line
                    :x1="item.door.hinge.x"
                    :y1="item.door.hinge.y"
                    :x2="item.door.leaf.x"
                    :y2="item.door.leaf.y"
                    stroke="#2f3b34"
                    stroke-width="2"
                />
                <!-- 门扇末端的小方块，像真实的门锁侧边 -->
                <circle :cx="item.door.leaf.x" :cy="item.door.leaf.y" r="1.1" fill="#2f3b34" />
                <path :d="item.door.arc" fill="none" stroke="transparent" stroke-width="12" />
            </template>
            <template v-else>
                <line
                    v-for="(line, index) in item.panes"
                    :key="index"
                    v-bind="line"
                    stroke="#5d858d"
                    :stroke-width="index === 1 ? 0.8 : 1.3"
                />
            </template>
            <rect v-bind="item.box" fill="transparent" stroke="transparent" stroke-width="10" />
        </g>

        <!--
            房间名与面积压在白描边上：纹理再花也不会把字吃掉，
            同时不遮住底下的铺装。
        -->
        <g fill="#34473b" text-anchor="middle" pointer-events="none">
            <g
                v-for="room in rooms"
                :key="room.id"
                :transform="`translate(${room.x + room.width / 2},${room.y + room.height / 2})`"
            >
                <text
                    :font-size="room.width < 120 ? 11 : 14"
                    font-weight="500"
                    stroke="#ffffff"
                    stroke-width="2.6"
                    paint-order="stroke"
                    :textLength="
                        room.name.length * 14 > room.width - 20 ? room.width - 20 : undefined
                    "
                    lengthAdjust="spacingAndGlyphs"
                    y="-3"
                >
                    {{ room.name }}
                </text>
                <text
                    font-size="9.5"
                    fill="#8a948d"
                    stroke="#ffffff"
                    stroke-width="2.2"
                    paint-order="stroke"
                    y="15"
                    font-family="'LXGW WenKai Screen', Consolas, monospace"
                >
                    {{ roomArea(room).toFixed(1) }} m²
                </text>
            </g>
        </g>

        <g
            v-if="props.dimensions"
            fill="none"
            stroke="#99a49b"
            stroke-width="0.6"
            pointer-events="none"
        >
            <g
                v-for="dim in dimensions"
                :key="dim.key"
                :transform="
                    dim.vertical
                        ? `translate(${dim.x1 + dim.offset},${dim.y1}) rotate(-90)`
                        : `translate(${dim.x1},${dim.y1 + dim.offset})`
                "
            >
                <template v-if="!dim.vertical">
                    <path
                        :d="`M0 ${-dim.offset - 11}V-7M${dim.x2 - dim.x1} ${-dim.offset - 11}V-7M0 0H${dim.x2 - dim.x1}`"
                    />
                    <path
                        :d="ticks(0, 0) + ticks(dim.x2 - dim.x1, 0)"
                        stroke="#738476"
                        stroke-width="1"
                    />
                    <text
                        :x="(dim.x2 - dim.x1) / 2"
                        y="-5"
                        fill="#7c897f"
                        stroke="#ffffff"
                        stroke-width="2"
                        paint-order="stroke"
                        text-anchor="middle"
                        font-size="9"
                        font-family="'LXGW WenKai Screen', Consolas, monospace"
                    >
                        {{ dim.label }}
                    </text>
                </template>
                <template v-else>
                    <path
                        :d="`M0 ${-dim.offset - 11}V-7M${dim.y1 - dim.y2} ${-dim.offset - 11}V-7M0 0H${dim.y1 - dim.y2}`"
                    />
                    <path
                        :d="ticks(0, 0) + ticks(dim.y1 - dim.y2, 0)"
                        stroke="#738476"
                        stroke-width="1"
                    />
                    <text
                        :x="(dim.y1 - dim.y2) / 2"
                        y="-5"
                        fill="#7c897f"
                        stroke="#ffffff"
                        stroke-width="2"
                        paint-order="stroke"
                        text-anchor="middle"
                        font-size="9"
                        font-family="'LXGW WenKai Screen', Consolas, monospace"
                    >
                        {{ dim.label }}
                    </text>
                </template>
            </g>
        </g>
    </g>
</template>
