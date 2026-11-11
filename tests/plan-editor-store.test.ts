import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { useFloorPlanStore } from '../src/renderer/stores/floor-plan.ts';
import type { FloorPlanCommand, FloorPlanState } from '../src/renderer/app/types.ts';

describe('editor persistence and history', () => {
    it('sends cloneable reactive geometry and restores actual committed history', async () => {
        setActivePinia(createPinia());
        let saved: FloorPlanState = {
            plan: { id: 'singleton', name: '家', roomSeq: 1, createdAt: '2026-11-10' },
            rooms: [
                {
                    id: 'a',
                    name: '卧室',
                    x: 0,
                    y: 0,
                    width: 216,
                    height: 216,
                    floor: null,
                    openings: [
                        {
                            id: 'door',
                            kind: 'door',
                            wall: 'bottom',
                            pos: 144,
                            width: 54,
                            hinge: 'start',
                            swing: 'in',
                            depth: 26,
                        },
                    ],
                },
            ],
            // 撤销快照要连储物设备与物品一起还原，夹具里必须有这两张表。
            storage: [{ id: 'st', roomId: 'a', name: '衣柜', kind: 'cabinet' as const }],
            items: [
                {
                    id: 'i1',
                    name: '被子',
                    category: '衣物',
                    quantity: 1,
                    note: '',
                    roomId: 'a',
                    storageId: 'st',
                },
            ],
        };
        let fail = false;
        const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                zhijian: {
                    loadFloorPlan: async () => structuredClone(saved),
                    mutateFloorPlan: async (command: FloorPlanCommand) => {
                        const payload = structuredClone(command); // same boundary requirement as Electron
                        if (fail) return { ok: false, message: '模拟磁盘写入失败' };
                        if (payload.type === 'resize-room')
                            saved.rooms[0] = { ...saved.rooms[0]!, ...payload.rect };
                        if (payload.type === 'replace-rooms') {
                            saved.rooms = payload.rooms;
                            saved.storage = payload.storage ?? [];
                            saved.items = payload.items ?? [];
                        }
                        return { ok: true, state: structuredClone(saved) };
                    },
                },
            },
        });
        try {
            const store = useFloorPlanStore();
            await store.load();
            store.select('a');
            const rect = reactive({ ...store.selectedRoom!, width: 210 });
            assert.equal(await store.resizeRoom('a', rect), true);
            assert.equal(store.rooms[0]!.width, 210);
            assert.equal(store.canUndo, true);
            await store.undo();
            assert.equal(store.rooms[0]!.width, 216);
            assert.equal(store.rooms[0]!.openings[0]!.width, 54);
            assert.equal(store.storage.length, 1, '撤销不会抹掉储物设备');
            assert.equal(store.items[0]!.name, '被子', '撤销不会抹掉物品');
            assert.equal(store.canRedo, true);
            await store.redo();
            assert.equal(store.rooms[0]!.width, 210);
            fail = true;
            assert.equal(await store.resizeRoom('a', { ...rect, width: 204 }), false);
            assert.equal(
                store.rooms[0]!.width,
                210,
                'failed save does not overwrite committed geometry',
            );
            await store.undo();
            assert.equal(store.canUndo, true, 'failed undo preserves its history entry');
            fail = false;
            await store.undo();
            assert.equal(store.rooms[0]!.width, 216);
        } finally {
            if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
});
