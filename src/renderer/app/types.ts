/*============================================================================
  types — 渲染层与主进程的契约

  只声明当前真实存在的通道。新增通道时先改这里，`vue-tsc` 会同时检查
  preload 的实现是否与契约一致。
============================================================================*/

/*== 应用信息 ==*/
export interface AppInfo {
    name: string;
    version: string;
    platform: string;
}

/*== 窗口 ==*/
export type WindowAction = 'minimize' | 'toggle-maximize' | 'close';

export interface WindowState {
    maximized: boolean;
}

/*== 户型图与房间 ==*/
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 墙面方向。top/bottom 从左端起算，left/right 从上端起算。 */
export type WallSide = 'top' | 'right' | 'bottom' | 'left';

export type OpeningKind = 'door' | 'window';

/** 门的铰链在哪一端，决定门扇朝哪边开。 */
export type HingeSide = 'start' | 'end';

/**
 * 地面材质。前三个能按房间名自动推断，后三个只能手动指定
 * （大理石、水磨石、地毯都不是能从「用途」唯一推出来的选择）。
 */
export type FloorMaterial = 'wood' | 'tile' | 'small' | 'marble' | 'terrazzo' | 'carpet';

/**
 * 墙上的门窗洞。位置用「沿墙起点 + 宽度」表示，房间移动或缩放时自动跟随。
 */
export interface Opening {
    id: string;
    kind: OpeningKind;
    wall: WallSide;
    pos: number;
    width: number;
    hinge: HingeSide;
}

export interface Room extends Rect {
    id: string;
    name: string;
    /*-- null 表示按房间名自动推断，用户手动选过之后是具体值 --*/
    floor: FloorMaterial | null;
    openings: Opening[];
}

export interface FloorPlan {
    id: string;
    name: string;
    /*-- 房间默认名称序号，只增不减 --*/
    roomSeq: number;
    createdAt: string;
}

export interface FloorPlanState {
    /*-- 尚未创建户型图时为 null，界面据此显示创建引导 --*/
    plan: FloorPlan | null;
    rooms: Room[];
}

/** 语义化命令：渲染层只说做什么，SQL 与校验留在主进程。 */
export type FloorPlanCommand =
    | { type: 'replace-rooms'; rooms: Room[] }
    | { type: 'create-plan'; name: string }
    | { type: 'add-room'; rect: Rect }
    | { type: 'rename-room'; id: string; name: string }
    | { type: 'move-room'; id: string; x: number; y: number }
    | { type: 'resize-room'; id: string; rect: Rect }
    | { type: 'remove-room'; id: string }
    | { type: 'clear-rooms' }
    | {
          type: 'add-opening';
          roomId: string;
          kind: OpeningKind;
          wall: WallSide;
          pos: number;
          width: number;
          hinge?: HingeSide;
      }
    | { type: 'update-opening'; id: string; pos?: number; width?: number; hinge?: HingeSide }
    | { type: 'remove-opening'; id: string }
    | { type: 'set-room-floor'; id: string; floor: FloorMaterial | null };

export type MutateResult = { ok: true; state: FloorPlanState } | { ok: false; message: string };

export interface DesktopBridge {
    appInfo: () => Promise<AppInfo>;
    /*-- 执行窗口操作，返回操作后的最大化状态 --*/
    windowControl: (action: WindowAction) => Promise<WindowState>;
    getWindowState: () => Promise<WindowState>;
    /*-- 订阅最大化状态变化，返回取消订阅函数 --*/
    onWindowStateChanged: (listener: (state: WindowState) => void) => () => void;

    loadFloorPlan: () => Promise<FloorPlanState>;
    exportFloorPlan: (svg: string, name: string) => Promise<{ canceled: boolean }>;
    /*-- 执行命令，返回完整新状态或失败原因 --*/
    mutateFloorPlan: (command: FloorPlanCommand) => Promise<MutateResult>;
}

declare global {
    interface Window {
        /*-- preload 注入；在浏览器里直接打开时不存在，调用处需要降级 --*/
        zhijian?: DesktopBridge;
    }
}
