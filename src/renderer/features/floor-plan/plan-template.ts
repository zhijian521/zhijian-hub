import type { Room, StorageDevice, StoredItem, WallSide, OpeningKind } from '@/app/types';

/** A connected two-bedroom reference plan, offered only on an empty drawing. */
export function exampleRooms(): Room[] {
    const opening = (
        id: string,
        kind: OpeningKind,
        wall: WallSide,
        pos: number,
        width: number,
    ) => ({ id, kind, wall, pos, width, hinge: 'start' as const });
    return [
        {
            id: 'sample-master',
            name: '主卧',
            x: 0,
            y: 0,
            width: 216,
            height: 216,
            floor: 'wood',
            openings: [
                opening('sample-d1', 'door', 'bottom', 144, 54),
                opening('sample-w1', 'window', 'top', 48, 120),
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
            openings: [
                opening('sample-d8', 'door', 'top', 228, 72),
                opening('sample-w5', 'window', 'bottom', 36, 324),
            ],
        },
    ];
}

/**
 * 示例储物设备：跟示例户型一起铺上，让「点柜子看里面有什么」一打开就能试。
 * 只在选择"用示例户型开始"时写入，从空白开始的用户拿到的是干净的空家。
 */
export function exampleStorage(): StorageDevice[] {
    return [
        { id: 'sample-st-wardrobe', roomId: 'sample-master', name: '衣柜', kind: 'cabinet' },
        { id: 'sample-st-bedside', roomId: 'sample-master', name: '床头柜', kind: 'furniture' },
        { id: 'sample-st-books', roomId: 'sample-bedroom', name: '书架', kind: 'shelf' },
        { id: 'sample-st-desk', roomId: 'sample-bedroom', name: '书桌', kind: 'furniture' },
        { id: 'sample-st-pantry', roomId: 'sample-kitchen', name: '食品柜', kind: 'cabinet' },
        { id: 'sample-st-tools', roomId: 'sample-balcony', name: '工具柜', kind: 'cabinet' },
        { id: 'sample-st-luggage', roomId: 'sample-balcony', name: '收纳箱', kind: 'box' },
        { id: 'sample-st-shoe', roomId: 'sample-entrance', name: '鞋柜', kind: 'cabinet' },
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
