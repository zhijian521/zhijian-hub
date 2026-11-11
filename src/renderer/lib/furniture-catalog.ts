/*============================================================================
  furniture-catalog — 家具原型库

  这个应用里「家具」与「储物」是同一件事：衣柜、书柜、冰箱都是"能放东西
  的家具"，所以家具、储物只维护一张表，家具库只是它的一组原型（preset）。

  每个原型给出三样东西：
    · 默认尺寸（60px = 1m，和画板同一套坐标）
    · 一套平面画法（床有枕头、沙发有扶手、冰箱有门缝），不是统一的方块
    · 默认名称与形态分类（kind 决定它挂在哪个清单里、用什么图标）

  纯函数、零运行时依赖：node:test 里可以直接跑。
============================================================================*/

import type { StorageKind } from '@/app/types';

/** 平面色调，决定家具的填充与描边。 */
export type FurnitureTone = 'wood' | 'walnut' | 'fabric' | 'metal' | 'cool';

/** 平面画法的细节类型，决定内部几笔怎么落。 */
export type FurnitureDetail = 'bed' | 'sofa' | 'cabinet' | 'shelf' | 'appliance' | 'table';

export interface FurniturePreset {
    id: string;
    name: string;
    kind: StorageKind;
    /** 默认宽（px，60px = 1m） */
    width: number;
    /** 默认深（px） */
    height: number;
    tone: FurnitureTone;
    detail: FurnitureDetail;
    /** 摆放提示，只用于列表里的一句说明。 */
    hint: string;
}

/** 一套平面配色：面、边、内部细节各一档，都不抢墙体的深浅。 */
interface TonePalette {
    fill: string;
    stroke: string;
    detail: string;
}

export const TONES: Record<FurnitureTone, TonePalette> = {
    wood: { fill: '#efe6d6', stroke: '#b3a184', detail: '#a89574' },
    walnut: { fill: '#ddceb8', stroke: '#a08b70', detail: '#8b7458' },
    fabric: { fill: '#e7eae4', stroke: '#a9b2a4', detail: '#c3cbbf' },
    metal: { fill: '#e9eceb', stroke: '#a6b1af', detail: '#c2cbca' },
    cool: { fill: '#edf2f4', stroke: '#9db0b7', detail: '#c7d5da' },
};

/**
 * 家具库。尺寸一律按住宅真实尺寸折算（60px = 1m），所以在画板上
 * 衣柜比床头柜宽一倍、双人床比单人床宽一半，看着就是对的。
 */
export const FURNITURE_PRESETS: FurniturePreset[] = [
    {
        id: 'bed-double',
        name: '双人床',
        kind: 'furniture',
        width: 90,
        height: 120,
        tone: 'fabric',
        detail: 'bed',
        hint: '1500 × 2000 mm，卧室主床',
    },
    {
        id: 'bed-single',
        name: '单人床',
        kind: 'furniture',
        width: 60,
        height: 120,
        tone: 'fabric',
        detail: 'bed',
        hint: '1000 × 2000 mm，次卧或客房',
    },
    {
        id: 'wardrobe',
        name: '衣柜',
        kind: 'cabinet',
        width: 108,
        height: 36,
        tone: 'wood',
        detail: 'cabinet',
        hint: '1800 × 600 mm，挂衣服与被褥',
    },
    {
        id: 'nightstand',
        name: '床头柜',
        kind: 'cabinet',
        width: 27,
        height: 24,
        tone: 'wood',
        detail: 'cabinet',
        hint: '450 × 400 mm，睡前杂物',
    },
    {
        id: 'bookshelf',
        name: '书柜',
        kind: 'shelf',
        width: 54,
        height: 21,
        tone: 'walnut',
        detail: 'shelf',
        hint: '900 × 350 mm，书与资料',
    },
    {
        id: 'desk',
        name: '书桌',
        kind: 'furniture',
        width: 72,
        height: 36,
        tone: 'wood',
        detail: 'table',
        hint: '1200 × 600 mm，配一把椅子',
    },
    {
        id: 'sofa',
        name: '三人沙发',
        kind: 'furniture',
        width: 120,
        height: 54,
        tone: 'fabric',
        detail: 'sofa',
        hint: '2000 × 900 mm，客厅主位',
    },
    {
        id: 'coffee-table',
        name: '茶几',
        kind: 'furniture',
        width: 60,
        height: 30,
        tone: 'wood',
        detail: 'table',
        hint: '1000 × 500 mm，沙发前',
    },
    {
        id: 'tv-cabinet',
        name: '电视柜',
        kind: 'cabinet',
        width: 108,
        height: 24,
        tone: 'wood',
        detail: 'cabinet',
        hint: '1800 × 400 mm，机顶盒与杂物',
    },
    {
        id: 'dining-table',
        name: '餐桌',
        kind: 'furniture',
        width: 84,
        height: 48,
        tone: 'walnut',
        detail: 'table',
        hint: '1400 × 800 mm，四人到六人',
    },
    {
        id: 'fridge',
        name: '冰箱',
        kind: 'furniture',
        width: 42,
        height: 42,
        tone: 'cool',
        detail: 'appliance',
        hint: '700 × 700 mm，靠墙留散热缝',
    },
    {
        id: 'washer',
        name: '洗衣机',
        kind: 'furniture',
        width: 36,
        height: 36,
        tone: 'cool',
        detail: 'appliance',
        hint: '600 × 600 mm，阳台或卫生间',
    },
    {
        id: 'shoe-cabinet',
        name: '鞋柜',
        kind: 'cabinet',
        width: 60,
        height: 21,
        tone: 'wood',
        detail: 'cabinet',
        hint: '1000 × 350 mm，玄关进门处',
    },
    {
        id: 'pantry',
        name: '食品柜',
        kind: 'cabinet',
        width: 60,
        height: 30,
        tone: 'wood',
        detail: 'cabinet',
        hint: '1000 × 500 mm，粮油与囤货',
    },
    {
        id: 'storage-box',
        name: '收纳箱',
        kind: 'box',
        width: 30,
        height: 24,
        tone: 'metal',
        detail: 'cabinet',
        hint: '500 × 400 mm，换季杂物',
    },
];

