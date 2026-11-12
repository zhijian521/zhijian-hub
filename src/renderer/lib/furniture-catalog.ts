/*============================================================================
  furniture-catalog — 家具原型库

  这个应用里「家具」与「储物」是同一件事：衣柜、书柜、冰箱都是"能放东西
  的家具"，所以家具、储物只维护一张表，家具库只是它的一组原型（preset）。

  每个原型给出五样东西：
    · 默认尺寸（60px = 1m，和画板同一套坐标）
    · 一套平面画法（床有枕头和被面褶皱、沙发有坐垫和抱枕、马桶有水箱和便圈）
    · 默认名称与形态分类（kind 决定它挂在哪个清单里、用什么图标）
    · 归组（卧室 / 客厅 / 厨房 / 卫浴 / 软装），家具库按组铺开
    · 一句摆放提示

  画法全部按比例算，再统一做一次「夹进轮廓」的兜底：不管家具被缩到多小，
  细节都不会跑到轮廓外面 —— 这是"画好边界"在家具这一层的底线。

  纯函数、零运行时依赖：node:test 里可以直接跑。
============================================================================*/

import type { StorageKind } from '@/app/types';

/**
 * 平面色调。每族五个色阶：面、底座、轮廓、细节线、受光。
 * 有了这五档，家具才有"面 + 厚度 + 阴影"的层次，而不是一块平色。
 */
export type FurnitureTone =
    | 'wood'
    | 'walnut'
    | 'fabric'
    | 'metal'
    | 'cool'
    | 'bath'
    | 'plant'
    | 'screen';

/** 平面画法的细节类型，决定内部几笔怎么落。 */
export type FurnitureDetail =
    | 'bed'
    | 'sofa'
    | 'cabinet'
    | 'shelf'
    | 'appliance'
    | 'drum'
    | 'table'
    | 'chair'
    | 'plant'
    | 'rug'
    | 'sanitary'
    | 'counter'
    | 'tv'
    | 'lamp';

/** 家具库的分组：按房间顺序排，找不到家具时也照样有组名。 */
export type FurnitureGroup = 'bedroom' | 'living' | 'kitchen' | 'bath' | 'decor';

export const FURNITURE_GROUPS: { id: FurnitureGroup; label: string }[] = [
    { id: 'bedroom', label: '卧室' },
    { id: 'living', label: '客厅' },
    { id: 'kitchen', label: '厨房' },
    { id: 'bath', label: '卫浴' },
    { id: 'decor', label: '软装' },
];

export interface FurniturePreset {
    id: string;
    name: string;
    kind: StorageKind;
    group: FurnitureGroup;
    /** 默认宽（px，60px = 1m） */
    width: number;
    /** 默认深（px） */
    height: number;
    tone: FurnitureTone;
    detail: FurnitureDetail;
    /** 摆放提示，只用于列表里的一句说明。 */
    hint: string;
}

/** 一套平面配色：面、底座、轮廓、内部细节、受光。 */
interface TonePalette {
    fill: string;
    base: string;
    edge: string;
    ink: string;
    light: string;
}

