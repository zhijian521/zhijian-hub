import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    boxInsideRoom,
    describeStorage,
    furnitureSize,
    layoutStorage,
    placedBox,
    roomAtPoint,
    snapFurnitureToWall,
    storageBoxOf,
    WALL_SNAP,
} from '../src/renderer/lib/plan-storage.ts';
import type { Room, StorageDevice } from '../src/renderer/app/types.ts';

/*============================================================================
  plan-storage — 储物设备怎么摆

  设备不做自由拖拽，位置完全由房间算出来。这个文件守住三件事：
    · 所有方框都落在自己房间的边界内（这是「画好边界」那条要求的底线）
    · 同一个房间里的设备不重叠
    · 找不到房间时不编造位置
============================================================================*/

function room(id: string, name: string, width = 216, height = 216): Room {
    return {
        id,
        name,
        x: 100,
        y: 50,
        width,
        height,
        floor: null,
        outdoor: false,
        openWalls: [],
        openings: [],
    };
}

function device(
    id: string,
    roomId: string,
    name: string,
    kind: StorageDevice['kind'] = 'cabinet',
): StorageDevice {
    return { id, roomId, name, kind };
}

describe('plan-storage', () => {
    it('每个方框都落在所属房间内', () => {
        const rooms = [room('r1', '主卧'), room('r2', '厨房', 150, 150)];
        const storage = [
            device('a', 'r1', '衣柜'),
            device('b', 'r1', '床头柜', 'box'),
            device('c', 'r2', '食品柜'),
        ];
        for (const box of layoutStorage(rooms, storage)) {
            const owner = rooms.find((entry) => entry.id === box.roomId)!;
            assert.ok(box.x >= owner.x, `${box.name} 左边界越界`);
            assert.ok(box.y >= owner.y, `${box.name} 上边界越界`);
            assert.ok(box.x + box.width <= owner.x + owner.width, `${box.name} 右边界越界`);
            assert.ok(box.y + box.height <= owner.y + owner.height, `${box.name} 下边界越界`);
        }
    });

    it('同一房间里的方框互不重叠', () => {
        const rooms = [room('r1', '主卧')];
        const storage = Array.from({ length: 6 }, (_, index) =>
            device(`d${index}`, 'r1', `柜子${index}`),
        );
        const boxes = layoutStorage(rooms, storage);
        assert.equal(boxes.length, 6);
        for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
                const a = boxes[i]!;
                const b = boxes[j]!;
                const overlap =
                    a.x < b.x + b.width &&
                    b.x < a.x + a.width &&
                    a.y < b.y + b.height &&
                    b.y < a.y + a.height;
                assert.equal(overlap, false, `${a.name} 与 ${b.name} 重叠`);
            }
        }
    });

    it('房间很窄时只排一列，不会挤成负宽', () => {
        const rooms = [room('r1', '储物间', 60, 60)];
        const storage = [device('a', 'r1', '架子', 'shelf'), device('b', 'r1', '箱子', 'box')];
        for (const box of layoutStorage(rooms, storage)) {
            assert.ok(box.width >= 16);
            assert.ok(box.x + box.width <= 100 + 60);
        }
    });

    it('箱子比柜子矮，家具比柜子高', () => {
        const rooms = [room('r1', '主卧')];
        const boxes = layoutStorage(rooms, [
            device('a', 'r1', '柜'),
            device('b', 'r1', '箱', 'box'),
            device('c', 'r1', '床', 'furniture'),
        ]);
        const height = (name: string) => boxes.find((box) => box.name === name)!.height;
        assert.ok(height('箱') < height('柜'));
        assert.ok(height('床') > height('柜'));
    });

    it('没有设备的房间不产出方框', () => {
        assert.deepEqual(layoutStorage([room('r1', '空房')], []), []);
    });

    it('storageBoxOf 找得到、找不到返回 null', () => {
        const boxes = layoutStorage([room('r1', '主卧')], [device('a', 'r1', '衣柜')]);
        assert.equal(storageBoxOf(boxes, 'a')?.name, '衣柜');
        assert.equal(storageBoxOf(boxes, 'nope'), null);
    });

    it('describeStorage 写出「房间 · 设备」，找不到房间时只说设备名', () => {
        const rooms = [room('r1', '主卧')];
        const storage = [device('a', 'r1', '衣柜'), device('b', 'r9', '无主柜')];
        assert.equal(describeStorage(rooms, storage, 'a'), '主卧 · 衣柜');
        assert.equal(describeStorage(rooms, storage, 'b'), '无主柜');
        assert.equal(describeStorage(rooms, storage, 'nope'), null);
    });
});

/*============================================================================
  拖放：家具由用户摆过之后，位置就存下来了
============================================================================*/

