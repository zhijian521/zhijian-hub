import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    FURNITURE_GROUPS,
    FURNITURE_PRESETS,
    FURNITURE_ROTATIONS,
    hasBack,
    isThinFurniture,
    isSideways,
    normalizeRotation,
    furnitureDrawing,
    presetOf,
    TONES,
} from '../src/renderer/lib/furniture-catalog.ts';

/*============================================================================
  furniture-catalog — 家具原型库与平面画法

  家具与储物是一件事，家具库只是同一张表的一组原型。这个文件守住四件事：
    · 原型尺寸是真实住宅尺寸（60px = 1m），并且都落在画板能接受的范围内
    · 每件家具都有自己的一笔细节，不是统一方块
    · 内部细节永远不越出家具轮廓（"画好边界"在家具这一层的底线）
    · 转角 90 度时宽深互换，占地仍是轴对齐矩形
============================================================================*/

const SIZE = (preset: (typeof FURNITURE_PRESETS)[number]) => preset.width + preset.height;

describe('furniture-catalog · 原型库', () => {
    it('不只几件摆设：床、柜、沙发、家电这些常客都在', () => {
        const names = FURNITURE_PRESETS.map((preset) => preset.name);
        for (const expected of ['双人床', '衣柜', '书柜', '三人沙发', '冰箱']) {
            assert.ok(names.includes(expected), `家具库缺少「${expected}」`);
        }
        assert.ok(FURNITURE_PRESETS.length >= 12, '常见家具至少要十几件');
    });

    it('尺寸按 60px = 1m 折算，且没有一件小到看不见', () => {
        for (const preset of FURNITURE_PRESETS) {
            assert.ok(preset.width >= 20 && preset.height >= 20, `${preset.name} 太小`);
            assert.ok(preset.width <= 200 && preset.height <= 200, `${preset.name} 太大`);
        }
        // 双人床 1500 × 2000 mm → 90 × 120px，这是整张表的基准。
        assert.equal(presetOf('bed-double')?.width, 90);
        assert.equal(presetOf('bed-double')?.height, 120);
    });

    it('原型 id 唯一，配色与画法都在白名单里', () => {
        const ids = new Set<string>();
        for (const preset of FURNITURE_PRESETS) {
            assert.equal(ids.has(preset.id), false, `重复的 id：${preset.id}`);
            ids.add(preset.id);
            assert.ok(TONES[preset.tone], `${preset.name} 的配色不存在`);
            assert.ok(preset.hint.length > 0, `${preset.name} 缺一句摆放提示`);
        }
    });

    it('presetOf 找不到就返回 null，老数据没有原型也不崩', () => {
        assert.equal(presetOf('wardrobe')?.name, '衣柜');
        assert.equal(presetOf(null), null);
        assert.equal(presetOf(undefined), null);
        assert.equal(presetOf(''), null);
        assert.equal(presetOf('不存在的东西'), null);
    });
});

