# 知简 Hub

基于 Electron 的桌面应用工程骨架。当前只完成基础架构与工具链，未接入任何业务功能。

旧版 Web 实现（Next.js 15 + React 19）已归档，见标签 `v2.0-archive`；本项目不沿用其代码与功能。

## 技术栈

| 类别     | 选型                                      | 说明                                      |
| -------- | ----------------------------------------- | ----------------------------------------- |
| 运行时   | Electron 38.8.6（内置 Node 22.22）        | 主进程 CJS，预加载脚本 CJS                |
| 渲染层   | Vue 3.5 + Vite 7                          | `src/renderer` 为独立 Vite 根             |
| 状态     | Pinia 3                                   | 已接入，按功能建 store，不建全局大对象    |
| 语言     | TypeScript 5.9 严格模式                   | `vue-tsc --noEmit` 做类型门禁             |
| 数据     | SQLite（`node:sqlite`）                   | 零原生模块，无需 MSVC 工具链              |
| 样式     | CSS 变量 + scoped 样式                    | `tokens.css` 只放刻度，`theme.css` 放颜色 |
| 打包     | electron-builder 26                       | NSIS 安装版 + 便携版，仅 Windows x64      |
| 质量门禁 | Prettier + ESLint 9 + vue-tsc + node:test | 统一入口 `npm run check`                  |

## 目录结构

```text
src/
├── main/                  # 主进程（CJS）
│   ├── main.cjs           # 入口：路径 → 日志 → 数据库 → IPC → 窗口
│   ├── database.cjs       # SQLite 连接，schema 版本与迁移
│   ├── floor-plan-store.cjs # 户型图与房间的读写、校验、命令分发
│   ├── ipc.cjs            # 通道白名单 + 调用方校验
│   ├── logger.cjs         # 落盘日志，保留 5 份
│   └── paths.cjs          # userData 下的数据与日志目录
├── preload/               # contextBridge 暴露具名方法
│   └── preload.cjs
└── renderer/              # Vue 应用（Vite 根）
    ├── App.vue            # 自绘标题栏 + 画板容器
    ├── app/types.ts       # 与主进程的契约（含命令联合类型）
    ├── components/        # 跨功能通用组件（如 RenameDialog）
    ├── features/floor-plan/ # 户型图画板（SVG 渲染）
    ├── lib/plan-geometry.ts # 墙段切分、门弧、窗线、八方向缩放的纯函数
    ├── stores/floor-plan.ts # 户型图与房间状态
    ├── assets/fonts/      # 随包分发的 woff2 字体
    ├── public/            # 原样拷进 dist 根的文件（字体授权全文）
    └── styles/            # fonts / tokens / theme / base
tests/                     # node:test 用例（几何、schema、存储规则）
design/                    # 界面语言与主题提案（theme-proposal.html）
```

依赖方向固定：`renderer → preload → main`，不反向依赖。渲染层拿不到 `ipcRenderer`，只能调用 preload 白名单里的具名方法；每个通道在主进程侧再校验调用者是否为当前主窗口主 frame。

## 窗口与标题栏

窗口以 `frame: false` 启动，系统边框与 min / max / close 全部关闭，改由 `App.vue` 自绘：

- 标题栏高 `--titlebar-height`（40px），整条声明 `-webkit-app-region: drag`，按钮区 `no-drag`；Windows 下的双击最大化、贴边缩放由 `thickFrame` 保留。
- 三个按钮通过 `zhijian:windowControl` 回调主进程，`zhijian:windowState` 查询当前最大化状态，最大化 / 还原后主进程推送 `zhijian:windowStateChanged` 让图标切换。
- 关闭走 `window.close()` 而不是销毁，保留 `close` 与 `pagehide` 钩子，便于以后接「退出前保存」。

## 主题

当前主题为 **苔痕 · 竹青**：竹青 `#3f5a2a` 作主色，赭石 `#8a5a2b` 作次强调，朱红 `#b03a2e` 只用于危险操作。全部颜色集中在 `src/renderer/styles/theme.css`，`tokens.css` 只放刻度（间距、字号、圆角、标题栏高度、网格尺寸）。

另外三套候选主题（宣纸·朱砂 / 墨夜·朱砂 / 檀木·赭石）保留在 `design/theme-proposal.html`，可直接在浏览器里打开对比，将来要做暗色模式或换肤时从这里取色。

## 字体

