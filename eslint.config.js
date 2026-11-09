import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * 静态检查按运行环境分组：
 * - renderer：浏览器 + ESM，Vue 单文件组件 + TS。
 * - main / preload / electron 配置：Electron 主进程侧，CJS，只有 Node 全局。
 * - scripts：Node，ESM，允许控制台输出（开发脚本本来就要打印）。
 * 风格一律交给 Prettier，这里不开风格类规则，避免两套格式化互相打架。
 */
export default tseslint.config(
    {
        ignores: ['dist/**', 'release/**', 'node_modules/**', '.workbuddy/**'],
    },
    js.configs.recommended,
    {
        rules: {
            'no-unused-vars': [
                'error',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
    {
        files: ['src/renderer/**/*.{ts,vue}'],
        // 只启用「正确性」类规则：缩进、属性换行这类排版一律交给 Prettier，
        // 否则两套格式化规则会反复互相改回。
        extends: [...tseslint.configs.recommended, ...pluginVue.configs['flat/essential']],
        languageOptions: {
            globals: { ...globals.browser },
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: ['.vue'],
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        rules: {
            'vue/multi-word-component-names': 'off',
        },
    },
    {
        files: ['src/main/**/*.cjs', 'src/preload/**/*.cjs', 'electron-builder.config.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
    },
    {
        files: ['scripts/**/*.mjs', 'vite.config.ts'],
        languageOptions: {
            globals: { ...globals.node },
        },
        rules: {
            'no-console': 'off',
        },
    },
);
