<script setup lang="ts">
import { computed } from 'vue';
import type { Room } from '@/app/types';
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
            };
        }),
    ),
);
const ticks = (x: number, y: number) => `M ${x - 3} ${y + 4} l 6 -8`;
</script>

<template>
    <g data-plan-drawing="true" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">
        <defs>
            <pattern id="plan-wood" width="54" height="18" patternUnits="userSpaceOnUse">
                <rect width="54" height="18" fill="#f5f0e6" />
                <path
                    d="M0 0H54M27 0V9M0 9H54M0 9V18M54 9V18"
                    fill="none"
                    stroke="#e6ded0"
                    stroke-width="0.5"
                />
            </pattern>
            <pattern id="plan-tile" width="36" height="36" patternUnits="userSpaceOnUse">
                <rect width="36" height="36" fill="#fafaf7" />
                <path d="M0 36V0H36" fill="none" stroke="#e8e9e3" stroke-width="0.6" />
            </pattern>
            <pattern id="plan-small" width="12" height="12" patternUnits="userSpaceOnUse">
                <rect width="12" height="12" fill="#f1f5f3" />
                <path d="M0 12V0H12" fill="none" stroke="#dfe7e2" stroke-width="0.5" />
            </pattern>
        </defs>
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
        <g fill="none" stroke="#303b36" stroke-linecap="butt">
            <line
                v-for="wall in walls"
                :key="wall.key"
                :x1="wall.x1"
                :y1="wall.y1"
                :x2="wall.x2"
                :y2="wall.y2"
                :stroke-width="wall.thickness"
                pointer-events="none"
            />
        </g>
        <g
            v-for="item in openings"
            :key="item.opening.id"
            :data-room="item.room.id"
            :data-opening="item.opening.id"
        >
            <rect v-bind="item.box" fill="#fff" />
            <template v-if="item.opening.kind === 'door'">
                <path :d="item.door.arc" fill="none" stroke="#8b9790" stroke-width="0.8" />
                <line
                    :x1="item.door.hinge.x"
                    :y1="item.door.hinge.y"
                    :x2="item.door.leaf.x"
                    :y2="item.door.leaf.y"
                    stroke="#59675e"
                    stroke-width="1.7"
                />
                <path :d="item.door.arc" fill="none" stroke="transparent" stroke-width="12" />
            </template>
            <template v-else>
                <line
                    v-for="(line, index) in item.panes"
                    :key="index"
                    v-bind="line"
                    stroke="#658b93"
                    :stroke-width="index === 1 ? 1 : 1.5"
                />
                <line
                    :x1="item.panes[0]?.x1"
                    :y1="item.panes[0]?.y1"
                    :x2="item.panes[2]?.x1"
                    :y2="item.panes[2]?.y1"
                    stroke="#658b93"
                    stroke-width="1.5"
                />
                <line
                    :x1="item.panes[0]?.x2"
                    :y1="item.panes[0]?.y2"
                    :x2="item.panes[2]?.x2"
                    :y2="item.panes[2]?.y2"
                    stroke="#658b93"
                    stroke-width="1.5"
                />
            </template>
            <rect v-bind="item.box" fill="transparent" stroke="transparent" stroke-width="10" />
        </g>
        <g fill="#34473b" text-anchor="middle" pointer-events="none">
            <g
                v-for="room in rooms"
                :key="room.id"
                :transform="`translate(${room.x + room.width / 2},${room.y + room.height / 2})`"
            >
                <text
                    :font-size="room.width < 120 ? 11 : 14"
                    font-weight="500"
                    :textLength="
                        room.name.length * 14 > room.width - 20 ? room.width - 20 : undefined
                    "
                    lengthAdjust="spacingAndGlyphs"
                    y="-3"
                >
                    {{ room.name }}
                </text>
                <text font-size="9.5" fill="#8a948d" y="15" font-family="Consolas, monospace">
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
                        stroke="none"
                        text-anchor="middle"
                        font-size="9"
                        font-family="Consolas, monospace"
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
                        stroke="none"
                        text-anchor="middle"
                        font-size="9"
                        font-family="Consolas, monospace"
                    >
                        {{ dim.label }}
                    </text>
                </template>
            </g>
        </g>
    </g>
</template>
