'use client';

/*============================================================================
  room-canvas — 房间布局画板组件

  点阵背景画板，支持绘制矩形房间、拖拽移动、八方向缩放
  交互模式：空白处拖拽绘制 / 点击房间选中移动 / 拖手柄缩放
  右键菜单：空白处清空画板 / 房间上修改名称、删除房间
============================================================================*/

/*== 组件导入 ==*/
import { Brand } from '@/components/site/brand';
import { ContextMenu, type ContextMenuEntry } from '@/components/ui/context-menu';
import { InputDialog } from '@/components/ui/input-dialog';
import { Show } from '@/components/ui/show';

/*== 数据与配置 ==*/
import { cn } from '@/lib/utils/cn';
import { useRoomCanvas } from '@/lib/hooks/use-room-canvas';
import type { ResizeHandle } from '@/lib/types/room-canvas';

/*== 样式导入 ==*/
import styles from './room-canvas.module.css';

/*== 类型定义 ==*/
interface RoomCanvasProps {
    /*-- 网格大小（像素），默认 20 --*/
    gridSize?: number;
}

/*== 八个缩放手柄 ==*/
const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/*== RoomCanvas 组件 — 房间布局画板 ==*/
export function RoomCanvas({ gridSize = 20 }: RoomCanvasProps) {
    const {
        rooms,
        selectedId,
        interaction,
        contextMenu,
        renamingId,
        canvasRef,
        handleCanvasMouseDown,
        handleRoomMouseDown,
        handleHandleMouseDown,
        handleCanvasContextMenu,
        handleRoomContextMenu,
        closeContextMenu,
        deleteRoom,
        clearAll,
        startRename,
        confirmRename,
        cancelRename,
    } = useRoomCanvas({ gridSize });

    /*== 绘制预览矩形 ==*/
    const preview =
        interaction.type === 'drawing'
            ? {
                  x: Math.min(interaction.startX, interaction.currentX),
                  y: Math.min(interaction.startY, interaction.currentY),
                  width: Math.abs(interaction.currentX - interaction.startX),
                  height: Math.abs(interaction.currentY - interaction.startY),
              }
            : null;

    /*== 重命名目标房间的当前名称 ==*/
    const renamingRoom = renamingId ? rooms.find((r) => r.id === renamingId) : null;

    /*== 构建右键菜单条目 ==*/
    const contextMenuItems: ContextMenuEntry[] =
        contextMenu?.targetType === 'room'
            ? [
                  {
                      label: '修改名称',
                      onClick: () => {
                          if (contextMenu.roomId) startRename(contextMenu.roomId);
                      },
                  },
                  { type: 'separator' },
                  {
                      label: '删除房间',
                      danger: true,
                      onClick: () => {
                          if (contextMenu.roomId) deleteRoom(contextMenu.roomId);
                      },
                  },
              ]
            : contextMenu?.targetType === 'canvas'
              ? [
                    {
                        label: '清空画板',
                        danger: true,
                        disabled: rooms.length === 0,
                        onClick: clearAll,
                    },
                ]
              : [];

    return (
        <>
            <div
                ref={canvasRef}
                className={styles.canvas}
                onMouseDown={handleCanvasMouseDown}
                onContextMenu={handleCanvasContextMenu}
                style={{
                    backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
                    backgroundSize: `${gridSize}px ${gridSize}px`,
                }}
            >
                {/*== 左上角品牌标识 ==*/}
                <Brand />

                {/*== 空状态提示 ==*/}
                <Show when={rooms.length === 0 && interaction.type === 'idle'}>
                    <div className={styles.emptyHint}>点击空白处拖拽，绘制房间</div>
                </Show>

                {/*== 房间矩形 ==*/}
                {rooms.map((room) => {
                    const isSelected = room.id === selectedId;
                    return (
                        <div
                            key={room.id}
                            className={cn(styles.room, isSelected && styles.roomSelected)}
                            style={{
                                left: room.x,
                                top: room.y,
                                width: room.width,
                                height: room.height,
                            }}
                            onMouseDown={(e) => handleRoomMouseDown(e, room)}
                            onContextMenu={(e) => handleRoomContextMenu(e, room)}
                        >
                            <span className={styles.roomLabel}>{room.name}</span>

                            {/*== 选中时显示八方向缩放手柄 ==*/}
                            <Show when={isSelected}>
                                {HANDLES.map((handle) => (
                                    <div
                                        key={handle}
                                        className={cn(styles.handle, styles[`handle${handle.toUpperCase()}`])}
                                        onMouseDown={(e) => handleHandleMouseDown(e, handle)}
                                    />
                                ))}
                            </Show>
                        </div>
                    );
                })}

                {/*== 绘制预览 ==*/}
                {preview && preview.width > 0 && preview.height > 0 && (
                    <div
                        className={styles.preview}
                        style={{
                            left: preview.x,
                            top: preview.y,
                            width: preview.width,
                            height: preview.height,
                        }}
                    />
                )}
            </div>

            {/*== 右键菜单 ==*/}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenuItems}
                    onClose={closeContextMenu}
                />
            )}

            {/*== 重命名弹窗 ==*/}
            <InputDialog
                open={renamingId !== null}
                title="修改房间名称"
                placeholder="请输入房间名称"
                initialValue={renamingRoom?.name ?? ''}
                onConfirm={confirmRename}
                onClose={cancelRename}
            />
        </>
    );
}
