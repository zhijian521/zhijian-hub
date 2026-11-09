import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

/*
 * 渲染层是独立的 Vite 根：`src/renderer` 里放 index.html 与 Vue 应用，
 * 主进程与预加载脚本不参与打包，直接由 Electron 以 CJS 加载。
 *
 * `base: './'` 是打包后的硬要求：生产环境用 file:// 载入 index.html，
 * 绝对路径 `/assets/...` 会解析到磁盘根目录并 404。
 */
export default defineConfig({
    root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
    base: './',
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src/renderer', import.meta.url)),
        },
    },
    server: { host: '127.0.0.1', port: 5178, strictPort: true },
    build: { outDir: '../../dist/renderer', emptyOutDir: true },
});
