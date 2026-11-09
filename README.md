# 知简 Hub

基于 Electron 的桌面应用工程骨架。当前只完成基础架构与工具链，未接入任何业务功能。

旧版 Web 实现（Next.js 15 + React 19）已归档，见标签 `v2.0-archive`；本项目不沿用其代码与功能。

## 技术栈

| 类别     | 选型                                      | 说明                                      |
| -------- | ----------------------------------------- | ----------------------------------------- |
| 运行时   | Electron 38.8.6（内置 Node 22.22）        | 主进程 CJS，预加载脚本 CJS                |
| 渲染层   | Vue 3.5 + Vite 7                          | `src/renderer` 为独立 Vite 根             |
| 状态     | Pinia 3                                   | 按功能建 store，不建全局大对象            |
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
│   ├── database.cjs       # SQLite 连接，schema 版本与迁移框架（当前无业务表）
│   ├── ipc.cjs            # 通道白名单 + 调用方校验
│   ├── logger.cjs         # 落盘日志，保留 5 份
│   └── paths.cjs          # userData 下的数据与日志目录
├── preload/               # contextBridge 暴露具名方法
│   └── preload.cjs
└── renderer/              # Vue 应用（Vite 根）
    ├── App.vue            # 应用外壳：品牌栏 / 工作区 / 状态栏
    ├── app/types.ts       # 与主进程的契约
    ├── stores/app.ts      # 应用级状态（版本、主进程连通性）
    └── styles/            # tokens / theme / base
tests/                     # node:test 用例
```

依赖方向固定：`renderer → preload → main`，不反向依赖。渲染层拿不到 `ipcRenderer`，只能调用 preload 白名单里的具名方法；每个通道在主进程侧再校验调用者是否为当前主窗口主 frame。

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

## 数据与日志位置

- 数据库：`%APPDATA%/知简 Hub/data/zhijian-hub.db`（WAL 模式，当前 schema 版本 0，无业务表）
- 日志：`%APPDATA%/知简 Hub/logs/main.log`，启动时轮转，保留 5 份
- 自检数据：仓库内 `.runtime/smoke-data`，不进版本库

## 接入新功能时的约定

1. 先在 `database.cjs` 的 `MIGRATIONS` 追加版本迁移，`SCHEMA_VERSION` 同步 +1；不提前建空表。
2. 新增 IPC 通道：`ipc.cjs` 加通道 → `preload.cjs` 加具名方法 → `renderer/app/types.ts` 加契约类型，三处必须同时改。
3. 渲染层不直接访问文件系统与数据库，所有读写走 IPC。
4. 完成标准为 `npm run check` 通过；涉及主进程改动再跑一次 `npm run smoke`。
