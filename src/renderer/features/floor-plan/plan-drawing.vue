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

        地面质感靠三层叠出来，缺任何一层都会退化成「平涂色块」：
          1. pattern —— 铺装本身（板缝、砖缝、石纹），按 60px = 1m 的真实尺寸定义，
             缩放画布时纹理跟着放大，密度就是真实铺装密度；
          2. 光照 —— 每个房间一层上亮下暗的渐变，让地面像有光打上去；
          3. 环境遮蔽 —— 墙根一圈模糊的暗边，让地面「陷」进墙里而不是浮在墙上。
        这三层都只在开启「材质」时出现，关掉就是纯线稿。
    -->
    <g
        data-plan-drawing="true"
        font-family="'LXGW WenKai Screen', 'Microsoft YaHei', 'PingFang SC', sans-serif"
    >
        <defs>
            <!--== 木地板基元 ==================================================
                板宽 9px = 150 mm，板长 60px = 1 m，四行一循环并错缝。
                每块板横向带一道极淡的明暗过渡（板面不是纯色），
                再叠两条错开的木纹；缝线比板面深一点点即可，太深会像地砖。
            =================================================================-->
            <linearGradient id="plan-oak-tone" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#f2e8d6" />
                <stop offset="0.42" stop-color="#eee2cd" />
                <stop offset="1" stop-color="#f4ebda" />
            </linearGradient>
            <linearGradient id="plan-walnut-tone" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#c3a583" />
                <stop offset="0.45" stop-color="#b49471" />
                <stop offset="1" stop-color="#c9ac8a" />
            </linearGradient>

            <g id="plan-oak-planks">
                <rect width="60" height="36" fill="url(#plan-oak-tone)" />
                <path
                    d="M0 9h60M0 18h60M0 27h60"
                    stroke="#d8c4a6"
                    stroke-width="0.55"
                    opacity="0.85"
                />
                <path d="M18 0v9M42 9v18M6 18v9M30 27v9" stroke="#ddc9ac" stroke-width="0.5" />
                <g stroke="#e0d0b6" stroke-width="0.45" opacity="0.75">
                    <path d="M4 3.1c8 .5 14-.4 22 .2M30 3.4c7-.3 13 .4 20 .1" />
                    <path d="M10 12.2c9-.4 16 .3 24 0M40 12.5c5 .2 10-.2 16 0" />
                    <path d="M2 21.3c10 .4 18-.3 26 .1M32 21.1c8-.2 14 .3 22 .1" />
                    <path d="M7 30.2c7-.3 15 .4 23 0M36 30.4c6 .2 12-.2 18 0" />
                </g>
            </g>

            <g id="plan-walnut-planks">
                <rect width="60" height="36" fill="url(#plan-walnut-tone)" />
                <path
                    d="M0 9h60M0 18h60M0 27h60"
                    stroke="#a3835f"
                    stroke-width="0.55"
                    opacity="0.9"
                />
                <path d="M18 0v9M42 9v18M6 18v9M30 27v9" stroke="#a98a66" stroke-width="0.5" />
                <g stroke="#a5845f" stroke-width="0.5" opacity="0.5">
                    <path d="M4 3.1c8 .5 14-.4 22 .2M30 3.4c7-.3 13 .4 20 .1" />
                    <path d="M10 12.2c9-.4 16 .3 24 0M40 12.5c5 .2 10-.2 16 0" />
                    <path d="M2 21.3c10 .4 18-.3 26 .1M32 21.1c8-.2 14 .3 22 .1" />
                    <path d="M7 30.2c7-.3 15 .4 23 0M36 30.4c6 .2 12-.2 18 0" />
                </g>
            </g>

            <pattern id="plan-wood" width="60" height="36" patternUnits="userSpaceOnUse">
                <use href="#plan-oak-planks" />
            </pattern>
            <pattern id="plan-walnut" width="60" height="36" patternUnits="userSpaceOnUse">
                <use href="#plan-walnut-planks" />
            </pattern>
            <pattern
                id="plan-diagonal"
                width="60"
                height="36"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-40)"
            >
                <use href="#plan-oak-planks" />
            </pattern>

            <!--== 砖石 ======================================================
                缝线统一用「比砖面深 6~8%」的暖灰，并压到 0.8px 以内；
                砖面再加一道贴边的内高光，砖就有了厚度，不再是色块拼图。
            ================================================================-->
            <pattern id="plan-tile" width="48" height="48" patternUnits="userSpaceOnUse">
                <rect width="48" height="48" fill="#f4f3ec" />
                <path d="M0.6 48V0.6H48" fill="none" stroke="#fbfaf6" stroke-width="1.2" />
                <path d="M0 48V0H48" fill="none" stroke="#d9d8cd" stroke-width="0.8" />
                <path
                    d="M22 8c6 4 3 10 9 13s9-1 12 3"
                    fill="none"
                    stroke="#ecebe3"
                    stroke-width="0.7"
                />
            </pattern>

            <pattern id="plan-subway" width="36" height="18" patternUnits="userSpaceOnUse">
                <rect width="36" height="18" fill="#f6f5ef" />
                <path d="M0 0.5h36M0 9.5h36" stroke="#dbd9cd" stroke-width="0.7" />
                <path d="M0.5 0v9M18.5 9v9M35.5 0v9" stroke="#dbd9cd" stroke-width="0.7" />
                <path d="M0 1.3h36M0 10.3h36" stroke="#fdfcf8" stroke-width="0.6" />
            </pattern>

            <pattern id="plan-small" width="18" height="18" patternUnits="userSpaceOnUse">
                <rect width="18" height="18" fill="#eef4f1" />
                <path d="M0.4 18V0.4H18" fill="none" stroke="#fbfdfc" stroke-width="0.7" />
                <path d="M0 18V0H18" fill="none" stroke="#cfdcd4" stroke-width="0.7" />
            </pattern>

            <!-- 大理石：800 大板（48px），纹路故意跨出板缝，重复时像天然石纹 -->
            <pattern id="plan-marble" width="48" height="48" patternUnits="userSpaceOnUse">
                <rect width="48" height="48" fill="#f9f9f6" />
                <g fill="none" stroke="#e3e4dd" stroke-width="1.15" stroke-linecap="round">
                    <path d="M-2 15c7 4 10-3 17 0s8 7 15 5 9-6 15-3" />
                    <path d="M3 42c6-5 11 2 17-1s9-8 14-5 9 6 15 3" />
                    <path d="M-3 30c8 2 11-5 18-2" />
                </g>
                <g fill="none" stroke="#ecede7" stroke-width="0.7" opacity="0.9">
                    <path d="M10 1c3 6-1 9 2 14s7 7 4 13" />
                    <path d="M38 6c-3 5 1 8-2 12" />
                </g>
                <path d="M0.5 48V0.5H48" fill="none" stroke="#e6e6de" stroke-width="0.8" />
            </pattern>

            <!-- 水磨石：米白底 + 两级石粒，24px（0.4m）一循环已看不出重复 -->
            <pattern id="plan-terrazzo" width="24" height="24" patternUnits="userSpaceOnUse">
                <rect width="24" height="24" fill="#f4f3ee" />
                <g fill="#d5d0c2" opacity="0.9">
                    <circle cx="3.6" cy="5.2" r="1.5" />
                    <circle cx="15.2" cy="3.1" r="1.05" />
                    <circle cx="20.1" cy="9.6" r="1.35" />
                    <circle cx="7.1" cy="14.2" r="1.15" />
                    <circle cx="17.6" cy="17.3" r="1.55" />
                    <circle cx="2.6" cy="19.7" r="0.95" />
                    <circle cx="11.2" cy="21.1" r="1.25" />
                </g>
                <g fill="#c6c0ae" opacity="0.65">
                    <circle cx="9.6" cy="8.6" r="0.85" />
                    <circle cx="22.2" cy="14.6" r="0.95" />
                    <circle cx="13.1" cy="12.1" r="0.65" />
                    <circle cx="5.1" cy="10.6" r="0.75" />
                    <circle cx="19.1" cy="22.1" r="0.75" />
                </g>
                <g fill="#fafaf6" opacity="0.8">
                    <circle cx="12.4" cy="5.9" r="1.1" />
                    <circle cx="6.4" cy="17.9" r="1" />
                </g>
            </pattern>

            <!-- 微水泥：几乎没有缝，只有两团极淡的抹痕，靠色差而非线条出质感 -->
            <pattern id="plan-microcement" width="60" height="60" patternUnits="userSpaceOnUse">
                <rect width="60" height="60" fill="#eceae3" />
                <ellipse cx="19" cy="21" rx="26" ry="20" fill="#f3f1eb" opacity="0.7" />
                <ellipse cx="45" cy="46" rx="22" ry="18" fill="#e4e1d8" opacity="0.55" />
                <ellipse cx="47" cy="12" rx="14" ry="11" fill="#f6f4ef" opacity="0.5" />
            </pattern>

            <!-- 地毯：细密绒线，用交叉虚线铺织物感，对比度压得很低 -->
            <pattern id="plan-carpet" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="#efece4" />
                <path
                    d="M0 2h8M0 6h8M2 0v8M6 0v8"
                    fill="none"
                    stroke="#dfdcd1"
                    stroke-width="0.5"
                    stroke-dasharray="0.85 0.85"
                />
            </pattern>

            <!--== 光照与环境遮蔽 ============================================-->
            <linearGradient id="plan-light" x1="0.08" y1="0" x2="0.55" y2="1">
                <stop offset="0" stop-color="#ffffff" stop-opacity="0.34" />
                <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.07" />
                <stop offset="1" stop-color="#4b4736" stop-opacity="0.11" />
            </linearGradient>
            <filter id="plan-ao" x="-6%" y="-6%" width="112%" height="112%">
                <feGaussianBlur stdDeviation="2.6" />
            </filter>
        </defs>

        <!--== 地面：铺装 → 光照 → 墙根暗边 ==============================-->
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
            <template v-if="materials">
                <rect
                    v-for="room in rooms"
                    :key="`light-${room.id}`"
                    :x="room.x"
                    :y="room.y"
                    :width="room.width"
                    :height="room.height"
                    fill="url(#plan-light)"
                    pointer-events="none"
                />
                <rect
                    v-for="room in rooms"
                    :key="`ao-${room.id}`"
                    :x="room.x + 1.5"
                    :y="room.y + 1.5"
                    :width="Math.max(room.width - 3, 0)"
                    :height="Math.max(room.height - 3, 0)"
                    fill="none"
                    stroke="#3f3b2c"
                    stroke-opacity="0.15"
                    stroke-width="7"
                    filter="url(#plan-ao)"
                    pointer-events="none"
                />
            </template>
        </g>

        <!--
            墙体分两遍描：先按墙厚描一遍深色作轮廓，再收窄 2.6px 描一遍浅色作墙身。
            剩下的那一圈深色就是建筑图里的双线墙——比单根粗线像墙，又不用算矩形拼角。
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

        <!-- 门窗：先挖洞口，再补墙垛断面，最后画门扇 / 玻璃 -->
        <g
            v-for="item in openings"
            :key="item.opening.id"
            :data-room="item.room.id"
            :data-opening="item.opening.id"
        >
            <rect v-bind="item.box" :fill="item.opening.kind === 'door' ? '#ffffff' : '#e9f2f4'" />
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

        <!-- 房间名与面积压白色描边上：纹理再花也不会把字吃掉 -->
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
