/*============================================================================
  plan-search — 顶部快捷搜索的纯函数

  搜索是浏览模式的主入口，一次搜三样东西：
    · 物品   —— 最常找的，"我的登山包在哪"
    · 储物设备 —— "衣柜里有什么"
    · 房间   —— "主卧在哪"
  结果按「名称完全相同 > 前缀 > 包含」排序，同档里物品略微靠前——
  用户输入的三次里有两次是在找东西，不是找房间。

  纯函数、零运行时依赖：node:test 里可以直接跑。
============================================================================*/

import type { Room, StorageDevice, StoredItem } from '@/app/types';

export type SearchKind = 'room' | 'storage' | 'item';

export interface SearchHit {
    kind: SearchKind;
    /** 命中对象的 id；房间就是房间 id，储物设备是设备 id，物品是物品 id */
    id: string;
    title: string;
    /** 次要说明：房间显示面积，储物设备与物品显示所在位置 */
    detail: string;
    /** 一律带房间 id：点结果时要能定位到画布上的某个房间 */
    roomId: string;
    storageId: string | null;
    score: number;
}

/** 去掉空白再比：用户不会记得名字里到底有没有空格。 */
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** 同档之内物品优先于储物设备，储物设备优先于房间。 */
const KIND_BONUS: Record<SearchKind, number> = { item: 40, storage: 20, room: 0 };

/** 与 stores/floor-plan.ts 的 roomArea 同一条公式（0.1 m² 精度）。 */
function areaOf(room: Room): string {
    return (Math.round((room.width * room.height) / 360) / 10).toFixed(1);
}

/** 名称匹配得分；不匹配返回 null，调用方据此跳过。 */
function scoreOf(name: string, query: string): number | null {
    const text = normalize(name);
    const index = text.indexOf(query);
    if (index === -1) return null;
    if (text === query) return 1000;
    if (index === 0) return 700 - text.length;
    return 400 - index;
}

export interface SearchSource {
    rooms: Room[];
    storage: StorageDevice[];
    items: StoredItem[];
}

/**
 * 三张表一起搜，返回按相关度排序的前 limit 条。
 * 储物设备与物品的位置说明都写成「房间 · 设备」，和界面上看到的层级一致。
 */
export function searchPlan(source: SearchSource, rawQuery: string, limit = 8): SearchHit[] {
    const query = normalize(rawQuery);
    if (!query) return [];

    const { rooms, storage, items } = source;
    const roomName = new Map(rooms.map((room) => [room.id, room.name]));
    const deviceName = new Map(storage.map((device) => [device.id, device.name]));
    const hits: SearchHit[] = [];

    for (const item of items) {
        const base = scoreOf(item.name, query);
        if (base === null) continue;
        const room = roomName.get(item.roomId) ?? '未归位';
        const place = item.storageId ? (deviceName.get(item.storageId) ?? '') : '';
        hits.push({
            kind: 'item',
            id: item.id,
            title: item.name,
            detail: place ? `${room} · ${place}` : room,
            roomId: item.roomId,
            storageId: item.storageId,
            score: base + KIND_BONUS.item,
        });
    }

    for (const device of storage) {
        const base = scoreOf(device.name, query);
        if (base === null) continue;
        const count = items.filter((item) => item.storageId === device.id).length;
        hits.push({
            kind: 'storage',
            id: device.id,
            title: device.name,
            detail: `${roomName.get(device.roomId) ?? '未归位'} · ${count} 件物品`,
            roomId: device.roomId,
            storageId: device.id,
            score: base + KIND_BONUS.storage,
        });
    }

    for (const room of rooms) {
        const base = scoreOf(room.name, query);
        if (base === null) continue;
        hits.push({
            kind: 'room',
            id: room.id,
            title: room.name,
            detail: `${areaOf(room)} m² · ${room.openings.length} 处门窗`,
            roomId: room.id,
            storageId: null,
            score: base + KIND_BONUS.room,
        });
    }

    return hits
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh'))
        .slice(0, Math.max(0, limit));
}
