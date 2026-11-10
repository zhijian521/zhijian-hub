import type { Room, WallSide, OpeningKind } from '@/app/types';

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
