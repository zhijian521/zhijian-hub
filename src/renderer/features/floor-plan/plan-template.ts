import type { Room, StorageDevice, StoredItem, WallSide, OpeningKind } from '@/app/types';

/* 不 import plan-geometry 的 BAY_DEPTH：这个文件被单测直接按路径加载，
   而 plan-geometry 用的是 @/ 别名（只有 vite 认识）。一个数值不值得为它
   在测试里加一层别名解析，这里直接用默认出挑量 26px ≈ 430 mm。 */
const SAMPLE_BAY_DEPTH = 26;

/** A connected two-bedroom reference plan, offered only on an empty drawing. */
export function exampleRooms(): Room[] {
    const opening = (
        id: string,
        kind: OpeningKind,
        wall: WallSide,
        pos: number,
        width: number,
    ) => ({
        id,
        kind,
        wall,
        pos,
        width,
        hinge: 'start' as const,
        swing: 'in' as const,
        // 示例里的飘窗用标准出挑量，用户可以在属性卡里改。
        depth: SAMPLE_BAY_DEPTH,
    });
    return [
        {
            id: 'sample-master',
            name: '主卧',
            x: 0,
            y: 0,
            width: 216,
            height: 216,
            floor: 'wood',
            outdoor: false,
            openWalls: [],
            openings: [
                opening('sample-d1', 'door', 'bottom', 144, 54),
                opening('sample-w1', 'bay', 'top', 48, 120),
            ],
        },
        {
            id: 'sample-bedroom',
            name: '次卧',
            x: 216,
            y: 0,
            width: 180,
            height: 156,
            floor: 'wood',
            outdoor: false,
            openWalls: [],
            openings: [
                opening('sample-d2', 'door', 'bottom', 108, 54),
                opening('sample-w2', 'window', 'top', 42, 96),
            ],
        },
        {
            id: 'sample-kitchen',
            name: '厨房',
            x: 396,
            y: 0,
            width: 144,
            height: 216,
            floor: 'small',
            outdoor: false,
            openWalls: [],
            openings: [
                opening('sample-d3', 'door', 'left', 156, 54),
                opening('sample-w3', 'window', 'top', 30, 84),
            ],
        },
        {
            id: 'sample-living',
            name: '客餐厅',
            x: 0,
            y: 216,
            width: 396,
            height: 234,
            floor: 'tile',
            outdoor: false,
            openWalls: [],
            openings: [opening('sample-d4', 'door', 'top', 270, 72)],
        },
        {
            id: 'sample-hall',
            name: '过道',
            x: 216,
            y: 156,
            width: 180,
            height: 60,
            floor: 'tile',
            outdoor: false,
            openWalls: [],
            openings: [],
        },
        {
            id: 'sample-bath',
            name: '卫生间',
            x: 396,
            y: 216,
            width: 144,
            height: 138,
            floor: 'small',
            outdoor: false,
            openWalls: [],
            openings: [
                opening('sample-d5', 'door', 'left', 36, 48),
                opening('sample-w4', 'window', 'right', 42, 54),
            ],
        },
        {
            id: 'sample-entrance',
            name: '玄关',
            x: 396,
            y: 354,
            width: 144,
            height: 96,
            floor: 'tile',
            outdoor: false,
            openWalls: [],
            openings: [
                opening('sample-d6', 'door', 'bottom', 48, 60),
                opening('sample-d7', 'door', 'left', 18, 60),
            ],
        },
        {
            id: 'sample-balcony',
            name: '阳台',
            x: 0,
            y: 450,
            width: 396,
            height: 78,
            floor: 'small',
            outdoor: true,
            openWalls: [],
            openings: [opening('sample-d8', 'door', 'top', 228, 72)],
        },
    ];
}

/**
 * 示例储物设备：跟示例户型一起铺上，让「点柜子看里面有什么」一打开就能试。
 * 只在选择"用示例户型开始"时写入，从空白开始的用户拿到的是干净的空家。
 */
