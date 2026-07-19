'use client';

/*============================================================================
  room-canvas — 房间布局画板组件

  点阵背景画板，支持房间、家具和房间级储物设备的绘制与编辑
  空间子实体从房间详情进入一次性绘制模式，并始终限制在所属房间内
  顶部工具栏：选取（拖拽画布）/ 创建房间
  缩放控制：滚轮 / 右下角 ZoomControl
============================================================================*/

import { useId, useMemo } from 'react';

/*== 组件导入 ==*/
import { Brand } from '@/components/site/brand';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuEntry } from '@/components/ui/context-menu';
import { Dialog } from '@/components/ui/dialog';
import { EditIcon, FurnitureIcon, ItemIcon, RoomIcon, StorageIcon, TrashIcon } from '@/components/ui/icons';
import { InputDialog } from '@/components/ui/input-dialog';
import { Show } from '@/components/ui/show';

/*== 数据与配置 ==*/
import { cn } from '@/lib/utils/cn';
import { useRoomCanvas } from '@/lib/hooks/use-room-canvas';
import type { CanvasSelection, RoomStorageDevice } from '@/lib/types/room-canvas';

/*== 同目录组件 ==*/
import { CanvasActions } from './canvas-actions';
import { ItemDialog } from './canvas-items';
import { FurnitureNode, RoomNode, StorageDeviceNode } from './canvas-nodes';
import { Toolbar } from './toolbar';
import { ZoomControl } from './zoom-control';

/*== 样式导入 ==*/
import styles from './room-canvas.module.css';

/*== 类型定义 ==*/
interface RoomCanvasProps {
    /*-- 网格大小（像素），默认 20 --*/
    gridSize?: number;
}