const BY_ID = new Map(FURNITURE_PRESETS.map((preset) => [preset.id, preset]));

/** 按 id 找原型；老数据没有 preset，返回 null。 */
export function presetOf(id: string | null | undefined): FurniturePreset | null {
    if (!id) return null;
    return BY_ID.get(id) ?? null;
}

/** 平面上一笔：矩形或直线，直接喂给 SVG，不让模板里写 if-else 树。 */
export interface FurnitureShape {
    kind: 'rect' | 'line';
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rx?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    dash?: string;
}

export interface FurnitureDrawing {
    /** 未旋转时的宽深；rotation 为 90 / 270 时把这一块绕中心转过去就是最终占地。 */
    localWidth: number;
    localHeight: number;
    /** 0 / 90 / 180 / 270 */
    rotation: FurnitureRotation;
    shapes: FurnitureShape[];
}

/** 家具只允许四档直角转角：户型图上斜着摆的家具没有意义。 */
export type FurnitureRotation = 0 | 90 | 180 | 270;

export const FURNITURE_ROTATIONS: FurnitureRotation[] = [0, 90, 180, 270];

/** 脏数据一律当 0 度：宁可画成正的，也不要画成一个歪的方框。 */
export function normalizeRotation(value: number | null | undefined): FurnitureRotation {
    return value === 90 || value === 180 || value === 270 ? value : 0;
}

/** 90 / 270 是「侧过来摆」，占地宽深相对 0 / 180 是对调的。 */
export function isSideways(rotation: number | null | undefined): boolean {
    const value = normalizeRotation(rotation);
    return value === 90 || value === 270;
}

/** 摆放盒子：占地一律是轴对齐的矩形，转角只可能是直角，所以宽深会互换。 */
export interface FurnitureBox {
    preset?: string | null;
    width: number;
    height: number;
    rotation?: number;
}

/**
 * 生成一件家具的平面画法。
 *
 * 内部细节一律按比例算（枕头 22%、扶手 9%…），所以不管家具被缩到多小，
 * 细节都不会跑到轮廓外面去 —— 这是"画好边界"在家具这一层的底线。
 */
