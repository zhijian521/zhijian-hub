import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeStorage, layoutStorage, storageBoxOf } from '../src/renderer/lib/plan-storage.ts';
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