全站统一使用 **霞鹜文楷 · 屏幕版**（LXGW WenKai Screen），随包分发，不依赖用户机器是否装过 —— 桌面应用必须字体自足，否则同一份界面在不同电脑上排成两副样子。

- `src/renderer/assets/fonts/` 放两份 woff2（Regular 9.8 MB / Medium 8.7 MB），`styles/fonts.css` 里用 `@font-face` 声明同一个家族 `'LXGW WenKai Screen'`，字重区间分别为 `300 400` 与 `500 700`。
- `fonts.css` 必须在 `tokens.css` / `theme.css` 之前导入（见 `base.css` 顶部），保证主题令牌引用该家族时字体已注册。
- `theme.css` 里 `--font-serif` / `--font-sans` / `--font-mono` 三个令牌全部以该家族打头，后面的系统字体只作加载失败兜底。文楷数字等宽（0.6em），所以面积、尺寸、房间编号等等宽场景也直接用它，不再引 Consolas。
- 全局关掉 `font-synthesis`：只有 400 / 500 两档真字重，600 / 700 落到 Medium。合成假粗体会把楷书笔锋糊成一团，宁可停在 Medium。
- 唯一需要写死字体栈的地方是 `features/floor-plan/plan-drawing.vue`：图纸 SVG 会被序列化导出成独立文件，导出后没有 CSS 上下文，字体只能写在元素属性上，所以那里是行内 `font-family` 而非 CSS 变量。
- 授权 SIL OFL 1.1，全文在 `src/renderer/public/OFL-LXGW-WenKai.txt`，构建时原样拷进 `dist/renderer` 根目录随安装包发布。附加条款只允许转换后的 woff2 作网页字体使用，不能再单独发布成可安装桌面字体；当前用法（仅被 `@font-face` 引用）符合要求。

## 命令

```bash
npm install
npm run dev        # Vite + Electron，渲染层热更新，主进程改动自动重启
npm run build      # 构建渲染层到 dist/renderer
npm start          # 以构建产物启动桌面应用
npm run check      # format:check + lint + typecheck + test
npm run smoke      # 主进程自检：数据目录、数据库打开、schema 版本（不弹窗口）
npm run dist       # 打 Windows 安装版与便携版到 release/
```

> 本机环境全局设置了 `ELECTRON_RUN_AS_NODE=1`，直接 `electron .` 会以纯 Node 模式执行并崩溃。`start` / `dev` / `smoke` 三个脚本都会先清除该变量，不要改回裸调用。

## 户型图

户型图是整个数据模型的根：家里的一切（家具、储物设备、物品）最终都要落在房间上，所以首次进入必须先建图，没有图时画布只显示创建引导。

**数据模型（schema 版本 3）**

| 表           | 说明                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `floor_plan` | 单套户型，`CHECK (id = 'singleton')` 在库层锁死只有一行；`room_seq` 是房间默认名称序号   |
| `rooms`      | 房间矩形：`id`、`name`、`x`、`y`、`width`、`height`、`floor`；坐标为画板绝对坐标         |
| `openings`   | 墙上的门窗：`kind`（door/window）、`wall`（四面墙）、`pos`（沿墙起点）、`width`、`hinge` |

洞口不存绝对坐标，只存「挂在哪面墙、沿墙第几个像素开始、多宽」。房间移动或缩放时洞口自动跟随，不会出现门窗跑到墙外的情况。房间删除时洞口级联删除。

`rooms.floor` 为 `NULL` 表示按房间名自动推断地面（卧室木地板、厨卫小砖、其余大砖）；用户手动选过之后写入具体值，此后改名不再影响地面。可选材质共六种：`wood` / `tile` / `small` 可被推断，`marble`（大理石）、`terrazzo`（水磨石）、`carpet`（地毯）只能手动指定。新增材质要同时改 `floor-plan-store.cjs` 的 `FLOORS`、`app/types.ts` 的 `FloorMaterial` 与 `plan-drawing.vue` 的 pattern。

单套户型是明确的产品决策，不是临时实现——多套或多楼层需要新增一层实体，届时走新的迁移。

**绘图与编辑**

