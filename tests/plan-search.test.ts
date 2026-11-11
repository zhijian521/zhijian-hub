import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchPlan } from '../src/renderer/lib/plan-search.ts';
import type { Room, StorageDevice, StoredItem } from '../src/renderer/app/types.ts';

/*============================================================================
  plan-search — 顶部搜索的排序规则

  搜索是浏览模式的主入口，一次搜三样东西：物品、储物设备、房间。
  这个文件守住四件事：
    · 空查询不出结果、limit 生效（下拉太长会盖住画板）
    · 匹配等级（完全相同 > 前缀 > 包含）大于类型偏好
    · 同档之内物品排在柜子和房间之前
    · 每条命中都带 roomId，点得到画布上的某个房间
============================================================================*/

function room(name: string, openings = 0): Room {
    return {
        id: `room-${name}`,
        name,
        x: 0,
        y: 0,
        width: 216,
        height: 216,
        floor: null,
        openings: Array.from({ length: openings }, (_, index) => ({
            id: `opening-${index}`,
            kind: 'door' as const,
            wall: 'top' as const,
            pos: index * 60,
            width: 54,
            hinge: 'start' as const,
            swing: 'in' as const,
            depth: 26,
        })),
    };
}

function device(id: string, roomId: string, name: string): StorageDevice {
    return { id, roomId, name, kind: 'cabinet' };
}

function item(
    id: string,
    roomId: string,
    name: string,
    storageId: string | null = null,
): StoredItem {
    return { id, roomId, name, category: '衣物', quantity: 1, note: '', storageId };
}

const empty = { rooms: [] as Room[], storage: [] as StorageDevice[], items: [] as StoredItem[] };

describe('plan-search', () => {
    it('空查询不出结果', () => {
        const source = { ...empty, rooms: [room('主卧')] };
        assert.deepEqual(searchPlan(source, ''), []);
        assert.deepEqual(searchPlan(source, '   '), []);
    });

    it('完全相同排在包含之前，前缀排在中间', () => {
        const source = { ...empty, rooms: [room('主卧室'), room('次卧'), room('卧室')] };
        const hits = searchPlan(source, '卧室');
        assert.deepEqual(
            hits.map((hit) => hit.title),
            ['卧室', '主卧室'],
        );
    });

    it('忽略空白与大小写', () => {
        const source = { ...empty, rooms: [room('Guest Room')] };
        const hits = searchPlan(source, 'guestroom');
        assert.equal(hits.length, 1);
        assert.equal(hits[0]!.roomId, 'room-Guest Room');
    });

    it('房间结果显示面积与门窗数', () => {
        const source = { ...empty, rooms: [room('厨房', 2)] };
        const [hit] = searchPlan(source, '厨');
        assert.equal(hit!.kind, 'room');
        assert.equal(hit!.detail, '13.0 m² · 2 处门窗');
    });

    it('物品结果写出「房间 · 柜子」，没入柜的只写房间', () => {
        const source = {
            rooms: [room('主卧')],
            storage: [device('st-1', 'room-主卧', '衣柜')],
            items: [
                item('i-1', 'room-主卧', '被子', 'st-1'),
                item('i-2', 'room-主卧', '备用钥匙', null),
            ],
        };
        const inCabinet = searchPlan(source, '被子')[0]!;
        assert.equal(inCabinet.kind, 'item');
        assert.equal(inCabinet.detail, '主卧 · 衣柜');
        assert.equal(inCabinet.storageId, 'st-1');

        const loose = searchPlan(source, '钥匙')[0]!;
        assert.equal(loose.detail, '主卧');
        assert.equal(loose.storageId, null);
    });

    it('柜子结果显示所在房间与物品件数', () => {
        const source = {
            rooms: [room('主卧')],
            storage: [device('st-1', 'room-主卧', '衣柜')],
            items: [
                item('i-1', 'room-主卧', '被子', 'st-1'),
                item('i-2', 'room-主卧', '外套', 'st-1'),
            ],
        };
        const [hit] = searchPlan(source, '衣柜');
        assert.equal(hit!.kind, 'storage');
        assert.equal(hit!.detail, '主卧 · 2 件物品');
    });

    it('同样精确时物品优先于柜子、柜子优先于房间', () => {
        const source = {
            rooms: [{ ...room('衣柜'), id: 'room-x' }],
            storage: [device('st-x', 'room-x', '衣柜')],
            items: [item('i-x', 'room-x', '衣柜')],
        };
        assert.deepEqual(
            searchPlan(source, '衣柜').map((hit) => hit.kind),
            ['item', 'storage', 'room'],
        );
    });

    it('每条命中都带 roomId，点结果能定位', () => {
        const source = {
            rooms: [room('主卧')],
            storage: [device('st-1', 'room-主卧', '衣柜')],
            items: [item('i-1', 'room-主卧', '被子', 'st-1')],
        };
        for (const hit of searchPlan(source, '衣柜')) {
            assert.equal(hit.roomId, 'room-主卧');
        }
        for (const hit of searchPlan(source, '被子')) {
            assert.equal(hit.roomId, 'room-主卧');
        }
    });

    it('limit 限制下拉长度并默认八条', () => {
        const rooms = Array.from({ length: 12 }, (_, index) => room(`房间${index}`));
        const source = { ...empty, rooms };
        assert.equal(searchPlan(source, '房间').length, 8);
        assert.equal(searchPlan(source, '房间', 3).length, 3);
    });

    it('没有命中时返回空数组，不抛错', () => {
        const source = { ...empty, rooms: [room('主卧')] };
        assert.deepEqual(searchPlan(source, '车库'), []);
    });
});
