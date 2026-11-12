<script setup lang="ts">
/*============================================================================
  FurnitureShapes — 把 furnitureDrawing() 产出的一串图形画成 SVG

  家具的平面画法分三层（轮廓 / 受光带 / 细节），每层都只是
  rect / ellipse / line 三种基本图形。画布上「已摆好的家具」「拖动中的跟手框」
  「从库里拖出来的预览」三处用的是同一串图形，只有整体不透明度不同，
  所以收成一个纯展示组件，避免三段几乎相同的模板各改一遍。
============================================================================*/
import type { FurnitureShape } from '@/lib/furniture-catalog';

const props = withDefaults(
    defineProps<{
        shapes: FurnitureShape[];
        /** 整体不透明度：跟手框画淡一点，不至于盖住底下的家具。 */
        opacity?: number;
    }>(),
    { opacity: 1 },
);
</script>

<template>
    <g>
        <template v-for="(shape, index) in props.shapes" :key="index">
            <rect
                v-if="shape.kind === 'rect'"
                :x="shape.x"
                :y="shape.y"
                :width="shape.width"
                :height="shape.height"
                :rx="shape.rx"
                :fill="shape.fill ?? 'none'"
                :stroke="shape.stroke ?? 'none'"
                :stroke-width="shape.strokeWidth ?? 0"
                :opacity="(shape.opacity ?? 1) * props.opacity"
            />
            <ellipse
                v-else-if="shape.kind === 'ellipse'"
                :cx="shape.cx"
                :cy="shape.cy"
                :rx="shape.rx"
                :ry="shape.ry"
                :fill="shape.fill ?? 'none'"
                :stroke="shape.stroke ?? 'none'"
                :stroke-width="shape.strokeWidth ?? 0"
                :opacity="(shape.opacity ?? 1) * props.opacity"
            />
            <line
                v-else
                :x1="shape.x1"
                :y1="shape.y1"
                :x2="shape.x2"
                :y2="shape.y2"
                :stroke="shape.stroke ?? 'none'"
                :stroke-width="shape.strokeWidth ?? 1"
                :stroke-dasharray="shape.dash"
                :opacity="(shape.opacity ?? 1) * props.opacity"
                stroke-linecap="round"
            />
        </template>
    </g>
</template>
