import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomCanvas } from '@/components/features/room-canvas/room-canvas';
import { ContextMenu } from '@/components/ui/context-menu';
import { Dialog } from '@/components/ui/dialog';
import { InputDialog } from '@/components/ui/input-dialog';
import { ROOM_CANVAS_STORAGE_KEY } from '@/lib/utils/room-canvas-storage';

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
});

function mockCanvasSize(canvas: HTMLElement) {
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        toJSON: () => ({}),
    });
}

async function createRoomWithFurniture() {
    const canvas = screen.getByRole('region', { name: '房间布局画板' });
    mockCanvasSize(canvas);
    fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
    const room = await screen.findByRole('button', { name: '房间 1' });
    fireEvent.click(await screen.findByRole('button', { name: '添加家具' }));

    fireEvent.pointerDown(room, { button: 0, clientX: 360, clientY: 280, pointerId: 20 });
    fireEvent.pointerMove(window, { clientX: 420, clientY: 320, pointerId: 20 });
    fireEvent.pointerUp(window, { clientX: 420, clientY: 320, pointerId: 20 });

    return {
        room,
        furniture: await screen.findByRole('button', { name: '家具 1' }),
    };
}

function DialogHarness() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                打开弹窗
            </button>
            <Dialog open={open} title="测试弹窗" onClose={() => setOpen(false)}>
                <button type="button">确认</button>
            </Dialog>
        </>
    );
}

function ContextMenuHarness() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                打开菜单
            </button>
            {open && (
                <ContextMenu
                    x={window.innerWidth}
                    y={window.innerHeight}
                    ariaLabel="测试菜单"
                    items={[
                        { label: '重命名', onClick: vi.fn() },
                        { label: '删除', onClick: vi.fn() },
                    ]}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

describe('accessible overlays', () => {
    it('moves focus into the dialog and restores it after Escape', async () => {
        render(<DialogHarness />);
        const trigger = screen.getByRole('button', { name: '打开弹窗' });

        trigger.focus();
        fireEvent.click(trigger);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '确认' })));

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(document.activeElement).toBe(trigger);
    });

    it('associates the input with its visible label', () => {
        render(<InputDialog open title="修改名称" label="房间名称" onClose={vi.fn()} onConfirm={vi.fn()} />);

        expect(screen.getByLabelText('房间名称')).toBeInstanceOf(HTMLInputElement);
    });

    it('supports menu focus navigation and focus restoration', async () => {
        render(<ContextMenuHarness />);
        const trigger = screen.getByRole('button', { name: '打开菜单' });
        trigger.focus();
        fireEvent.click(trigger);

        const firstItem = await screen.findByRole('menuitem', { name: '重命名' });
        const secondItem = screen.getByRole('menuitem', { name: '删除' });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));

        fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(secondItem);
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
        expect(document.activeElement).toBe(trigger);
    });
});

