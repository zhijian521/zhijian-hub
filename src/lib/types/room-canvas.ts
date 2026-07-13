/*============================================================================
  room-canvas types — 画板类型定义

  房间矩形数据模型 + 交互状态联合类型
============================================================================*/

/*== 房间矩形 ==*/
export interface Room {
    /*-- 唯一标识 --*/
    id: string;
    /*-- 房间名称 --*/
    name: string;
    /*-- 左上角 X 坐标（画板坐标系） --*/
    x: number;
    /*-- 左上角 Y 坐标（画板坐标系） --*/
    y: number;
    /*-- 宽度 --*/
    width: number;
    /*-- 高度 --*/
    height: number;
}

/*== 缩放手柄方位 ==*/
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/*== 交互状态：空闲 / 绘制中 / 移动中 / 缩放中 ==*/
export type InteractionState =
    | { type: 'idle' }
    | {
          type: 'drawing';
          startX: number;
          startY: number;
          currentX: number;
          currentY: number;
      }
    | {
          type: 'moving';
          id: string;
          /*-- 鼠标相对房间左上角的偏移 --*/
          offsetX: number;
          offsetY: number;
      }
    | {
          type: 'resizing';
          id: string;
          handle: ResizeHandle;
          /*-- 缩放起始时的房间矩形 --*/
          startRect: { x: number; y: number; width: number; height: number };
      };

/*== 矩形尺寸（用于工具函数） ==*/
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