describe('furniture-catalog · 平面画法', () => {
    it('每件家具都是「轮廓 + 自己的细节」，细节数量随类型不同', () => {
        const counts = new Map<string, number>();
        for (const preset of FURNITURE_PRESETS) {
            const drawing = furnitureDrawing({
                preset: preset.id,
                width: preset.width,
                height: preset.height,
            });
            assert.ok(drawing.shapes.length >= 2, `${preset.name} 只有一块方块`);
            counts.set(preset.detail, (counts.get(preset.detail) ?? 0) + 1);
        }
        // 六种画法都被用上了，不是所有家具共用一套。
        assert.equal(counts.size >= 5, true, '细节类型太集中');
    });

    it('内部细节不越出家具轮廓', () => {
        for (const preset of FURNITURE_PRESETS) {
            const drawing = furnitureDrawing({
                preset: preset.id,
                width: preset.width,
                height: preset.height,
            });
            for (const shape of drawing.shapes) {
                if (shape.kind === 'rect') {
                    assert.ok((shape.x ?? 0) >= -0.01, `${preset.name} 左越界`);
                    assert.ok((shape.y ?? 0) >= -0.01, `${preset.name} 上越界`);
                    assert.ok(
                        (shape.x ?? 0) + (shape.width ?? 0) <= drawing.localWidth + 0.01,
                        `${preset.name} 右越界`,
                    );
                    assert.ok(
                        (shape.y ?? 0) + (shape.height ?? 0) <= drawing.localHeight + 0.01,
                        `${preset.name} 下越界`,
                    );
                } else if (shape.kind === 'ellipse') {
                    assert.ok(
                        (shape.cx ?? 0) - (shape.rx ?? 0) >= -0.01,
                        `${preset.name} 椭圆左越界`,
                    );
                    assert.ok(
                        (shape.cy ?? 0) - (shape.ry ?? 0) >= -0.01,
                        `${preset.name} 椭圆上越界`,
                    );
                    assert.ok(
                        (shape.cx ?? 0) + (shape.rx ?? 0) <= drawing.localWidth + 0.01,
                        `${preset.name} 椭圆右越界`,
                    );
                    assert.ok(
                        (shape.cy ?? 0) + (shape.ry ?? 0) <= drawing.localHeight + 0.01,
                        `${preset.name} 椭圆下越界`,
                    );
                } else {
                    for (const value of [shape.x1, shape.x2]) {
                        assert.ok(
                            (value ?? 0) >= -0.01 && (value ?? 0) <= drawing.localWidth + 0.01,
                        );
                    }
                    for (const value of [shape.y1, shape.y2]) {
                        assert.ok(
                            (value ?? 0) >= -0.01 && (value ?? 0) <= drawing.localHeight + 0.01,
                        );
                    }
                }
            }
        }
    });

    it('缩到很小也不会把细节算到轮廓外面（比例一律按尺寸算）', () => {
        for (const size of [20, 24, 30]) {
            const drawing = furnitureDrawing({ preset: 'bed-double', width: size, height: size });
            const body = drawing.shapes[0]!;
            assert.equal(body.width, size);
            for (const shape of drawing.shapes) {
                if (shape.kind === 'line') {
                    assert.ok((shape.x1 ?? 0) <= size + 0.01);
                    assert.ok((shape.y1 ?? 0) <= size + 0.01);
                }
            }
        }
    });

    it('90 / 270 度时宽深互换，0 / 180 度时不动，占地始终是轴对齐矩形', () => {
        const flat = furnitureDrawing({ preset: 'bed-double', width: 90, height: 120 });
        const turned = furnitureDrawing({
            preset: 'bed-double',
            width: 120,
            height: 90,
            rotation: 90,
        });
        const upsideDown = furnitureDrawing({
            preset: 'bed-double',
            width: 90,
            height: 120,
            rotation: 180,
        });
        const theOtherWay = furnitureDrawing({
            preset: 'bed-double',
            width: 120,
            height: 90,
            rotation: 270,
        });
        assert.deepEqual([flat.localWidth, flat.localHeight], [90, 120]);
        assert.deepEqual([turned.localWidth, turned.localHeight], [90, 120]);
        assert.equal(turned.rotation, 90);
        // 180 度只是转半圈，宽深不该对调。
        assert.deepEqual([upsideDown.localWidth, upsideDown.localHeight], [90, 120]);
        assert.equal(upsideDown.rotation, 180);
        assert.deepEqual([theOtherWay.localWidth, theOtherWay.localHeight], [90, 120]);
        assert.equal(theOtherWay.rotation, 270);
        // 斜着摆没有意义：认不出的角度一律当作不转。
        assert.equal(
            furnitureDrawing({ preset: 'desk', width: 72, height: 36, rotation: 45 }).rotation,
            0,
        );
    });

    it('normalizeRotation 只放行直角四档，isSideways 只认 90 / 270', () => {
        assert.equal(normalizeRotation(0), 0);
        assert.equal(normalizeRotation(90), 90);
        assert.equal(normalizeRotation(180), 180);
        assert.equal(normalizeRotation(270), 270);
        assert.equal(normalizeRotation(45), 0);
        assert.equal(normalizeRotation(null), 0);
        assert.equal(normalizeRotation(undefined), 0);
        assert.deepEqual(
            FURNITURE_ROTATIONS.map((value) => isSideways(value)),
            [false, true, false, true],
        );
    });

    it('没有原型的旧家具退回通用柜子画法，不报错', () => {
        const drawing = furnitureDrawing({ preset: null, width: 60, height: 30 });
        assert.equal(drawing.shapes.length >= 2, true);
        assert.equal(drawing.localWidth, 60);
    });
});