describe('room canvas keyboard interaction', () => {
    it('restores rooms, keeps the next name and persists clearing the canvas', async () => {
        render(<RoomCanvas />);
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
        await waitFor(() => expect(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY)).not.toBeNull());

        cleanup();
        render(<RoomCanvas />);
        expect(await screen.findByRole('button', { name: '房间 1' })).toBeInstanceOf(HTMLButtonElement);

        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
        expect(screen.getByRole('button', { name: '房间 2' })).toBeInstanceOf(HTMLButtonElement);
        fireEvent.click(screen.getByRole('button', { name: '清空画板' }));
        await waitFor(() => {
            const document = JSON.parse(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY) ?? '{}') as {
                rooms?: unknown[];
            };
            expect(document.rooms).toEqual([]);
        });

        cleanup();
        render(<RoomCanvas />);
        await waitFor(() => expect(screen.queryByRole('button', { name: /^房间 \d+$/ })).toBeNull());
    });

    it('searches rooms and focuses the selected result on the canvas', async () => {
        render(<RoomCanvas gridSize={20} />);
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));

        fireEvent.click(screen.getByRole('button', { name: '搜索' }));
        const input = screen.getByRole('searchbox', { name: '搜索画板内容' });
        await waitFor(() => expect(document.activeElement).toBe(input));
        fireEvent.change(input, { target: { value: '房间 2' } });

        expect(screen.queryByRole('button', { name: '定位到房间 1' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '定位到房间 2' }));

        const room = screen.getByRole('button', { name: '房间 2' });
        expect(room.getAttribute('aria-pressed')).toBe('true');
        expect(room.dataset.highlighted).toBe('true');
        expect(screen.queryByRole('region', { name: '搜索画板' })).toBeNull();
    });

    it('cancels the focus transition before a new canvas interaction', () => {
        render(<RoomCanvas />);
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
        fireEvent.click(screen.getByRole('button', { name: '查看全部房间，共 1 个' }));
        fireEvent.click(screen.getByRole('button', { name: '定位到房间 1' }));

        const canvas = screen.getByRole('region', { name: '房间布局画板' });
        expect(canvas.className).toContain('canvasFocusing');

        fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100, pointerId: 10 });
        expect(canvas.className).not.toContain('canvasFocusing');
        fireEvent.pointerUp(window, { clientX: 100, clientY: 100, pointerId: 10 });
    });

    it('shows all rooms, switches panels and restores focus after Escape', async () => {
        render(<RoomCanvas />);
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));

        const roomsTrigger = screen.getByRole('button', { name: '查看全部房间，共 2 个' });
        fireEvent.click(roomsTrigger);
        expect(screen.getByRole('region', { name: '全部房间' })).toBeInstanceOf(HTMLElement);
        expect(screen.getAllByRole('button', { name: /^定位到房间/ })).toHaveLength(2);

        const searchTrigger = screen.getByRole('button', { name: '搜索' });
        fireEvent.click(searchTrigger);
        expect(screen.queryByRole('region', { name: '全部房间' })).toBeNull();

        const input = screen.getByRole('searchbox', { name: '搜索画板内容' });
        await waitFor(() => expect(document.activeElement).toBe(input));
        fireEvent.keyDown(input, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('region', { name: '搜索画板' })).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(searchTrigger));
    });

    it('does not start canvas interaction from the feature panel', () => {
        render(<RoomCanvas />);
        fireEvent.click(screen.getByRole('button', { name: '搜索' }));
        const input = screen.getByRole('searchbox', { name: '搜索画板内容' });

        fireEvent.pointerDown(input, { button: 0, clientX: 100, clientY: 100, pointerId: 9 });
        fireEvent.pointerMove(window, { clientX: 220, clientY: 180, pointerId: 9 });
        fireEvent.pointerUp(window, { clientX: 220, clientY: 180, pointerId: 9 });

        expect(screen.queryByRole('button', { name: /^房间 \d+$/ })).toBeNull();
    });

    it('undoes and redoes room creation from the toolbar', () => {
        render(<RoomCanvas />);
        const addRoom = screen.getByRole('button', { name: '添加房间' });
        const undo = screen.getByRole<HTMLButtonElement>('button', { name: '撤销' });
        const redo = screen.getByRole<HTMLButtonElement>('button', { name: '重做' });

        expect(undo.disabled).toBe(true);
        expect(redo.disabled).toBe(true);

        fireEvent.click(addRoom);
        expect(screen.getByRole('button', { name: '房间 1' })).toBeInstanceOf(HTMLButtonElement);
        expect(undo.disabled).toBe(false);

        fireEvent.click(undo);
        expect(screen.queryByRole('button', { name: '房间 1' })).toBeNull();
        expect(undo.disabled).toBe(true);
        expect(redo.disabled).toBe(false);

        fireEvent.click(redo);
        expect(screen.getByRole('button', { name: '房间 1' })).toBeInstanceOf(HTMLButtonElement);
        expect(undo.disabled).toBe(false);
        expect(redo.disabled).toBe(true);
    });

    it('undoes and redoes keyboard room movement with shortcuts', () => {
        render(<RoomCanvas gridSize={20} />);
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));

        const room = screen.getByRole('button', { name: '房间 1' });
        const startLeft = Number.parseFloat(room.style.left);
        fireEvent.keyDown(room, { key: 'ArrowRight' });
        expect(Number.parseFloat(room.style.left)).toBe(startLeft + 20);

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
        expect(Number.parseFloat(room.style.left)).toBe(startLeft);

        fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
        expect(Number.parseFloat(room.style.left)).toBe(startLeft + 20);

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
        fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
        expect(Number.parseFloat(room.style.left)).toBe(startLeft + 20);
    });

    it('creates furniture inside a room, clamps keyboard movement and restores it after reload', async () => {
        render(<RoomCanvas gridSize={20} />);
        const { room, furniture } = await createRoomWithFurniture();
        const roomLeft = Number.parseFloat(room.style.left);
        const roomWidth = Number.parseFloat(room.style.width);
        const furnitureWidth = Number.parseFloat(furniture.style.width);

        for (let index = 0; index < 10; index += 1) {
            fireEvent.keyDown(furniture, { key: 'ArrowRight' });
        }
        expect(Number.parseFloat(furniture.style.left)).toBe(roomLeft + roomWidth - furnitureWidth);

        await waitFor(() => {
            const storedDocument = JSON.parse(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY) ?? '{}') as {
                furniture?: unknown[];
            };
            expect(storedDocument.furniture).toHaveLength(1);
        });

        cleanup();
        render(<RoomCanvas gridSize={20} />);
        expect(await screen.findByRole('button', { name: '家具 1' })).toBeInstanceOf(HTMLButtonElement);
    });

    it('searches furniture and confirms cascading room deletion as one undoable action', async () => {
        render(<RoomCanvas gridSize={20} />);
        const { room, furniture } = await createRoomWithFurniture();

        fireEvent.click(screen.getByRole('button', { name: '搜索' }));
        const input = screen.getByRole('searchbox', { name: '搜索画板内容' });
        fireEvent.change(input, { target: { value: '家具 1' } });
        fireEvent.click(screen.getByRole('button', { name: '定位到家具 1（家具）' }));
        expect(furniture.dataset.highlighted).toBe('true');

        fireEvent.keyDown(room, { key: 'Delete' });
        const dialog = screen.getByRole('dialog', { name: '删除“房间 1”' });
        expect(within(dialog).getByText('1 件家具')).toBeInstanceOf(HTMLLIElement);
        fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
        expect(screen.queryByRole('button', { name: '房间 1' })).toBeNull();
        expect(screen.queryByRole('button', { name: '家具 1' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '撤销' }));
        expect(screen.getByRole('button', { name: '房间 1' })).toBeInstanceOf(HTMLButtonElement);
        expect(screen.getByRole('button', { name: '家具 1' })).toBeInstanceOf(HTMLButtonElement);
    });

    it('renames, transfers and deletes furniture from its detail workflow', async () => {
        render(<RoomCanvas gridSize={20} />);
        const { furniture } = await createRoomWithFurniture();
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
        const room2 = await screen.findByRole('button', { name: '房间 2' });

        fireEvent.focus(furniture);
        const roomSelect = await screen.findByLabelText('所属房间');
        const room2Option = screen.getByRole<HTMLOptionElement>('option', { name: '房间 2' });
        fireEvent.change(roomSelect, { target: { value: room2Option.value } });
        await waitFor(() => {
            const storedDocument = JSON.parse(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY) ?? '{}') as {
                furniture?: Array<{ roomId?: string }>;
            };
            expect(storedDocument.furniture?.[0]?.roomId).toBe(room2Option.value);
        });

        fireEvent.keyDown(furniture, { key: 'Enter' });
        const nameInput = screen.getByLabelText('家具名称');
        fireEvent.change(nameInput, { target: { value: '书柜' } });
        fireEvent.keyDown(nameInput, { key: 'Enter' });
        const renamedFurniture = await screen.findByRole('button', { name: '书柜' });
        expect(Number.parseFloat(renamedFurniture.style.left)).toBeGreaterThanOrEqual(
            Number.parseFloat(room2.style.left)
        );

        fireEvent.keyDown(renamedFurniture, { key: 'Delete' });
        expect(screen.queryByRole('button', { name: '书柜' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '撤销' }));
        expect(screen.getByRole('button', { name: '书柜' })).toBeInstanceOf(HTMLButtonElement);
    });

    it('creates, constrains, searches and restores a room storage device', async () => {
        render(<RoomCanvas gridSize={20} />);
        const canvas = screen.getByRole('region', { name: '房间布局画板' });
        mockCanvasSize(canvas);
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));
        const room = await screen.findByRole('button', { name: '房间 1' });

        fireEvent.click(screen.getByRole('button', { name: '添加储物设备' }));
        fireEvent.pointerDown(room, { button: 0, clientX: 360, clientY: 280, pointerId: 30 });
        fireEvent.pointerMove(window, { clientX: 400, clientY: 320, pointerId: 30 });
        fireEvent.pointerUp(window, { clientX: 400, clientY: 320, pointerId: 30 });

        const storageDevice = await screen.findByRole('button', { name: '储物设备 1' });
        const roomLeft = Number.parseFloat(room.style.left);
        const roomWidth = Number.parseFloat(room.style.width);
        const storageWidth = Number.parseFloat(storageDevice.style.width);
        for (let index = 0; index < 10; index += 1) {
            fireEvent.keyDown(storageDevice, { key: 'ArrowRight' });
        }
        expect(Number.parseFloat(storageDevice.style.left)).toBe(roomLeft + roomWidth - storageWidth);

        fireEvent.click(screen.getByRole('button', { name: '搜索' }));
        const input = screen.getByRole('searchbox', { name: '搜索画板内容' });
        fireEvent.change(input, { target: { value: '储物设备 1' } });
        fireEvent.click(screen.getByRole('button', { name: '定位到储物设备 1（储物设备）' }));
        expect(storageDevice.dataset.highlighted).toBe('true');

        await waitFor(() => {
            const storedDocument = JSON.parse(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY) ?? '{}') as {
                storageDevices?: unknown[];
            };
            expect(storedDocument.storageDevices).toHaveLength(1);
        });

        cleanup();
        render(<RoomCanvas gridSize={20} />);
        expect(await screen.findByRole('button', { name: '储物设备 1' })).toBeInstanceOf(HTMLButtonElement);
    });

    it('moves a storage device between furniture and rooms and restores cascading deletion', async () => {
        render(<RoomCanvas gridSize={20} />);
        const { room } = await createRoomWithFurniture();

        fireEvent.click(screen.getByRole('button', { name: '添加储物设备' }));
        expect(screen.queryByRole('button', { name: '储物设备 1' })).toBeNull();
        const locationSelect = screen.getByLabelText('存放位置');
        const roomOption = screen.getByRole<HTMLOptionElement>('option', { name: '房间 1（直接放置）' });
        fireEvent.change(locationSelect, { target: { value: roomOption.value } });
        expect(await screen.findByRole('button', { name: '储物设备 1' })).toBeInstanceOf(HTMLButtonElement);

        const furnitureOption = screen.getByRole<HTMLOptionElement>('option', { name: '家具 1' });
        fireEvent.change(locationSelect, { target: { value: furnitureOption.value } });
        expect(screen.queryByRole('button', { name: '储物设备 1' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '重命名' }));
        const nameInput = screen.getByLabelText('储物设备名称');
        fireEvent.change(nameInput, { target: { value: '抽屉盒' } });
        fireEvent.keyDown(nameInput, { key: 'Enter' });
        expect(await screen.findByText('抽屉盒')).toBeInstanceOf(HTMLElement);

        fireEvent.keyDown(room, { key: 'Delete' });
        const dialog = screen.getByRole('dialog', { name: '删除“房间 1”' });
        expect(within(dialog).getByText('1 件家具')).toBeInstanceOf(HTMLLIElement);
        expect(within(dialog).getByText('1 个储物设备')).toBeInstanceOf(HTMLLIElement);
        fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
        expect(screen.queryByRole('button', { name: '房间 1' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '撤销' }));
        expect(screen.getByRole('button', { name: '房间 1' })).toBeInstanceOf(HTMLButtonElement);
        fireEvent.click(screen.getByRole('button', { name: '搜索' }));
        fireEvent.change(screen.getByRole('searchbox', { name: '搜索画板内容' }), {
            target: { value: '抽屉盒' },
        });
        expect(screen.getByRole('button', { name: '定位到抽屉盒（储物设备）' })).toBeInstanceOf(HTMLButtonElement);
    });

    it('adds, searches, moves, deletes and restores items across storage locations', async () => {
        render(<RoomCanvas gridSize={20} />);
        const { furniture } = await createRoomWithFurniture();

        fireEvent.click(screen.getByRole('button', { name: '添加储物设备' }));
        fireEvent.click(screen.getByRole('button', { name: '添加物品' }));
        let itemDialog = screen.getByRole('dialog', { name: '添加物品' });
        fireEvent.pointerDown(within(itemDialog).getByLabelText('物品名称'));
        fireEvent.change(within(itemDialog).getByLabelText('物品名称'), { target: { value: '备用电池' } });
        fireEvent.change(within(itemDialog).getByLabelText('数量'), { target: { value: '3' } });
        fireEvent.click(within(itemDialog).getByRole('button', { name: '添加物品' }));

        expect(await screen.findByText('备用电池')).toBeInstanceOf(HTMLElement);
        expect(screen.getByRole('region', { name: '当前位置' })).toBeInstanceOf(HTMLElement);
        expect(screen.getByText('数量 × 3')).toBeInstanceOf(HTMLElement);

        fireEvent.click(screen.getByRole('button', { name: '搜索' }));
        fireEvent.change(screen.getByRole('searchbox', { name: '搜索画板内容' }), {
            target: { value: '备用电池' },
        });
        const result = screen.getByRole('button', { name: '定位到备用电池（物品）' });
        expect(result.textContent).toContain('房间 1 / 家具 1 / 储物设备 1 / 物品');
        fireEvent.click(result);
        expect(screen.getByText('备用电池').closest('[data-highlighted="true"]')).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '编辑备用电池' }));
        itemDialog = screen.getByRole('dialog', { name: '编辑物品' });
        fireEvent.change(within(itemDialog).getByLabelText('数量'), { target: { value: '5' } });
        const furnitureLocation = within(itemDialog).getByRole<HTMLOptionElement>('option', {
            name: '房间 1 / 家具 1',
        });
        fireEvent.change(within(itemDialog).getByLabelText('存放位置'), {
            target: { value: furnitureLocation.value },
        });
        fireEvent.click(within(itemDialog).getByRole('button', { name: '保存修改' }));

        fireEvent.focus(furniture);
        expect(await screen.findByText('数量 × 5')).toBeInstanceOf(HTMLElement);
        fireEvent.click(screen.getByRole('button', { name: '删除备用电池' }));
        expect(screen.queryByText('备用电池')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '撤销' }));
        expect(await screen.findByText('备用电池')).toBeInstanceOf(HTMLElement);

        await waitFor(() => {
            const storedDocument = JSON.parse(window.localStorage.getItem(ROOM_CANVAS_STORAGE_KEY) ?? '{}') as {
                items?: Array<{ name?: string; quantity?: number; location?: { kind?: string } }>;
            };
            expect(storedDocument.items?.[0]).toMatchObject({
                name: '备用电池',
                quantity: 5,
                location: { kind: 'furniture' },
            });
        });

        cleanup();
        render(<RoomCanvas gridSize={20} />);
        fireEvent.focus(await screen.findByRole('button', { name: '家具 1' }));
        expect(await screen.findByText('备用电池')).toBeInstanceOf(HTMLElement);
    });

    it('shows entity-specific creation actions in context menus', async () => {
        render(<RoomCanvas gridSize={20} />);
        const { room, furniture } = await createRoomWithFurniture();

        fireEvent.contextMenu(room, { clientX: 200, clientY: 200 });
        let menu = await screen.findByRole('menu', { name: '房间操作' });
        expect(within(menu).getByRole('menuitem', { name: '添加家具' })).toBeInstanceOf(HTMLButtonElement);
        expect(within(menu).getByRole('menuitem', { name: '添加储物设备' })).toBeInstanceOf(HTMLButtonElement);
        expect(within(menu).getByRole('menuitem', { name: '添加物品' })).toBeInstanceOf(HTMLButtonElement);
        fireEvent.keyDown(menu, { key: 'Escape' });

        fireEvent.contextMenu(furniture, { clientX: 240, clientY: 220 });
        menu = await screen.findByRole('menu', { name: '家具操作' });
        expect(within(menu).getByRole('menuitem', { name: '添加储物设备' })).toBeInstanceOf(HTMLButtonElement);
        expect(within(menu).getByRole('menuitem', { name: '添加物品' })).toBeInstanceOf(HTMLButtonElement);
        expect(within(menu).queryByRole('menuitem', { name: '添加家具' })).toBeNull();
    });

    it('does not start canvas interaction from toolbar pointer events', () => {
        render(<RoomCanvas />);
        const selectTool = screen.getByRole('button', { name: '选取' });

        fireEvent.pointerDown(selectTool, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 220, clientY: 180, pointerId: 1 });
        fireEvent.pointerUp(window, { clientX: 220, clientY: 180, pointerId: 1 });

        expect(screen.queryByRole('button', { name: /^房间 \d+$/ })).toBeNull();
    });

    it('does not start canvas interaction from zoom control pointer events', () => {
        render(<RoomCanvas />);
        fireEvent.click(screen.getByRole('button', { name: '房间' }));
        const zoomIn = screen.getByRole('button', { name: '放大' });

        fireEvent.pointerDown(zoomIn, { button: 0, clientX: 100, clientY: 100, pointerId: 8 });
        fireEvent.pointerMove(window, { clientX: 220, clientY: 180, pointerId: 8 });
        fireEvent.pointerUp(window, { clientX: 220, clientY: 180, pointerId: 8 });

        expect(screen.queryByRole('button', { name: /^房间 \d+$/ })).toBeNull();
    });

    it('draws a room with pointer events', async () => {
        render(<RoomCanvas gridSize={20} />);
        const canvas = screen.getByRole('region', { name: '房间布局画板' });

        fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 2 });
        fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 2 });
        fireEvent.pointerUp(window, { clientX: 140, clientY: 100, pointerId: 2 });

        expect(await screen.findByRole('button', { name: '房间 1' })).toBeInstanceOf(HTMLButtonElement);
    });

    it('closes the canvas context menu on pointer down outside it', async () => {
        render(<RoomCanvas />);
        const canvas = screen.getByRole('region', { name: '房间布局画板' });

        fireEvent.contextMenu(canvas, { clientX: 200, clientY: 200 });
        expect(await screen.findByRole('menu', { name: '画板操作' })).toBeInstanceOf(HTMLDivElement);
        await new Promise((resolve) => setTimeout(resolve, 0));

        fireEvent.pointerDown(canvas, { button: 0, clientX: 300, clientY: 300, pointerId: 3 });
        expect(screen.queryByRole('menu', { name: '画板操作' })).toBeNull();
        fireEvent.pointerUp(window, { clientX: 300, clientY: 300, pointerId: 3 });
    });

    it('adds, moves, resizes, renames and deletes a room with the keyboard', async () => {
        render(<RoomCanvas gridSize={20} />);
        fireEvent.click(screen.getByRole('button', { name: '添加房间' }));

        let room = screen.getByRole('button', { name: '房间 1' });
        const startLeft = Number.parseFloat(room.style.left);
        const startWidth = Number.parseFloat(room.style.width);

        fireEvent.keyDown(room, { key: 'ArrowRight' });
        expect(Number.parseFloat(room.style.left)).toBe(startLeft + 20);
        fireEvent.keyDown(room, { key: 'ArrowRight', shiftKey: true });
        expect(Number.parseFloat(room.style.width)).toBe(startWidth + 20);

        fireEvent.keyDown(room, { key: 'Enter' });
        const input = screen.getByLabelText('房间名称');
        fireEvent.change(input, { target: { value: '客厅' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        room = await screen.findByRole('button', { name: '客厅' });

        fireEvent.keyDown(room, { key: 'Delete' });
        expect(screen.queryByRole('button', { name: '客厅' })).toBeNull();
    });
});
