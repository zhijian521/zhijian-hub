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

/** 洞口类型。door 平开门、window 标准窗、bay 飘窗（外凸出一块带三面玻璃的平台）。 */
export type OpeningKind = 'door' | 'window' | 'bay';

/** 门的铰链在哪一端。它和开向一起决定门扇站在哪个角、往哪边扫。 */
export type HingeSide = 'start' | 'end';

/**
 * 门扇朝哪一侧开，相对于门所属的房间。
 * in 朝房间里面开（住宅常态），out 朝房间外面开（入户门、储藏间、卫生间往走廊开）。
 */
export type SwingSide = 'in' | 'out';

/**
 * 地面材质。`wood` / `tile` / `small` 可由房间名自动推断，
 * 其余（深浅木、斜铺、长条砖、大理石、水磨石、微水泥、地毯）都只能手动指定。
 * 新增材质要同时改 store 的 FLOORS、这里、plan-drawing 的 pattern 与色卡样式。
 */
export type FloorMaterial =
    | 'wood'
    | 'walnut'
    | 'diagonal'
    | 'tile'
    | 'subway'
    | 'small'
    | 'marble'
    | 'terrazzo'
    | 'microcement'
    | 'carpet';

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
    /*-- 只有门用得上；窗与飘窗一律存 'in'，免得同一列在两处各有一套空值语义 --*/
    swing: SwingSide;
    /*-- 只有飘窗用得上：向外凸出的进深（px）。门与窗存默认值，不参与几何 --*/
    depth: number;
}

export interface Room extends Rect {
    id: string;
    name: string;
    /*-- null 表示按房间名自动推断，用户手动选过之后是具体值 --*/
    floor: FloorMaterial | null;
    /**
     * 户外空间（阳台、露台）。
     * 为 true 时，不与别的房间共用的那几面墙不再画成实心墙，改画栏杆，
     * 于是同一块矩形既能当室内房间，也能当阳台，不需要另立一套几何。
     */
    outdoor: boolean;
    /**
     * 整面拆掉、不做墙的边。用在「餐厅与客厅打通」「卧室与衣帽间连通」这类情况：
     * 这一边不再砌墙，两间房的地面直接接在一起。
     *
     * 为什么不复用 Opening：门窗是墙上开一个洞，洞两侧还得留墙垛；
     * 拆墙是整条边一个洞都不剩，连墙垛和墙厚都没有，几何上完全不同。
     */
    openWalls: WallSide[];
    openings: Opening[];
}

export interface FloorPlan {
    id: string;
    name: string;
    /*-- 房间默认名称序号，只增不减 --*/
    roomSeq: number;
    createdAt: string;
}

/** 家具的粗分类。只影响图标与默认配色，不影响归属关系。 */
export type StorageKind = 'cabinet' | 'shelf' | 'box' | 'furniture';

/**
 * 家具（原来的「储物设备」）。家具与储物是一件事：
 * 衣柜、书柜、冰箱都是"能放东西的家具"，所以只有这一张表。
 * 一定挂在某个房间里。
 *
 * preset 是家具原型 id（见 lib/furniture-catalog.ts，例如 bed-double / wardrobe），
 * 决定默认尺寸、配色与平面画法。位置四个字段可空：老数据没存过位置，
 * 按房间网格自动排布（见 lib/plan-storage.ts）；用户拖放过的就有了确切坐标。
 */
export interface StorageDevice {
    id: string;
    roomId: string;
    name: string;
    kind: StorageKind;
    /** 家具原型 id；空串＝老数据，按 kind 通用画法。 */
    preset?: string;
    x?: number | null;
    y?: number | null;
    width?: number | null;
    height?: number | null;
    /** 平面转角，只有 0 / 90 两档（0° 或躺倒 90°）。 */
    rotation?: number;
}

/**
 * 物品。roomId 必有（保证搜到就能去拿），storageId 可空
 * （拆掉柜子后物品仍在原房间，不会丢）。
 */
export interface StoredItem {
    id: string;
    name: string;
    category: string;
    quantity: number;
    note: string;
    roomId: string;
    storageId: string | null;
}

export interface FloorPlanState {
    /*-- 尚未创建户型图时为 null，界面据此显示创建引导 --*/
    plan: FloorPlan | null;
    rooms: Room[];
    storage: StorageDevice[];
    items: StoredItem[];
}

/** 语义化命令：渲染层只说做什么，SQL 与校验留在主进程。 */
export type FloorPlanCommand =
    | { type: 'replace-rooms'; rooms: Room[]; storage?: StorageDevice[]; items?: StoredItem[] }
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
          swing?: SwingSide;
          depth?: number;
      }
    | {
          type: 'update-opening';
          id: string;
          pos?: number;
          width?: number;
          hinge?: HingeSide;
          swing?: SwingSide;
          depth?: number;
      }
    | { type: 'remove-opening'; id: string }
    | { type: 'set-room-floor'; id: string; floor: FloorMaterial | null }
    | { type: 'set-room-outdoor'; id: string; outdoor: boolean }
    | { type: 'set-room-open-walls'; id: string; openWalls: WallSide[] }
    | {
          type: 'add-storage';
          roomId: string;
          name: string;
          kind: StorageKind;
          preset?: string;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          rotation?: number;
      }
    | { type: 'rename-storage'; id: string; name: string }
    | {
          type: 'place-storage';
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
          rotation?: number;
          /** 换到另一个房间时一起带上；只挪位置时可以不给。 */
          roomId?: string;
      }
    | { type: 'remove-storage'; id: string }
    | {
          type: 'add-item';
          roomId: string;
          storageId?: string | null;
          name: string;
          category: string;
          quantity?: number;
          note?: string;
      }
    | {
          type: 'update-item';
          id: string;
          name?: string;
          category?: string;
          quantity?: number;
          note?: string;
          storageId?: string | null;
      }
    | { type: 'remove-item'; id: string };

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