/*== RoomCanvas 组件 — 房间布局画板 ==*/
export function RoomCanvas({ gridSize = 20 }: RoomCanvasProps) {
    const {
        rooms,
        furniture,
        storageDevices,
        items,
        canUndo,
        canRedo,
        selectedEntity,
        highlightedEntity,
        highlightedItemId,
        interaction,
        contextMenu,
        renamingEntity,
        pendingDeletion,
        deletionImpact,
        drawingTarget,
        itemEditor,
        zoom,
        panOffset,
        isFocusing,
        tool,
        canvasRef,
        handleCanvasPointerDown,
        handleRoomPointerDown,
        handleFurniturePointerDown,
        handleStorageDevicePointerDown,
        handleHandlePointerDown,
        handleRoomKeyDown,
        handleFurnitureKeyDown,
        handleStorageDeviceKeyDown,
        selectEntity,
        handleCanvasContextMenu,
        handleRoomContextMenu,
        handleFurnitureContextMenu,
        handleStorageDeviceContextMenu,
        handleWheel,
        closeContextMenu,
        clearAll,
        startRename,
        confirmRename,
        cancelRename,
        requestDelete,
        confirmDelete,
        cancelDelete,
        startFurnitureDrawing,
        startStorageDeviceDrawing,
        createFurnitureStorageDevice,
        moveFurnitureToRoom,
        moveStorageDevice,
        startCreateItem,
        startEditItem,
        confirmItem,
        cancelItemEditor,
        deleteItem,
        zoomIn,
        zoomOut,
        addRoom,
        focusEntity,
        focusItem,
        undo,
        redo,
        setTool,
    } = useRoomCanvas({ gridSize });
    const canvasInstructionsId = useId();
    const drawingRoom = drawingTarget ? rooms.find((room) => room.id === drawingTarget.roomId) : null;
    const roomStorageDevices = storageDevices.filter(
        (storageDevice): storageDevice is RoomStorageDevice => storageDevice.location.kind === 'room'
    );
    const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);

    /*== 绘制预览矩形 ==*/
    const preview = (() => {
        if (interaction.type === 'drawing-room') {
            return {
                kind: 'room' as const,
                x: Math.min(interaction.startX, interaction.currentX),
                y: Math.min(interaction.startY, interaction.currentY),
                width: Math.abs(interaction.currentX - interaction.startX),
                height: Math.abs(interaction.currentY - interaction.startY),
            };
        }
        if (interaction.type !== 'drawing-child') return null;
        const room = rooms.find((item) => item.id === interaction.roomId);
        if (!room) return null;
        return {
            kind: interaction.entityKind,
            x: room.x + Math.min(interaction.startX, interaction.currentX),
            y: room.y + Math.min(interaction.startY, interaction.currentY),
            width: Math.abs(interaction.currentX - interaction.startX),
            height: Math.abs(interaction.currentY - interaction.startY),
        };
    })();

    const renamingTarget = renamingEntity
        ? renamingEntity.kind === 'room'
            ? rooms.find((room) => room.id === renamingEntity.id)
            : renamingEntity.kind === 'furniture'
              ? furniture.find((item) => item.id === renamingEntity.id)
              : storageDevices.find((item) => item.id === renamingEntity.id)
        : null;
    const deletionTarget = pendingDeletion
        ? pendingDeletion.kind === 'room'
            ? rooms.find((room) => room.id === pendingDeletion.id)
            : pendingDeletion.kind === 'furniture'
              ? furniture.find((item) => item.id === pendingDeletion.id)
              : storageDevices.find((item) => item.id === pendingDeletion.id)
        : null;
    const editingItem = itemEditor?.itemId ? (items.find((item) => item.id === itemEditor.itemId) ?? null) : null;
    const contextEntity: CanvasSelection | null =
        contextMenu?.targetType !== 'canvas' && contextMenu?.targetId
            ? { kind: contextMenu.targetType, id: contextMenu.targetId }
            : null;

    /*== 构建右键菜单条目 ==*/
    const contextMenuItems: ContextMenuEntry[] = (() => {
        if (!contextEntity) {
            if (contextMenu?.targetType !== 'canvas') return [];
            return [
                { label: '添加房间', icon: <RoomIcon />, onClick: addRoom },
                { type: 'separator' },
                {
                    label: '清空画板',
                    icon: <TrashIcon />,
                    danger: true,
                    disabled: rooms.length === 0,
                    onClick: clearAll,
                },
            ];
        }

        const editEntries: ContextMenuEntry[] = [
            { type: 'separator' },
            { label: '修改名称', icon: <EditIcon />, onClick: () => startRename(contextEntity) },
            {
                label:
                    contextEntity.kind === 'room'
                        ? '删除房间'
                        : contextEntity.kind === 'furniture'
                          ? '删除家具'
                          : '删除储物设备',
                icon: <TrashIcon />,
                danger: true,
                onClick: () => requestDelete(contextEntity),
            },
        ];

        if (contextEntity.kind === 'room') {
            return [
                {
                    label: '添加家具',
                    icon: <FurnitureIcon />,
                    onClick: () => startFurnitureDrawing(contextEntity.id),
                },
                {
                    label: '添加储物设备',
                    icon: <StorageIcon />,
                    onClick: () => startStorageDeviceDrawing(contextEntity.id),
                },
                {
                    label: '添加物品',
                    icon: <ItemIcon />,
                    onClick: () => startCreateItem({ kind: 'room', roomId: contextEntity.id }),
                },
                ...editEntries,
            ];
        }
        if (contextEntity.kind === 'furniture') {
            return [
                {
                    label: '添加储物设备',
                    icon: <StorageIcon />,
                    onClick: () => createFurnitureStorageDevice(contextEntity.id),
                },
                {
                    label: '添加物品',
                    icon: <ItemIcon />,
                    onClick: () => startCreateItem({ kind: 'furniture', furnitureId: contextEntity.id }),
                },
                ...editEntries,
            ];
        }
        return [
            {
                label: '添加物品',
                icon: <ItemIcon />,
                onClick: () => startCreateItem({ kind: 'storage-device', storageDeviceId: contextEntity.id }),
            },
            ...editEntries,
        ];
    })();

    return (
        <>
            <div
                ref={canvasRef}
                className={cn(
                    styles.canvas,
                    tool === 'select' && styles.canvasSelect,
                    drawingTarget && styles.canvasChildDrawing,
                    isFocusing && styles.canvasFocusing
                )}
                role="region"
                aria-label="房间布局画板"
                onPointerDown={handleCanvasPointerDown}
                onContextMenu={handleCanvasContextMenu}
                onWheel={handleWheel}
                style={{
                    backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
                    backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
                    backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
                }}
            >
                {/*== 房间缩放容器 ==*/}
                <div
                    className={cn(styles.zoomLayer, isFocusing && styles.zoomLayerFocusing)}
                    style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                        transformOrigin: '0 0',
                    }}
                >
                    <p className={styles.srOnly} id={canvasInstructionsId}>
                        方向键移动获得焦点的空间实体，Shift 加方向键调整大小，Enter 或 F2 重命名，Delete 删除，Shift 加
                        F10 打开操作菜单。家具和房间级储物设备始终限制在所属房间内。Ctrl 或 Command 加 Z 撤销，Ctrl 加 Y
                        或 Ctrl、Command 加 Shift Z 重做。
                    </p>

                    {/*== 空状态提示 ==*/}
                    <Show when={rooms.length === 0 && interaction.type === 'idle' && tool === 'room'}>
                        <div className={styles.emptyHint}>点击空白处拖拽，绘制房间</div>
                    </Show>

                    {rooms.map((room) => (
                        <RoomNode
                            key={room.id}
                            room={room}
                            isSelected={selectedEntity?.kind === 'room' && selectedEntity.id === room.id}
                            isHighlighted={highlightedEntity?.kind === 'room' && highlightedEntity.id === room.id}
                            isDrawingTarget={drawingTarget?.roomId === room.id}
                            instructionsId={canvasInstructionsId}
                            onSelect={selectEntity}
                            onKeyDown={handleRoomKeyDown}
                            onPointerDown={handleRoomPointerDown}
                            onContextMenu={handleRoomContextMenu}
                            onHandlePointerDown={handleHandlePointerDown}
                        />
                    ))}

                    {furniture.map((item) => {
                        const room = roomById.get(item.roomId);
                        if (!room) return null;
                        return (
                            <FurnitureNode
                                key={item.id}
                                furniture={item}
                                room={room}
                                isSelected={selectedEntity?.kind === 'furniture' && selectedEntity.id === item.id}
                                isHighlighted={
                                    highlightedEntity?.kind === 'furniture' && highlightedEntity.id === item.id
                                }
                                isDrawingMode={drawingTarget?.roomId === item.roomId}
                                instructionsId={canvasInstructionsId}
                                onSelect={selectEntity}
                                onKeyDown={handleFurnitureKeyDown}
                                onPointerDown={handleFurniturePointerDown}
                                onContextMenu={handleFurnitureContextMenu}
                                onHandlePointerDown={handleHandlePointerDown}
                            />
                        );
                    })}

                    {roomStorageDevices.map((storageDevice) => {
                        const room = roomById.get(storageDevice.location.roomId);
                        if (!room) return null;
                        return (
                            <StorageDeviceNode
                                key={storageDevice.id}
                                storageDevice={storageDevice}
                                room={room}
                                isSelected={
                                    selectedEntity?.kind === 'storage-device' && selectedEntity.id === storageDevice.id
                                }
                                isHighlighted={
                                    highlightedEntity?.kind === 'storage-device' &&
                                    highlightedEntity.id === storageDevice.id
                                }
                                isDrawingMode={drawingTarget?.roomId === storageDevice.location.roomId}
                                instructionsId={canvasInstructionsId}
                                onSelect={selectEntity}
                                onKeyDown={handleStorageDeviceKeyDown}
                                onPointerDown={handleStorageDevicePointerDown}
                                onContextMenu={handleStorageDeviceContextMenu}
                                onHandlePointerDown={handleHandlePointerDown}
                            />
                        );
                    })}

                    {/*== 绘制预览 ==*/}
                    {preview && preview.width > 0 && preview.height > 0 && (
                        <div
                            className={cn(
                                styles.preview,
                                preview.kind === 'furniture' && styles.furniturePreview,
                                preview.kind === 'storage-device' && styles.storageDevicePreview
                            )}
                            style={{
                                left: preview.x,
                                top: preview.y,
                                width: preview.width,
                                height: preview.height,
                            }}
                        />
                    )}
                </div>

                {/*== 顶部工具栏 ==*/}
                <Toolbar
                    tool={tool}
                    canClear={rooms.length > 0}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onAddRoom={addRoom}
                    onClear={clearAll}
                    onUndo={undo}
                    onRedo={redo}
                    onToolChange={setTool}
                />

                {drawingRoom && drawingTarget && (
                    <div className={styles.drawingNotice} role="status">
                        在“{drawingRoom.name}”内拖拽创建
                        {drawingTarget.kind === 'furniture' ? '家具' : '储物设备'}
                        <span>按 Esc 取消</span>
                    </div>
                )}

                {/*== 右上角画板功能区 ==*/}
                <CanvasActions
                    rooms={rooms}
                    furniture={furniture}
                    storageDevices={storageDevices}
                    items={items}
                    selectedEntity={selectedEntity}
                    highlightedEntity={highlightedEntity}
                    highlightedItemId={highlightedItemId}
                    gridSize={gridSize}
                    onFocusEntity={focusEntity}
                    onStartFurnitureDrawing={startFurnitureDrawing}
                    onStartStorageDeviceDrawing={startStorageDeviceDrawing}
                    onCreateFurnitureStorageDevice={createFurnitureStorageDevice}
                    onStartRename={startRename}
                    onRequestDelete={requestDelete}
                    onMoveFurnitureToRoom={moveFurnitureToRoom}
                    onMoveStorageDevice={moveStorageDevice}
                    onStartCreateItem={startCreateItem}
                    onStartEditItem={startEditItem}
                    onDeleteItem={deleteItem}
                    onFocusItem={focusItem}
                />

                {/*== 左上角品牌标识 ==*/}
                <Brand />

                {/*== 右下角缩放控制 ==*/}
                <ZoomControl zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} />
            </div>

            {/*== 右键菜单 ==*/}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    ariaLabel={
                        contextMenu.targetType === 'room'
                            ? '房间操作'
                            : contextMenu.targetType === 'furniture'
                              ? '家具操作'
                              : contextMenu.targetType === 'storage-device'
                                ? '储物设备操作'
                                : '画板操作'
                    }
                    items={contextMenuItems}
                    onClose={closeContextMenu}
                />
            )}

            {/*== 重命名弹窗 ==*/}
            <InputDialog
                open={renamingEntity !== null}
                title={
                    renamingEntity?.kind === 'furniture'
                        ? '修改家具名称'
                        : renamingEntity?.kind === 'storage-device'
                          ? '修改储物设备名称'
                          : '修改房间名称'
                }
                label={
                    renamingEntity?.kind === 'furniture'
                        ? '家具名称'
                        : renamingEntity?.kind === 'storage-device'
                          ? '储物设备名称'
                          : '房间名称'
                }
                placeholder={
                    renamingEntity?.kind === 'furniture'
                        ? '请输入家具名称'
                        : renamingEntity?.kind === 'storage-device'
                          ? '请输入储物设备名称'
                          : '请输入房间名称'
                }
                initialValue={renamingTarget?.name ?? ''}
                onConfirm={confirmRename}
                onClose={cancelRename}
            />

            <ItemDialog
                open={itemEditor !== null}
                item={editingItem}
                initialLocation={itemEditor?.location ?? null}
                rooms={rooms}
                furniture={furniture}
                storageDevices={storageDevices}
                onConfirm={confirmItem}
                onClose={cancelItemEditor}
            />

            <Dialog
                open={pendingDeletion !== null}
                title={`删除“${deletionTarget?.name ?? ''}”`}
                onClose={cancelDelete}
            >
                <div className={styles.deletionSummary}>
                    <p>该操作将同时删除以下内容，并作为一次操作进入撤销历史：</p>
                    <ul>
                        {deletionImpact?.furniture ? <li>{deletionImpact.furniture} 件家具</li> : null}
                        {deletionImpact?.storageDevices ? <li>{deletionImpact.storageDevices} 个储物设备</li> : null}
                        {deletionImpact?.items ? <li>{deletionImpact.items} 项物品记录</li> : null}
                    </ul>
                </div>
                <div className={styles.dialogActions}>
                    <Button type="button" onClick={cancelDelete}>
                        取消
                    </Button>
                    <Button type="button" variant="danger" onClick={confirmDelete}>
                        确认删除
                    </Button>
                </div>
            </Dialog>
        </>
    );
}