export const TONES: Record<FurnitureTone, TonePalette> = {
    wood: { fill: '#f0e7d7', base: '#e2d5bd', edge: '#b6a483', ink: '#9a8767', light: '#f9f4e9' },
    walnut: { fill: '#dbc8ae', base: '#cbb498', edge: '#a08b70', ink: '#80694f', light: '#eadfcb' },
    fabric: { fill: '#e9ece5', base: '#dbe0d6', edge: '#a8b1a3', ink: '#8b958a', light: '#f4f7f1' },
    metal: { fill: '#e9eceb', base: '#dce1df', edge: '#a4afad', ink: '#86918d', light: '#f5f8f7' },
    cool: { fill: '#ebf2f5', base: '#dbe7ec', edge: '#9bafb6', ink: '#7b9199', light: '#f6fbfc' },
    bath: { fill: '#f5f7f4', base: '#e6ebe6', edge: '#b4bfb7', ink: '#91a09a', light: '#fbfcfa' },
    plant: { fill: '#e5efe0', base: '#d3e3ca', edge: '#9ab08c', ink: '#7d9a6e', light: '#f1f8ec' },
    screen: { fill: '#5b6660', base: '#48544e', edge: '#3b453f', ink: '#8e9a93', light: '#78857e' },
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
        group: 'bedroom',
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
        group: 'bedroom',
        width: 60,
        height: 120,
        tone: 'fabric',
        detail: 'bed',
        hint: '1000 × 2000 mm，次卧或客房',
    },
    {
        id: 'crib',
        name: '婴儿床',
        kind: 'furniture',
        group: 'bedroom',
        width: 42,
        height: 84,
        tone: 'wood',
        detail: 'bed',
        hint: '700 × 1400 mm，贴大床放',
    },
    {
        id: 'wardrobe',
        name: '衣柜',
        kind: 'cabinet',
        group: 'bedroom',
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
        group: 'bedroom',
        width: 27,
        height: 24,
        tone: 'wood',
        detail: 'cabinet',
        hint: '450 × 400 mm，睡前杂物',
    },
    {
        id: 'dresser',
        name: '五斗柜',
        kind: 'cabinet',
        group: 'bedroom',
        width: 60,
        height: 27,
        tone: 'walnut',
        detail: 'cabinet',
        hint: '1000 × 450 mm，叠放衣物',
    },
    {
        id: 'desk',
        name: '书桌',
        kind: 'furniture',
        group: 'bedroom',
        width: 72,
        height: 36,
        tone: 'wood',
        detail: 'table',
        hint: '1200 × 600 mm，配一把椅子',
    },
    {
        id: 'chair',
        name: '餐椅',
        kind: 'furniture',
        group: 'bedroom',
        width: 24,
        height: 24,
        tone: 'walnut',
        detail: 'chair',
        hint: '400 × 400 mm，餐桌或书桌旁',
    },
    {
        id: 'sofa',
        name: '三人沙发',
        kind: 'furniture',
        group: 'living',
        width: 120,
        height: 54,
        tone: 'fabric',
        detail: 'sofa',
        hint: '2000 × 900 mm，客厅主位',
    },
    {
        id: 'armchair',
        name: '单人沙发',
        kind: 'furniture',
        group: 'living',
        width: 48,
        height: 45,
        tone: 'fabric',
        detail: 'sofa',
        hint: '800 × 750 mm，配茶几',
    },
    {
        id: 'coffee-table',
        name: '茶几',
        kind: 'furniture',
        group: 'living',
        width: 60,
        height: 30,
        tone: 'wood',
        detail: 'table',
        hint: '1000 × 500 mm，沙发前',
    },
    {
        id: 'side-table',
        name: '边几',
        kind: 'furniture',
        group: 'living',
        width: 24,
        height: 24,
        tone: 'walnut',
        detail: 'table',
        hint: '400 × 400 mm，沙发扶手旁',
    },
    {
        id: 'tv-cabinet',
        name: '电视柜',
        kind: 'cabinet',
        group: 'living',
        width: 108,
        height: 24,
        tone: 'wood',
        detail: 'cabinet',
        hint: '1800 × 400 mm，机顶盒与杂物',
    },
    {
        id: 'tv',
        name: '电视',
        kind: 'furniture',
        group: 'living',
        width: 72,
        height: 20,
        tone: 'screen',
        detail: 'tv',
        hint: '1200 mm 宽，挂墙或放电视柜',
    },
    {
        id: 'bookshelf',
        name: '书柜',
        kind: 'shelf',
        group: 'living',
        width: 54,
        height: 21,
        tone: 'walnut',
        detail: 'shelf',
        hint: '900 × 350 mm，书与资料',
    },
    {
        id: 'rug',
        name: '地毯',
        kind: 'furniture',
        group: 'living',
        width: 120,
        height: 84,
        tone: 'fabric',
        detail: 'rug',
        hint: '2000 × 1400 mm，沙发与茶几之间',
    },
    {
        id: 'dining-table',
        name: '餐桌',
        kind: 'furniture',
        group: 'kitchen',
        width: 84,
        height: 48,
        tone: 'walnut',
        detail: 'table',
        hint: '1400 × 800 mm，四人到六人',
    },
    {
        id: 'kitchen-counter',
        name: '厨房操作台',
        kind: 'cabinet',
        group: 'kitchen',
        width: 120,
        height: 36,
        tone: 'metal',
        detail: 'counter',
        hint: '2000 × 600 mm，水槽与灶台',
    },
    {
        id: 'fridge',
        name: '冰箱',
        kind: 'furniture',
        group: 'kitchen',
        width: 42,
        height: 42,
        tone: 'cool',
        detail: 'appliance',
        hint: '700 × 700 mm，靠墙留散热缝',
    },
    {
        id: 'microwave',
        name: '微波炉',
        kind: 'furniture',
        group: 'kitchen',
        width: 30,
        height: 21,
        tone: 'metal',
        detail: 'appliance',
        hint: '500 × 350 mm，放在台面上',
    },
    {
        id: 'dishwasher',
        name: '洗碗机',
        kind: 'furniture',
        group: 'kitchen',
        width: 36,
        height: 36,
        tone: 'metal',
        detail: 'drum',
        hint: '600 × 600 mm，嵌在操作台旁',
    },
    {
        id: 'washer',
        name: '洗衣机',
        kind: 'furniture',
        group: 'kitchen',
        width: 36,
        height: 36,
        tone: 'cool',
        detail: 'drum',
        hint: '600 × 600 mm，阳台或卫生间',
    },
    {
        id: 'pantry',
        name: '食品柜',
        kind: 'cabinet',
        group: 'kitchen',
        width: 60,
        height: 30,
        tone: 'wood',
        detail: 'cabinet',
        hint: '1000 × 500 mm，粮油与囤货',
    },
    {
        id: 'shoe-cabinet',
        name: '鞋柜',
        kind: 'cabinet',
        group: 'kitchen',
        width: 60,
        height: 21,
        tone: 'wood',
        detail: 'cabinet',
        hint: '1000 × 350 mm，玄关进门处',
    },
    {
        id: 'toilet',
        name: '马桶',
        kind: 'furniture',
        group: 'bath',
        width: 27,
        height: 30,
        tone: 'bath',
        detail: 'sanitary',
        hint: '400 × 700 mm，贴墙放',
    },
    {
        id: 'basin',
        name: '洗手台',
        kind: 'furniture',
        group: 'bath',
        width: 36,
        height: 21,
        tone: 'bath',
        detail: 'sanitary',
        hint: '600 × 350 mm，配镜柜',
    },
    {
        id: 'bathtub',
        name: '浴缸',
        kind: 'furniture',
        group: 'bath',
        width: 84,
        height: 36,
        tone: 'bath',
        detail: 'sanitary',
        hint: '1400 × 600 mm，靠墙长边',
    },
    {
        id: 'shower',
        name: '淋浴房',
        kind: 'furniture',
        group: 'bath',
        width: 54,
        height: 54,
        tone: 'bath',
        detail: 'sanitary',
        hint: '900 × 900 mm，一角围合',
    },
    {
        id: 'plant',
        name: '绿植',
        kind: 'furniture',
        group: 'decor',
        width: 24,
        height: 24,
        tone: 'plant',
        detail: 'plant',
        hint: '400 × 400 mm，角落或窗边',
    },
    {
        id: 'floor-lamp',
        name: '落地灯',
        kind: 'furniture',
        group: 'decor',
        width: 20,
        height: 20,
        tone: 'metal',
        detail: 'lamp',
        hint: '300 × 300 mm，沙发或床边',
    },
    {
        id: 'storage-box',
        name: '收纳箱',
        kind: 'box',
        group: 'decor',
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

/** 平面上一笔：矩形、直线或椭圆，直接喂给 SVG，不让模板里写 if-else 树。 */
export interface FurnitureShape {
    kind: 'rect' | 'line' | 'ellipse';
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rx?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    cx?: number;
    cy?: number;
    ry?: number;
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

/**
 * 有没有「背面」——决定靠墙时要不要把背板转过去。
 *
 * 床（床头板）、沙发（靠背）、柜子与书架（背面朝墙）、家电（背后要留散热缝）
 * 都有明确的正面与背面；桌子、椅子、地毯、绿植、灯、电视这些摆在哪面都行，
 * 转它们只会平白换掉占地宽深。
 */
export function hasBack(presetId: string | null | undefined): boolean {
    const preset = presetOf(presetId);
    if (!preset) return true; // 没有原型的旧家具按柜子对待，贴墙总不会错
    return (
        preset.detail === 'bed' ||
        preset.detail === 'sofa' ||
        preset.detail === 'cabinet' ||
        preset.detail === 'shelf' ||
        preset.detail === 'appliance' ||
        preset.detail === 'drum'
    );
}

/** 很薄的家具（电视、地毯）：投影要压淡，否则看着比柜子还厚。 */
export function isThinFurniture(presetId: string | null | undefined, depth: number): boolean {
    const preset = presetOf(presetId);
    if (preset && (preset.detail === 'rug' || preset.detail === 'tv')) return true;
    return depth <= 18;
}

/** 摆放盒子：占地一律是轴对齐的矩形，转角只可能是直角，所以宽深会互换。 */
export interface FurnitureBox {
    preset?: string | null;
    width: number;
    height: number;
    rotation?: number;
}

/**
 * 把一笔夹进家具轮廓：所有细节都按比例算，但最后统一兜一次底。
 * 这样「缩到 20px 也不越界」不是靠每处细节自己小心，而是结构上保证。
 */
function fitShape(shape: FurnitureShape, w: number, h: number): FurnitureShape {
    const clampX = (value: number) => Math.min(Math.max(value, 0), w);
    const clampY = (value: number) => Math.min(Math.max(value, 0), h);
    if (shape.kind === 'rect') {
        const x = clampX(shape.x ?? 0);
        const y = clampY(shape.y ?? 0);
        return {
            ...shape,
            x,
            y,
            width: Math.max(0, Math.min(shape.width ?? 0, w - x)),
            height: Math.max(0, Math.min(shape.height ?? 0, h - y)),
        };
    }
    if (shape.kind === 'line') {
        return {
            ...shape,
            x1: clampX(shape.x1 ?? 0),
            x2: clampX(shape.x2 ?? 0),
            y1: clampY(shape.y1 ?? 0),
            y2: clampY(shape.y2 ?? 0),
        };
    }
    const rx = Math.max(0, Math.min(shape.rx ?? 0, w / 2));
    const ry = Math.max(0, Math.min(shape.ry ?? 0, h / 2));
    return {
        ...shape,
        rx,
        ry,
        cx: Math.min(Math.max(shape.cx ?? 0, rx), w - rx),
        cy: Math.min(Math.max(shape.cy ?? 0, ry), h - ry),
    };
}

/**
 * 生成一件家具的平面画法。
 *
 * 三层结构，缺一层都会显得"假"：
 *   1. 轮廓 —— 决定这是什么家具
 *   2. 受光 / 落影两条窄带 —— 给它一点厚度，别像贴在纸上的色块
 *   3. 内部细节 —— 枕头、坐垫缝、门缝、把手、灶眼、水面…
 */
export function furnitureDrawing(box: FurnitureBox): FurnitureDrawing {
    const preset = presetOf(box.preset);
    const rotation = normalizeRotation(box.rotation);
    // 侧过来摆时先在局部坐标系里把宽深换过来画，再由画布的 transform 绕中心转；
    // 这样床单 / 沙发扶手这些细节跟着轮廓一起转，不会横在床中间。
    const sideways = rotation === 90 || rotation === 270;
    const w = sideways ? box.height : box.width;
    const h = sideways ? box.width : box.height;
    const tone = TONES[preset?.tone ?? 'wood'];
    const detail: FurnitureDetail = preset?.detail ?? 'cabinet';
    const id = preset?.id ?? '';
    const shapes: FurnitureShape[] = [];
    const tiny = Math.min(w, h);
    const pad = Math.min(1.4, tiny * 0.06);
    const radius = Math.min(2.6, tiny * 0.16);

    const rect = (
        x: number,
        y: number,
        width: number,
        height: number,
        extra: Partial<FurnitureShape> = {},
    ) => shapes.push({ kind: 'rect', x, y, width, height, ...extra });
    const line = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        extra: Partial<FurnitureShape> = {},
    ) =>
        shapes.push({ kind: 'line', x1, y1, x2, y2, stroke: tone.ink, strokeWidth: 0.8, ...extra });
    const oval = (
        cx: number,
        cy: number,
        rx: number,
        ry: number,
        extra: Partial<FurnitureShape> = {},
    ) => shapes.push({ kind: 'ellipse', cx, cy, rx, ry, ...extra });

    // 本体。
    rect(0, 0, w, h, { rx: radius, fill: tone.fill, stroke: tone.edge, strokeWidth: 1 });

    // 受光 + 落影：只沿上下各一条窄带。家具因此有了"顶面 + 一条立边"，
    // 而不是一张纯色卡片；方向与墙体、柜子的投影保持一致（光从左上来）。
    const bevel = Math.max(1.2, Math.min(3, h * 0.13));
    rect(pad, pad, Math.max(0, w - pad * 2), bevel, {
        rx: bevel / 2,
        fill: tone.light,
        opacity: 0.85,
    });
    rect(
        pad,
        Math.max(pad, h - pad - bevel * 0.72),
        Math.max(0, w - pad * 2),
        Math.max(0, bevel * 0.72),
        {
            rx: bevel / 2,
            fill: tone.base,
            opacity: 0.7,
        },
    );

    if (detail === 'bed') {
        // 床头板 + 两个枕头 + 被子 + 被面褶皱 + 床尾压毯。
        const head = Math.min(h * 0.15, 17);
        rect(0, 0, w, head, { rx: radius, fill: tone.base, stroke: tone.edge, strokeWidth: 0.9 });
        line(w * 0.18, head * 0.52, w * 0.82, head * 0.52, { strokeWidth: 0.6, opacity: 0.45 });
        const pillowTop = head + Math.max(1.2, h * 0.018);
        const pillowH = Math.max(3, Math.min(head * 0.82, (h - head) * 0.18));
        const pillowW = Math.max(3, w * 0.36);
        for (const px of [w * 0.07, Math.max(w * 0.07, w - w * 0.07 - pillowW)]) {
            rect(px, pillowTop, pillowW, pillowH, {
                rx: Math.max(1, pillowH * 0.34),
                fill: '#fcfcf8',
                stroke: tone.edge,
                strokeWidth: 0.7,
            });
            line(
                px + pillowW * 0.22,
                pillowTop + pillowH * 0.58,
                px + pillowW * 0.78,
                pillowTop + pillowH * 0.58,
                { strokeWidth: 0.55, opacity: 0.4 },
            );
        }
        const duvetTop = pillowTop + pillowH + Math.max(2, h * 0.03);
        const duvetH = Math.max(0, h - duvetTop - pad);
        rect(pad, duvetTop, Math.max(0, w - pad * 2), duvetH, {
            rx: Math.min(3.5, w * 0.07),
            fill: tone.light,
            stroke: tone.edge,
            strokeWidth: 0.75,
        });
        line(w * 0.24, duvetTop + duvetH * 0.22, w * 0.58, duvetTop + duvetH * 0.46, {
            strokeWidth: 0.65,
            opacity: 0.3,
        });
        line(w * 0.4, duvetTop + duvetH * 0.6, w * 0.74, duvetTop + duvetH * 0.84, {
            strokeWidth: 0.65,
            opacity: 0.3,
        });
        const runner = Math.max(2, duvetH * 0.16);
        rect(pad, h - pad - runner, Math.max(0, w - pad * 2), runner, {
            rx: 1.4,
            fill: tone.base,
            opacity: 0.55,
        });
    } else if (detail === 'sofa') {
        // 靠背 + 两侧扶手 + 分块坐垫 + 两个抱枕。
        const back = Math.min(h * 0.24, 13);
        const arm = Math.min(w * 0.09, 11);
        rect(pad, pad, Math.max(0, w - pad * 2), back, {
            rx: radius,
            fill: tone.base,
            stroke: tone.edge,
            strokeWidth: 0.85,
        });
        for (const x of [pad, Math.max(pad, w - pad - arm)]) {
            rect(x, pad, arm, Math.max(1, h - pad * 2), {
                rx: Math.min(3, arm * 0.4),
                fill: tone.base,
                stroke: tone.edge,
                strokeWidth: 0.8,
            });
        }
        const innerX = pad + arm + 1.2;
        const innerW = Math.max(2, w - (pad + arm + 1.2) * 2);
        const innerY = pad + back + 1.2;
        const innerH = Math.max(2, h - innerY - pad - 1);
        const seats = w > 95 ? 3 : 2;
        const gap = 1.6;
        const seatW = Math.max(2, (innerW - gap * (seats - 1)) / seats);
        for (let i = 0; i < seats; i += 1) {
            rect(innerX + i * (seatW + gap), innerY, seatW, innerH, {
                rx: Math.min(3, innerH * 0.18),
                fill: tone.light,
                stroke: tone.ink,
                strokeWidth: 0.65,
            });
        }
        const pillow = Math.max(3, Math.min(innerH * 0.42, 11));
        for (const x of [innerX + 1.5, innerX + innerW - pillow - 1.5]) {
            rect(x, innerY + 1, pillow, pillow, {
                rx: 1.6,
                fill: tone.base,
                stroke: tone.ink,
                strokeWidth: 0.5,
                opacity: 0.9,
            });
        }
    } else if (detail === 'cabinet') {
        // 柜子：双开门 + 两个把手；窄柜改成一道横缝，小箱子留抽屉缝。
        const inset = Math.min(2.2, Math.min(w, h) * 0.09);
        const depth = Math.max(0, h - inset * 2);
        if (w >= 30) {
            const gap = 1.4;
            const doorW = Math.max(2, (w - inset * 2 - gap) / 2);
            for (let i = 0; i < 2; i += 1) {
                const x = inset + i * (doorW + gap);
                rect(x, inset, doorW, depth, {
                    rx: 1,
                    fill: 'none',
                    stroke: tone.ink,
                    strokeWidth: 0.7,
                    opacity: 0.5,
                });
                const handleX =
                    i === 0
                        ? x + doorW - Math.min(2.4, doorW * 0.22)
                        : x + Math.min(2.4, doorW * 0.22);
                line(handleX, inset + depth * 0.34, handleX, inset + depth * 0.66, {
                    strokeWidth: 1.15,
                });
            }
        } else if (h >= 26) {
            const seam = inset + depth * 0.12;
            line(inset, seam, w - inset, seam, { strokeWidth: 0.75, opacity: 0.55 });
            line(
                w * 0.4,
                seam + Math.max(1.5, depth * 0.12),
                w * 0.6,
                seam + Math.max(1.5, depth * 0.12),
                {
                    strokeWidth: 1.15,
                },
            );
        } else {
            const seam = inset + depth * 0.52;
            line(inset, seam, w - inset, seam, { strokeWidth: 0.7, opacity: 0.55 });
            line(
                w * 0.4,
                seam + Math.max(1.2, depth * 0.16),
                w * 0.6,
                seam + Math.max(1.2, depth * 0.16),
                {
                    strokeWidth: 1.15,
                },
            );
        }
    } else if (detail === 'shelf') {
        // 书柜：每层排一排高矮不一的书脊，比两条隔板线像书柜得多。
        const rows = h >= 40 ? 3 : 2;
        const rowH = Math.max(2, (h - pad * 2) / rows);
        for (let r = 0; r < rows; r += 1) {
            const top = pad + r * rowH;
            const bottom = top + rowH;
            if (r > 0) line(pad, top, w - pad, top, { strokeWidth: 0.75, opacity: 0.65 });
            const count = Math.max(3, Math.min(9, Math.round(w / 8)));
            const bookW = Math.max(1, (w - pad * 2 - (count - 1) * 0.5) / count);
            for (let i = 0; i < count; i += 1) {
                const bx = pad + i * (bookW + 0.5);
                const bh = Math.max(1, Math.min(rowH - 1, rowH * (0.42 + ((i * 5) % 4) * 0.12)));
                rect(bx, bottom - bh, bookW, bh, {
                    fill: i % 3 === 0 ? tone.base : i % 3 === 1 ? tone.ink : tone.light,
                    opacity: 0.8,
                });
            }
        }
    } else if (detail === 'appliance') {
        // 冰箱 / 微波炉：一道门缝 + 一根把手 + 一小块显示面板。
        const split = pad + Math.max(3, (h - pad * 2) * 0.34);
        line(pad, split, w - pad, split, { strokeWidth: 0.8, opacity: 0.6 });
        const handleX = w * 0.8;
        line(handleX, split + Math.max(1.5, h * 0.06), handleX, split + Math.max(4, h * 0.22), {
            strokeWidth: 1.2,
        });
        rect(w * 0.56, pad + 1, Math.max(3, w * 0.2), Math.max(2, h * 0.07), {
            rx: 0.6,
            fill: tone.light,
            opacity: 0.9,
        });
    } else if (detail === 'drum') {
        // 洗衣机 / 洗碗机：控制面板 + 旋钮 + 同心圆舱门 + 一抹反光。
        const band = pad + Math.max(2, (h - pad * 2) * 0.16);
        line(pad, band, w - pad, band, { strokeWidth: 0.75, opacity: 0.55 });
        oval(
            w * 0.82,
            pad + Math.max(2, (band - pad) * 0.5),
            Math.max(1, w * 0.045),
            Math.max(1, w * 0.045),
            {
                fill: tone.light,
                stroke: tone.ink,
                strokeWidth: 0.6,
            },
        );
        const cx = w / 2;
        const cy = band + (h - band - pad) * 0.52;
        const r = Math.min(w, Math.max(2, h - band)) * 0.33;
        oval(cx, cy, r, r, { fill: tone.fill, stroke: tone.edge, strokeWidth: 0.9 });
        oval(cx, cy, r * 0.72, r * 0.72, {
            fill: 'none',
            stroke: tone.ink,
            strokeWidth: 0.65,
            opacity: 0.7,
        });
        oval(cx - r * 0.3, cy - r * 0.32, r * 0.2, r * 0.14, { fill: '#ffffff', opacity: 0.5 });
    } else if (detail === 'table') {
        // 桌面：内缩一圈桌沿 + 四角桌腿 + 一道木纹。
        const inset = Math.min(w, h) * 0.09;
        rect(inset, inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2), {
            rx: 1.2,
            fill: 'none',
            stroke: tone.ink,
            strokeWidth: 0.8,
            opacity: 0.5,
        });
        const legR = Math.max(0.7, Math.min(w, h) * 0.035);
        const corners: [number, number][] = [
            [inset * 0.8, inset * 0.8],
            [w - inset * 0.8, inset * 0.8],
            [inset * 0.8, h - inset * 0.8],
            [w - inset * 0.8, h - inset * 0.8],
        ];
        for (const [cx, cy] of corners) {
            oval(cx, cy, legR, legR, { fill: tone.base, stroke: tone.edge, strokeWidth: 0.5 });
        }
        if (h > 24) {
            line(inset * 1.8, h * 0.42, w - inset * 1.8, h * 0.42, {
                strokeWidth: 0.55,
                opacity: 0.28,
            });
        }
    } else if (detail === 'chair') {
        // 椅子：靠背一条 + 中间一块坐面，小尺寸也读得出是椅子。
        rect(pad, pad, Math.max(1, w - pad * 2), Math.max(1, h - pad * 2), {
            rx: Math.min(4, tiny * 0.22),
            fill: tone.fill,
            stroke: tone.edge,
            strokeWidth: 0.9,
        });
        rect(pad, pad, Math.max(1, w - pad * 2), Math.max(2, h * 0.22), {
            rx: 1.6,
            fill: tone.base,
            stroke: tone.edge,
            strokeWidth: 0.7,
        });
        oval(w / 2, h * 0.62, Math.max(1, w * 0.26), Math.max(1, h * 0.2), {
            fill: tone.light,
            stroke: tone.ink,
            strokeWidth: 0.6,
            opacity: 0.85,
        });
    } else if (detail === 'plant') {
        // 绿植：底部一个花盆，上面一圈叶子。
        const r = tiny * 0.3;
        oval(w / 2, h - pad - r * 0.68, r * 0.92, r * 0.68, {
            fill: tone.base,
            stroke: tone.edge,
            strokeWidth: 0.85,
        });
        for (let i = 0; i < 6; i += 1) {
            const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
            oval(
                w / 2 + Math.cos(angle) * r * 0.7,
                h * 0.44 + Math.sin(angle) * r * 0.62,
                r * 0.42,
                r * 0.34,
                {
                    fill: i % 2 === 0 ? tone.fill : tone.light,
                    stroke: tone.ink,
                    strokeWidth: 0.6,
                    opacity: 0.95,
                },
            );
        }
    } else if (detail === 'rug') {
        // 地毯：半透明面 + 两道内框，刻意压低不透明度，免得盖住地板。
        rect(pad, pad, Math.max(1, w - pad * 2), Math.max(1, h - pad * 2), {
            rx: Math.min(6, tiny * 0.18),
            fill: tone.fill,
            opacity: 0.55,
        });
        rect(pad * 2.4, pad * 2.4, Math.max(1, w - pad * 4.8), Math.max(1, h - pad * 4.8), {
            rx: Math.min(5, tiny * 0.14),
            fill: 'none',
            stroke: tone.ink,
            strokeWidth: 0.9,
            opacity: 0.4,
        });
        rect(pad * 3.4, pad * 3.4, Math.max(1, w - pad * 6.8), Math.max(1, h - pad * 6.8), {
            rx: Math.min(4, tiny * 0.1),
            fill: tone.base,
            opacity: 0.3,
        });
    } else if (detail === 'sanitary') {
        if (id === 'toilet') {
            rect(w * 0.14, pad, Math.max(1, w * 0.72), Math.max(2, h * 0.22), {
                rx: 1.2,
                fill: tone.light,
                stroke: tone.edge,
                strokeWidth: 0.85,
            });
            const cy = h * 0.62;
            oval(w / 2, cy, w * 0.3, Math.max(2, Math.min(h * 0.28, (h - cy) * 0.9)), {
                fill: '#ffffff',
                stroke: tone.edge,
                strokeWidth: 0.9,
            });
            oval(w / 2, cy, w * 0.19, Math.max(1, Math.min(h * 0.18, (h - cy) * 0.6)), {
                fill: 'none',
                stroke: tone.ink,
                strokeWidth: 0.6,
                opacity: 0.6,
            });
        } else if (id === 'basin') {
            rect(pad, pad, Math.max(1, w - pad * 2), Math.max(1, h - pad * 2), {
                rx: radius,
                fill: tone.fill,
                stroke: tone.edge,
                strokeWidth: 0.9,
            });
            oval(w / 2, h * 0.58, w * 0.32, Math.max(2, h * 0.26), {
                fill: '#ffffff',
                stroke: tone.edge,
                strokeWidth: 0.85,
            });
            oval(w / 2, h * 0.58, w * 0.22, Math.max(1, h * 0.17), {
                fill: 'none',
                stroke: tone.ink,
                strokeWidth: 0.55,
                opacity: 0.55,
            });
            line(w * 0.5, pad + 1.2, w * 0.5, h * 0.3, { strokeWidth: 0.9, opacity: 0.65 });
        } else if (id === 'bathtub') {
            rect(pad, pad, Math.max(1, w - pad * 2), Math.max(1, h - pad * 2), {
                rx: Math.min(5, tiny * 0.2),
                fill: tone.fill,
                stroke: tone.edge,
                strokeWidth: 0.9,
            });
            rect(pad * 2.2, pad * 2.2, Math.max(1, w - pad * 4.4), Math.max(1, h - pad * 4.4), {
                rx: Math.min(6, tiny * 0.26),
                fill: '#ffffff',
                stroke: tone.ink,
                strokeWidth: 0.7,
                opacity: 0.85,
            });
            oval(w - pad * 3, h / 2, Math.max(1, tiny * 0.06), Math.max(1, tiny * 0.06), {
                fill: 'none',
                stroke: tone.ink,
                strokeWidth: 0.6,
                opacity: 0.7,
            });
        } else {
            // 淋浴房：地面 + 两片玻璃（虚线）+ 地漏。
            rect(pad, pad, Math.max(1, w - pad * 2), Math.max(1, h - pad * 2), {
                rx: 1.5,
                fill: tone.fill,
                stroke: tone.edge,
                strokeWidth: 0.9,
            });
            line(pad, pad + tiny * 0.14, w - pad, pad + tiny * 0.14, {
                strokeWidth: 1.1,
                opacity: 0.5,
                dash: '5 3',
            });
            line(w - pad - tiny * 0.14, pad, w - pad - tiny * 0.14, h - pad, {
                strokeWidth: 1.1,
                opacity: 0.5,
                dash: '5 3',
            });
            oval(w * 0.5, h * 0.56, Math.max(1, tiny * 0.09), Math.max(1, tiny * 0.09), {
                fill: 'none',
                stroke: tone.ink,
                strokeWidth: 0.7,
                opacity: 0.6,
            });
        }
    } else if (detail === 'counter') {
        // 厨房操作台：水槽 + 龙头 + 两个灶眼 + 一道分缝。
        line(w / 2, pad, w / 2, h - pad, { strokeWidth: 0.65, opacity: 0.3, dash: '4 3' });
        const sinkX = w * 0.24;
        rect(sinkX - w * 0.1, h * 0.3, w * 0.2, Math.max(2, h * 0.4), {
            rx: 2,
            fill: tone.light,
            stroke: tone.ink,
            strokeWidth: 0.7,
        });
        oval(sinkX, h * 0.5, Math.max(1, w * 0.055), Math.max(1, h * 0.15), {
            fill: 'none',
            stroke: tone.ink,
            strokeWidth: 0.55,
            opacity: 0.65,
        });
        line(sinkX, h * 0.3 + 1.4, sinkX, h * 0.44, { strokeWidth: 0.9 });
        for (const cx of [w * 0.62, w * 0.82]) {
            oval(cx, h * 0.5, Math.max(1.5, h * 0.16), Math.max(1.5, h * 0.16), {
                fill: 'none',
                stroke: tone.ink,
                strokeWidth: 0.75,
                opacity: 0.7,
            });
        }
    } else if (detail === 'tv') {
        // 电视：深色屏体 + 一小块反光，平面图里一眼认得出。
        rect(0, 0, w, h, { rx: 1, fill: tone.fill, stroke: tone.edge, strokeWidth: 0.9 });
        rect(pad * 1.6, Math.max(1, h * 0.18), Math.max(1, w - pad * 3.2), Math.max(1, h * 0.64), {
            rx: 0.8,
            fill: tone.base,
            stroke: tone.light,
            strokeWidth: 0.5,
            opacity: 0.85,
        });
        line(pad * 2.4, h * 0.34, w * 0.42, h * 0.34, {
            stroke: tone.light,
            strokeWidth: 0.65,
            opacity: 0.35,
        });
    } else if (detail === 'lamp') {
        // 落地灯：底座 + 灯杆 + 灯罩。
        const r = tiny * 0.32;
        oval(w / 2, h - pad - r * 0.34, r, Math.max(1, r * 0.42), {
            fill: tone.base,
            stroke: tone.edge,
            strokeWidth: 0.8,
        });
        line(w / 2, h - pad - r * 0.5, w / 2, h * 0.44, { strokeWidth: 0.8, opacity: 0.55 });
        oval(w / 2, h * 0.38, r * 0.95, Math.max(1, r * 0.6), {
            fill: tone.light,
            stroke: tone.ink,
            strokeWidth: 0.75,
        });
    }

    return {
        localWidth: w,
        localHeight: h,
        rotation,
        shapes: shapes.map((shape) => fitShape(shape, w, h)),
    };
}