describe('furniture-catalog · 分组与画法层次', () => {
    it('原型够多，并且五组都有人', () => {
        assert.ok(FURNITURE_PRESETS.length >= 28, '常见家具至少要有近三十件');
        for (const group of FURNITURE_GROUPS) {
            assert.ok(
                FURNITURE_PRESETS.some((preset) => preset.group === group.id),
                `「${group.label}」组里一件家具都没有`,
            );
        }
        const grouped = new Set(FURNITURE_PRESETS.map((preset) => preset.group));
        assert.equal(grouped.size, FURNITURE_GROUPS.length, '有家具落在没登记的组里');
    });

    it('每件都是「轮廓 + 受光 + 细节」，不是一块平色', () => {
        for (const preset of FURNITURE_PRESETS) {
            const drawing = furnitureDrawing({
                preset: preset.id,
                width: preset.width,
                height: preset.height,
            });
            // 至少 4 笔：本体、受光带、落影带、一处细节。
            assert.ok(
                drawing.shapes.length >= 4,
                `${preset.name} 只有 ${drawing.shapes.length} 笔`,
            );
        }
    });

    it('画法用上了椭圆：圆形的卫浴、绿植、灯都得是圆的', () => {
        const ellipsePresets = FURNITURE_PRESETS.filter((preset) =>
            furnitureDrawing({
                preset: preset.id,
                width: preset.width,
                height: preset.height,
            }).shapes.some((shape) => shape.kind === 'ellipse'),
        );
        assert.ok(ellipsePresets.length >= 4, '椭圆图元几乎没被用上');
    });

    it('缩到极小尺寸时椭圆也不会翻出轮廓', () => {
        for (const size of [20, 26]) {
            const drawing = furnitureDrawing({ preset: 'toilet', width: size, height: size });
            for (const shape of drawing.shapes) {
                if (shape.kind !== 'ellipse') continue;
                assert.ok((shape.cx ?? 0) - (shape.rx ?? 0) >= -0.01);
                assert.ok((shape.cx ?? 0) + (shape.rx ?? 0) <= size + 0.01);
                assert.ok((shape.cy ?? 0) + (shape.ry ?? 0) <= size + 0.01);
            }
        }
    });
});

describe('furniture-catalog · 背面与厚度', () => {
    it('有背面的家具才跟着墙转：床沙发柜子书架家电', () => {
        for (const id of ['bed-double', 'sofa', 'wardrobe', 'bookshelf', 'fridge', 'washer']) {
            assert.equal(hasBack(id), true, id + ' 应该有背面');
        }
        // 桌子椅子地毯绿植灯电视摆哪面都行，转它们只会平白换掉宽深。
        for (const id of ['dining-table', 'chair', 'rug', 'plant', 'floor-lamp', 'tv']) {
            assert.equal(hasBack(id), false, id + ' 不该跟着墙转');
        }
        // 没有原型的旧家具按柜子对待：贴墙总不会错。
        assert.equal(hasBack(null), true);
    });

    it('薄家具识别：电视地毯恒为薄，剩下靠进深 18px 兜底', () => {
        assert.equal(isThinFurniture('tv', 20), true);
        assert.equal(isThinFurniture('rug', 84), true);
        assert.equal(isThinFurniture('wardrobe', 36), false);
        assert.equal(isThinFurniture('cabinet-generic', 12), true);
        assert.equal(isThinFurniture(null, 24), false);
    });
});
