'use client';

/*============================================================================
  room-canvas — 房间布局画板组件

  点阵背景画板，支持绘制矩形房间、拖拽移动、八方向缩放
  交互模式：空白处拖拽绘制 / 点击房间选中移动 / 拖手柄缩放
  右键弹出菜单（后续实现）
============================================================================*/

/*== 组件导入 ==*/
import { Brand } from '@/components/site/brand';
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
        canvasRef,
        handleCanvasMouseDown,
        handleRoomMouseDown,
        handleHandleMouseDown,
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

    return (
        <div
            ref={canvasRef}
            className={styles.canvas}
            onMouseDown={handleCanvasMouseDown}
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
    );
}