export function exampleStorage(): StorageDevice[] {
    /* 每件都按家具库的真实尺寸摆好，坐标就是画板坐标（60px = 1m），
       所以示例户型一打开就是一张排好的平面图，不是一堆待摆的方块。 */
    const piece = (
        id: string,
        roomId: string,
        name: string,
        kind: StorageDevice['kind'],
        preset: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ): StorageDevice => ({ id, roomId, name, kind, preset, x, y, width, height, rotation: 0 });

    return [
        piece(
            'sample-st-bed',
            'sample-master',
            '双人床',
            'furniture',
            'bed-double',
            20,
            60,
            90,
            120,
        ),
        piece(
            'sample-st-wardrobe',
            'sample-master',
            '衣柜',
            'cabinet',
            'wardrobe',
            100,
            10,
            108,
            36,
        ),
        piece(
            'sample-st-bedside',
            'sample-master',
            '床头柜',
            'cabinet',
            'nightstand',
            114,
            60,
            27,
            24,
        ),
        piece(
            'sample-st-single',
            'sample-bedroom',
            '单人床',
            'furniture',
            'bed-single',
            230,
            20,
            60,
            120,
        ),
        piece('sample-st-books', 'sample-bedroom', '书柜', 'shelf', 'bookshelf', 300, 20, 54, 21),
        piece('sample-st-desk', 'sample-bedroom', '书桌', 'furniture', 'desk', 300, 60, 72, 36),
        piece('sample-st-pantry', 'sample-kitchen', '食品柜', 'cabinet', 'pantry', 410, 12, 60, 30),
        piece(
            'sample-st-fridge',
            'sample-kitchen',
            '冰箱',
            'furniture',
            'fridge',
            490,
            160,
            42,
            42,
        ),
        piece('sample-st-sofa', 'sample-living', '三人沙发', 'furniture', 'sofa', 40, 350, 120, 54),
        piece(
            'sample-st-coffee',
            'sample-living',
            '茶几',
            'furniture',
            'coffee-table',
            70,
            310,
            60,
            30,
        ),
        piece('sample-st-tv', 'sample-living', '电视柜', 'cabinet', 'tv-cabinet', 40, 240, 108, 24),
        piece(
            'sample-st-dining',
            'sample-living',
            '餐桌',
            'furniture',
            'dining-table',
            240,
            330,
            84,
            48,
        ),
        piece('sample-st-washer', 'sample-bath', '洗衣机', 'furniture', 'washer', 490, 300, 36, 36),
        piece(
            'sample-st-shoe',
            'sample-entrance',
            '鞋柜',
            'cabinet',
            'shoe-cabinet',
            470,
            410,
            60,
            21,
        ),
        piece(
            'sample-st-tools',
            'sample-balcony',
            '工具柜',
            'cabinet',
            'storage-box',
            30,
            460,
            30,
            24,
        ),
        piece(
            'sample-st-luggage',
            'sample-balcony',
            '收纳箱',
            'box',
            'storage-box',
            70,
            460,
            30,
            24,
        ),
    ];
}

/** 示例物品：覆盖"柜子里有东西"和"东西还没进柜子"两种状态。 */
export function exampleItems(): StoredItem[] {
    const item = (
        id: string,
        name: string,
        category: string,
        roomId: string,
        storageId: string | null,
        quantity = 1,
        note = '',
    ): StoredItem => ({ id, name, category, quantity, note, roomId, storageId });

    return [
        item('sample-i1', '羽绒服', '衣物', 'sample-master', 'sample-st-wardrobe', 2, '冬季'),
        item('sample-i2', '登山包', '户外', 'sample-master', 'sample-st-wardrobe'),
        item('sample-i3', '护照', '证件', 'sample-master', 'sample-st-bedside'),
        item('sample-i4', '小说合集', '书籍', 'sample-bedroom', 'sample-st-books', 12),
        item('sample-i5', '笔记本电脑', '电子', 'sample-bedroom', 'sample-st-desk'),
        item('sample-i6', '螺丝刀套装', '工具', 'sample-balcony', 'sample-st-tools'),
        item('sample-i7', '行李箱', '其他', 'sample-balcony', 'sample-st-luggage', 2),
        item('sample-i8', '运动鞋', '衣物', 'sample-entrance', 'sample-st-shoe', 4),
        item('sample-i9', '大米', '食品', 'sample-kitchen', 'sample-st-pantry', 3),
        item('sample-i10', '备用钥匙', '其他', 'sample-entrance', null, 1, '未入柜'),
    ];
}
