import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomCanvas } from '@/components/features/room-canvas/room-canvas';
import { ContextMenu } from '@/components/ui/context-menu';
import { Dialog } from '@/components/ui/dialog';
import { InputDialog } from '@/components/ui/input-dialog';

afterEach(cleanup);

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
    it('does not start canvas interaction from toolbar pointer events', () => {
        render(<RoomCanvas />);
        const selectTool = screen.getByRole('button', { name: '选取' });

        fireEvent.pointerDown(selectTool, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 220, clientY: 180, pointerId: 1 });
        fireEvent.pointerUp(window, { clientX: 220, clientY: 180, pointerId: 1 });

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