- 工具分开：`V` 选择、`R` 画房间、`D` 放门、`W` 放窗、`H` 平移。房间工具下拖出轮廓，选择工具下拖动和八方向缩放。
- 内部沿用 **60px = 1 米** 的坐标，与旧图兼容；编辑按 **100 mm** 网格吸附，优先吸附相邻房间的墙体中心线。绘图背景每大格为 1 米。
- 右侧直接输入房间宽度、进深，或门窗宽度、距墙起点的偏移，单位统一为 **mm**。房间短边至少 1000 mm，门窗至少 400 mm。
- 选择门窗工具后点击墙面放置；预览展示真实落位。共享墙上先选中房间，可以确定门扇朝哪侧开启。选择工具下拖动门窗沿墙调整位置。
- 新绘制、移动和缩放时阻止房间重叠；缩小时保留门窗边界。主进程再次校验同一物理墙上的洞口冲突，失败则事务回滚。
- 滚轮以指针为中心缩放；空格拖拽或鼠标中键平移；`0` 适应画布；`Esc` 取消当前拖拽并恢复已保存状态；`Delete` 删除选中的房间或门窗。
- `Ctrl+Z` 撤销、`Ctrl+Shift+Z` / `Ctrl+Y` 重做，保留当前会话最近 50 次操作。撤销重做也会落库；重启后保留最后图纸，历史不跨会话。
- 左侧空间列表选择房间，右侧编辑名称、尺寸、材质和门窗。尺寸、材质、网格可以分别开关，默认显示简洁建筑线稿。
- 空图可载入两室一厅示例（含过道、玄关和阳台）；已有房间时不提供覆盖入口。支持导出独立 SVG 图纸。

**几何与渲染分层**

- `plan-geometry.ts`：墙面参考系、门弧、窗线、八方向缩放等基础纯函数。
- `plan-scene.ts`：按物理墙线汇总房间边界，在 T 形交接处切分；共享墙只绘制一次，再统一减去门窗洞口。墙端延长只发生在转角，不能侵占洞口。
- `plan-drawing.vue`：纯 SVG 图纸，画布与导出共用。墙体按墙厚描两遍——外层深色做轮廓、内层浅色做墙身，剩下的那一圈就是建筑图的双线墙；门窗洞口挖白后补两侧墙垛断面。外侧墙示意厚度 240 mm，共用隔墙 120 mm；门绘制门扇、门锁点与开启弧，窗绘制墙内三线与端框；外侧显示毫米尺寸链。
- 地面材质用 SVG `<pattern>` 按 60px = 1m 的真实尺寸定义（木地板板宽 0.15 m、800 砖 48px、300 小砖 18px、大理石 800 大板、水磨石 0.4 m 石粒、地毯细密绒线），而不是屏幕像素密度，因此缩放画布时纹理跟着一起放大，纹理密度就是真实铺装密度。房间名与面积压白色描边上（`paint-order: stroke`），纹理再花也不会吃掉文字。
- `use-plan-editor.ts`：画布坐标换算、缩放平移、命中、吸附和拖拽状态。拖动预览独立于已保存数据，取消和写入失败都不会污染存档。
- `floor-plan.ts`：IPC 保存状态与撤销重做。命令先转换成普通数据，避免 Vue 响应式代理跨 `contextBridge` 时无法克隆。

房间仍使用矩形与墙体中心线尺寸，不支持任意多边形或斜墙。墙厚是绘图示意，不区分承重属性；面积为中心线范围统计，不作为套内净面积或建筑面积。

**写入路径**：渲染层发送语义命令，主进程校验并返回完整快照。新增 `replace-rooms` 命令用于示例和历史恢复：在事务内完整校验所有房间、材质和门窗，任一数据无效则整次回滚。房间命名序号只增不减，撤销不会回收。数据库 schema 仍为版本 3，无需迁移旧图。

## 数据与日志位置

- 数据库：`%APPDATA%/知简 Hub/data/zhijian-hub.db`（WAL 模式，schema 版本 3）
- 日志：`%APPDATA%/知简 Hub/logs/main.log`，启动时轮转，保留 5 份
- 自检数据：仓库内 `.runtime/smoke-data`，不进版本库

## 接入新功能时的约定

1. 先在 `database.cjs` 的 `MIGRATIONS` 追加版本迁移，`SCHEMA_VERSION` 同步 +1；不提前建空表。
2. 新增 IPC 通道：`ipc.cjs` 加通道 → `preload.cjs` 加具名方法 → `renderer/app/types.ts` 加契约类型，三处必须同时改。
3. 渲染层不直接访问文件系统与数据库，所有读写走 IPC。
4. 完成标准为 `npm run check` 通过；涉及主进程改动再跑一次 `npm run smoke`。
