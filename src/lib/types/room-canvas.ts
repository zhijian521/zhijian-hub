/*============================================================================
  room-canvas types — 画板类型定义

  房间矩形数据模型 + 交互状态联合类型 + 右键菜单状态
============================================================================*/

/*== 工具类型：选取（拖拽画布）/ 创建房间 ==*/
export type Tool = 'select' | 'room';

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

/*== 交互状态：空闲 / 绘制中 / 移动中 / 缩放中 / 拖拽画布 ==*/
export type InteractionState =
    | { type: 'idle' }
    | {
          type: 'drawing';
          pointerId: number;
          startX: number;
          startY: number;
          currentX: number;
          currentY: number;
      }
    | {
          type: 'moving';
          pointerId: number;
          id: string;
          /*-- 鼠标相对房间左上角的偏移 --*/
          offsetX: number;
          offsetY: number;
      }
    | {
          type: 'resizing';
          pointerId: number;
          id: string;
          handle: ResizeHandle;
          /*-- 缩放起始时的房间矩形 --*/
          startRect: { x: number; y: number; width: number; height: number };
      }
    | {
          type: 'panning';
          pointerId: number;
          /*-- 鼠标按下时的视口坐标 --*/
          startMouseX: number;
          startMouseY: number;
          /*-- 拖拽开始时的画布偏移 --*/
          panStartX: number;
          panStartY: number;
      };

/*== 右键菜单状态 ==*/
export interface ContextMenuState {
    /*-- 视口 X 坐标 --*/
    x: number;
    /*-- 视口 Y 坐标 --*/
    y: number;
    /*-- 菜单类型：画板空白处 / 房间上 --*/
    targetType: 'canvas' | 'room';
    /*-- 目标房间 ID（仅 targetType === 'room' 时存在） --*/
    roomId?: string;
}

/*== 矩形尺寸（用于工具函数） ==*/
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