describe('plan-storage · 摆过的家具', () => {
    it('没摆过（缺坐标）时返回 null，交给自动网格', () => {
        assert.equal(placedBox(room('r1', '主卧'), device('a', 'r1', '衣柜')), null);
    });

    it('摆过就原样返回，原型与转角一并带上', () => {
        const placed: StorageDevice = {
            ...device('a', 'r1', '衣柜'),
            preset: 'wardrobe',
            x: 130,
            y: 60,
            width: 108,
            height: 36,
            rotation: 90,
        };
        const box = placedBox(room('r1', '主卧'), placed)!;
        assert.deepEqual(
            { x: box.x, y: box.y, width: box.width, height: box.height },
            { x: 130, y: 60, width: 108, height: 36 },
        );
        assert.equal(box.preset, 'wardrobe');
        assert.equal(box.rotation, 90);
    });

    it('furnitureSize 报的是家具本体宽深：侧着摆时与占地框对调', () => {
        const placed: StorageDevice = {
            ...device('a', 'r1', '衣柜'),
            preset: 'wardrobe',
            x: 130,
            y: 60,
            width: 108,
            height: 36,
            rotation: 270,
        };
        const box = placedBox(room('r1', '主卧'), placed)!;
        // 占地框仍然是存下来的 108×36，本体尺寸要换回 36×108。
        assert.deepEqual({ w: box.width, h: box.height }, { w: 108, h: 36 });
        const size = furnitureSize(box);
        assert.deepEqual({ w: size.width, h: size.height }, { w: 36, h: 108 });
    });

    it('0 度与 180 度不改占地宽深，脏转角退回 0 度', () => {
        const base = { ...device('a', 'r1', '衣柜'), preset: 'wardrobe', x: 130, y: 60 };
        const upside = placedBox(room('r1', '主卧'), {
            ...base,
            width: 108,
            height: 36,
            rotation: 180,
        })!;
        assert.equal(upside.rotation, 180);
        assert.deepEqual(furnitureSize(upside), { width: 108, height: 36 });
        const dirty = placedBox(room('r1', '主卧'), {
            ...base,
            width: 108,
            height: 36,
            rotation: 45,
        })!;
        assert.equal(dirty.rotation, 0);
    });

    it('房间缩小后把家具夹回边界内（右 / 下边界优先）', () => {
        const small = room('r1', '小房', 120, 120);
        const placed: StorageDevice = {
            ...device('a', 'r1', '衣柜'),
            x: 200,
            y: 190,
            width: 108,
            height: 36,
        };
        const box = placedBox(small, placed)!;
        assert.ok(box.x >= small.x);
        assert.ok(box.x + box.width <= small.x + small.width + 0.01);
        assert.ok(box.y + box.height <= small.y + small.height + 0.01);
    });

    it('摆过的家具与没摆过的一起排时，摆过的保持坐标', () => {
        const rooms = [room('r1', '主卧')];
        const storage: StorageDevice[] = [
            { ...device('a', 'r1', '衣柜'), x: 200, y: 150, width: 108, height: 36 },
            device('b', 'r1', '床头柜'),
        ];
        const boxes = layoutStorage(rooms, storage);
        const fixed = boxes.find((box) => box.id === 'a')!;
        assert.deepEqual({ x: fixed.x, y: fixed.y }, { x: 200, y: 150 });
        assert.equal(boxes.find((box) => box.id === 'b')!.preset, null);
    });

    it('boxInsideRoom 只认完整落在房间里的矩形', () => {
        const r = room('r1', '主卧');
        assert.equal(boxInsideRoom(r, { x: 100, y: 50, width: 216, height: 216 }), true);
        assert.equal(boxInsideRoom(r, { x: 99, y: 50, width: 216, height: 216 }), false);
        assert.equal(boxInsideRoom(r, { x: 100, y: 50, width: 217, height: 216 }), false);
    });

    it('roomAtPoint 找出指针压在哪个房间，空白处返回 null', () => {
        // 两间房左右并排，指针落在哪一格就返回哪一格。
        const rooms = [room('r1', '主卧'), { ...room('r2', '厨房', 120, 120), x: 340, y: 50 }];
        assert.equal(roomAtPoint(rooms, 150, 100)?.id, 'r1');
        assert.equal(roomAtPoint(rooms, 380, 100)?.id, 'r2');
        assert.equal(roomAtPoint(rooms, 0, 0), null);
    });
});

