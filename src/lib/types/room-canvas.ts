/*============================================================================
  room-canvas types — 画板类型定义

  房间矩形数据模型 + 交互状态联合类型 + 右键菜单状态
============================================================================*/

/*== 工具类型：选取（拖拽画布）/ 创建房间 ==*/
export type Tool = 'select' | 'room';

export type CanvasEntityKind = 'room' | 'furniture' | 'storage-device';

export type CanvasDrawingKind = 'furniture' | 'storage-device';

export interface CanvasDrawingTarget {
    kind: CanvasDrawingKind;
    roomId: string;
}

export interface CanvasSelection {
    kind: CanvasEntityKind;
    id: string;
}

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

/*== 家具 ==*/
export interface Furniture {
    id: string;
    roomId: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/*== 储物设备 ==*/
interface StorageDeviceBase {
    id: string;
    name: string;
}

export interface RoomStorageDevice extends StorageDeviceBase {
    location: { kind: 'room'; roomId: string };
    rect: Rect;
}

export interface FurnitureStorageDevice extends StorageDeviceBase {
    location: { kind: 'furniture'; furnitureId: string };
}

export type StorageDevice = RoomStorageDevice | FurnitureStorageDevice;

/*== 物品 ==*/
export type ItemLocation =
    | { kind: 'room'; roomId: string }
    | { kind: 'furniture'; furnitureId: string }
    | { kind: 'storage-device'; storageDeviceId: string };

export interface Item {
    id: string;
    name: string;
    quantity: number;
    location: ItemLocation;
}

/*== 画板领域内容与版本化文档 ==*/
export interface CanvasContent {
    rooms: Room[];
    furniture: Furniture[];
    storageDevices: StorageDevice[];
    items: Item[];
}

export interface CanvasCounters {
    room: number;
    furniture: number;
    storageDevice: number;
    item: number;
}

export interface CanvasDocumentV2 extends CanvasContent {
    version: 2;
    counters: CanvasCounters;
}

/*== 缩放手柄方位 ==*/
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/*== 交互状态：空闲 / 绘制中 / 移动中 / 缩放中 / 拖拽画布 ==*/
export type InteractionState =
    | { type: 'idle' }
    | {
          type: 'drawing-room';
          pointerId: number;
          startX: number;
          startY: number;
          currentX: number;
          currentY: number;
      }
    | {
          type: 'drawing-child';
          pointerId: number;
          entityKind: CanvasDrawingKind;
          roomId: string;
          startX: number;
          startY: number;
          currentX: number;
          currentY: number;
      }
    | {
          type: 'moving';
          pointerId: number;
          entityKind: CanvasEntityKind;
          id: string;
          /*-- 鼠标相对实体左上角的偏移 --*/
          offsetX: number;
          offsetY: number;
      }
    | {
          type: 'resizing';
          pointerId: number;
          entityKind: CanvasEntityKind;
          id: string;
          handle: ResizeHandle;
          /*-- 缩放起始时的实体矩形 --*/
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
    /*-- 菜单类型：画板空白处 / 房间 / 家具 / 房间级储物设备 --*/
    targetType: 'canvas' | CanvasEntityKind;
    /*-- 目标实体 ID（画板菜单不存在） --*/
    targetId?: string;
}

/*== 矩形尺寸（用于工具函数） ==*/
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