export function furnitureDrawing(box: FurnitureBox): FurnitureDrawing {
    const preset = presetOf(box.preset);
    const rotation = normalizeRotation(box.rotation);
    // 侧过来摆时先在局部坐标系里把宽深换过来画，再由画布的 transform 绕中心转；
    // 这样床单 / 沙发扶手这些细节跟着轮廓一起转，不会横在床中间。
    const sideways = rotation === 90 || rotation === 270;
    const localWidth = sideways ? box.height : box.width;
    const localHeight = sideways ? box.width : box.height;
    const tone = TONES[preset?.tone ?? 'wood'];
    const detail: FurnitureDetail = preset?.detail ?? 'cabinet';
    const shapes: FurnitureShape[] = [];

    // 本体：圆角小一点，平面图里家具是硬边家具。
    shapes.push({
        kind: 'rect',
        x: 0,
        y: 0,
        width: localWidth,
        height: localHeight,
        rx: 1.4,
        fill: tone.fill,
        stroke: tone.stroke,
        strokeWidth: 1,
    });

    const line = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        extra: Partial<FurnitureShape> = {},
    ) =>
        shapes.push({
            kind: 'line',
            x1,
            y1,
            x2,
            y2,
            stroke: tone.detail,
            strokeWidth: 0.75,
            ...extra,
        });

    if (detail === 'bed') {
        // 床头在短边一侧：一条厚背板 + 两个枕头 + 被子分界。
        const head = Math.min(localHeight * 0.14, 16);
        shapes.push({
            kind: 'rect',
            x: 0,
            y: 0,
            width: localWidth,
            height: head,
            rx: 1.4,
            fill: tone.detail,
            opacity: 0.45,
        });
        const pillowW = localWidth * 0.36;
        const pillowH = Math.min(head * 0.9, localHeight * 0.1);
        for (const dx of [localWidth * 0.08, localWidth - localWidth * 0.08 - pillowW]) {
            shapes.push({
                kind: 'rect',
                x: dx,
                y: head + (pillowH > 0 ? 2 : 0),
                width: pillowW,
                height: pillowH,
                rx: 2,
                fill: '#fbfbf8',
                stroke: tone.stroke,
                strokeWidth: 0.6,
            });
        }
        const blanket = head + pillowH + Math.max(localHeight * 0.06, 3);
        if (blanket < localHeight - 2) line(1, blanket, localWidth - 1, blanket, { opacity: 0.7 });
    } else if (detail === 'sofa') {
        // 靠背 + 两侧扶手，中间留一块坐面，再切两道坐垫缝。
        const back = Math.min(localHeight * 0.24, 13);
        const arm = Math.min(localWidth * 0.08, 10);
        shapes.push({
            kind: 'rect',
            x: 0,
            y: 0,
            width: localWidth,
            height: back,
            rx: 1.4,
            fill: tone.detail,
            opacity: 0.5,
        });
        for (const x of [0, localWidth - arm]) {
            shapes.push({
                kind: 'rect',
                x,
                y: 0,
                width: arm,
                height: localHeight,
                rx: 1.4,
                fill: tone.detail,
                opacity: 0.3,
            });
        }
        const seatTop = back;
        if (localHeight - seatTop > 6) {
            line(arm, seatTop, localWidth - arm, seatTop, { opacity: 0.8 });
            const mid = localWidth / 2;
            if (localWidth > 40) line(mid, seatTop, mid, localHeight - 1, { opacity: 0.6 });
        }
    } else if (detail === 'cabinet') {
        // 柜子：一条中线（双开门）或一道贴边的门缝，读得出"这是柜子"。
        if (localWidth >= 30) {
            const mid = localWidth / 2;
            line(mid, 1.5, mid, localHeight - 1.5, { opacity: 0.8 });
            line(localWidth * 0.24, localHeight * 0.5, localWidth * 0.34, localHeight * 0.5);
            line(localWidth * 0.66, localHeight * 0.5, localWidth * 0.76, localHeight * 0.5);
        } else if (localHeight >= 30) {
            const mid = localHeight / 2;
            line(1.5, mid, localWidth - 1.5, mid, { opacity: 0.8 });
        } else {
            // 床头柜这种小箱子两边都不够画中缝，只留一道门缝 + 一个把手，
            // 否则它在图上就是一个纯色方块，和「一件家具」认不出来。
            const seam = localHeight * 0.62;
            line(1.5, seam, localWidth - 1.5, seam, { opacity: 0.75 });
            line(localWidth * 0.42, seam + 1.6, localWidth * 0.58, seam + 1.6, {
                strokeWidth: 1.1,
            });
        }
    } else if (detail === 'shelf') {
        // 书柜：两道横隔板 + 一排书脊的短竖线。
        const rows = 2;
        for (let i = 1; i <= rows; i += 1) {
            const y = (localHeight * i) / (rows + 1);
            line(1, y, localWidth - 1, y, { opacity: 0.85 });
        }
        const spines = Math.max(2, Math.min(6, Math.round(localWidth / 12)));
        for (let i = 1; i < spines; i += 1) {
            const x = (localWidth * i) / spines;
            line(x, 1.5, x, localHeight * 0.33, { opacity: 0.5 });
        }
    } else if (detail === 'appliance') {
        // 家电：一道门缝 + 一个把手，冰箱与洗衣机共用这套语言。
        const split = localHeight * 0.34;
        line(1, split, localWidth - 1, split, { opacity: 0.85 });
        line(localWidth * 0.78, split + 2, localWidth * 0.78, localHeight * 0.62, {
            strokeWidth: 1.1,
        });
    } else if (detail === 'table') {
        // 桌面：内缩一圈当桌沿，四角点一点当桌腿。
        const inset = Math.min(localWidth, localHeight) * 0.12;
        shapes.push({
            kind: 'rect',
            x: inset,
            y: inset,
            width: Math.max(1, localWidth - inset * 2),
            height: Math.max(1, localHeight - inset * 2),
            rx: 1,
            fill: 'none',
            stroke: tone.detail,
            strokeWidth: 0.7,
            opacity: 0.7,
        });
    }

    return { localWidth, localHeight, rotation, shapes };
}