describe('plan-storage · 靠墙吸附', () => {
    // 主卧 216×216，原点在 (100, 50)：可用边界是 100–316 / 50–266。
    const master = room('r1', '主卧');

    it('离墙够近就贴上去，并把背板转向那面墙', () => {
        // 衣柜 108×36 放在离顶墙 6px 的位置：贴上去 y 归零、背板朝上（0°）。
        const top = snapFurnitureToWall(master, {
            x: 150,
            y: 56,
            width: 108,
            height: 36,
            rotation: 0,
            preset: 'wardrobe',
        })!;
        assert.equal(top.wall, 'top');
        assert.equal(top.y, master.y);
        assert.equal(top.rotation, 0);
        // 落在底墙：背板朝下，也就是 180°，占地宽深不变。
        const bottom = snapFurnitureToWall(master, {
            x: 150,
            y: 266 - 36 - 5,
            width: 108,
            height: 36,
            rotation: 0,
            preset: 'wardrobe',
        })!;
        assert.equal(bottom.wall, 'bottom');
        assert.equal(bottom.y + bottom.height, master.y + master.height);
        assert.equal(bottom.rotation, 180);
        // 落在左墙：背板朝左，转 270°，占地宽深对调成 36×108。
        const left = snapFurnitureToWall(master, {
            x: 104,
            y: 120,
            width: 108,
            height: 36,
            rotation: 0,
            preset: 'wardrobe',
        })!;
        assert.equal(left.wall, 'left');
        assert.equal(left.x, master.x);
        assert.equal(left.rotation, 270);
        assert.deepEqual([left.width, left.height], [36, 108]);
        // 落在右墙：背板朝右，转 90°。
        const right = snapFurnitureToWall(master, {
            x: 316 - 108 - 4,
            y: 120,
            width: 108,
            height: 36,
            rotation: 0,
            preset: 'wardrobe',
        })!;
        assert.equal(right.wall, 'right');
        assert.equal(right.rotation, 90);
        assert.equal(right.x + right.width, master.x + master.width);
    });

    it('离墙太远就不吸附：不猜用户想要哪面墙', () => {
        const far = snapFurnitureToWall(master, {
            x: 180,
            y: 150,
            width: 60,
            height: 36,
            rotation: 0,
            preset: 'wardrobe',
        });
        assert.equal(far, null);
        // 阈值可以调：放宽到 120px 就贴上了。这个位置离右墙最近（76px），
        // 所以贴的是右墙而不是更远的顶墙（100px）/ 底墙与左墙（80px）。
        assert.equal(
            snapFurnitureToWall(
                master,
                { x: 180, y: 150, width: 60, height: 36, rotation: 0, preset: 'wardrobe' },
                { threshold: 120 },
            )?.wall,
            'right',
        );
        assert.ok(WALL_SNAP > 0);
    });

    it('桌子椅子地毯这类对称家具只贴位置、不转朝向', () => {
        // 餐桌 84×48 贴顶墙：位置归零，但仍是 0°（转它只会平白换掉宽深）。
        const table = snapFurnitureToWall(master, {
            x: 150,
            y: 53,
            width: 84,
            height: 48,
            rotation: 0,
            preset: 'dining-table',
        })!;
        assert.equal(table.wall, 'top');
        assert.equal(table.rotation, 0);
        assert.deepEqual([table.width, table.height], [84, 48]);
        // 明确说 faceWall: false 时，有背板的柜子也不转。
        const plain = snapFurnitureToWall(
            master,
            { x: 104, y: 120, width: 108, height: 36, rotation: 0, preset: 'wardrobe' },
            { faceWall: false },
        )!;
        assert.equal(plain.rotation, 0);
        assert.deepEqual([plain.width, plain.height], [108, 36]);
    });

    it('转过来塞不进房间就退回「只贴墙、不转」', () => {
        // 一条又窄又高的房间：180×60。衣柜 150×40 贴左墙要转成 40 宽 150 深，塞不进 60 的净高。
        const narrow: Room = { ...room('n', '窄间', 180, 60), x: 0, y: 0 };
        const snap = snapFurnitureToWall(narrow, {
            x: 3,
            y: 10,
            width: 150,
            height: 40,
            rotation: 0,
            preset: 'wardrobe',
        });
        assert.ok(snap, '应该退回「不转、只贴墙」而不是放弃');
        assert.equal(snap!.rotation, 0);
        assert.equal(snap!.x, narrow.x);
    });

    it('吸附结果永远落在房间内，且离墙那一侧严格贴边', () => {
        const cases: { x: number; y: number; width: number; height: number }[] = [
            { x: 102, y: 200, width: 108, height: 36 },
            { x: 310, y: 200, width: 108, height: 36 },
            { x: 200, y: 52, width: 60, height: 30 },
            { x: 200, y: 262, width: 60, height: 30 },
        ];
        for (const entry of cases) {
            const snap = snapFurnitureToWall(master, { ...entry, rotation: 0, preset: 'wardrobe' });
            assert.ok(snap, JSON.stringify(entry) + ' 应该吸附');
            assert.ok(snap!.x >= master.x - 0.01 && snap!.y >= master.y - 0.01);
            assert.ok(snap!.x + snap!.width <= master.x + master.width + 0.01);
            assert.ok(snap!.y + snap!.height <= master.y + master.height + 0.01);
        }
    });
});
