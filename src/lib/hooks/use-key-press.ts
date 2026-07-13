'use client';

/*============================================================================
  use-key-press — 全局键盘监听 Hook

  在 window 上监听 keydown 事件，支持：
  - 指定按键（如 'Escape'、'Delete'、'Backspace'）
  - 忽略输入框中的按键（INPUT / TEXTAREA / contenteditable）
  - 可选修饰键（ctrlKey / shiftKey / altKey / metaKey）

  用法：
    useKeyPress(['Delete', 'Backspace'], (e) => { ... })
    useKeyPress('Escape', handleClose, { ignoreInputs: false })
============================================================================*/

import { useEffect, useRef } from 'react';

/*== 可编辑元素标签 ==*/
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/*== 配置项 ==*/
interface UseKeyPressOptions {
    /*-- 是否忽略输入框中的按键，默认 true --*/
    ignoreInputs?: boolean;
    /*-- 是否要求 Ctrl 键按下 --*/
    ctrlKey?: boolean;
    /*-- 是否要求 Shift 键按下 --*/
    shiftKey?: boolean;
    /*-- 是否要求 Alt 键按下 --*/
    altKey?: boolean;
    /*-- 是否要求 Meta 键按下 --*/
    metaKey?: boolean;
}

/*== 判断事件目标是否在可编辑元素中 ==*/
function isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (EDITABLE_TAGS.has(el.tagName)) return true;
    return el.isContentEditable;
}

/*== useKeyPress — 全局键盘监听 ==*/
export function useKeyPress(
    keys: string | string[],
    handler: (e: KeyboardEvent) => void,
    options: UseKeyPressOptions = {}
): void {
    const { ignoreInputs = true, ctrlKey, shiftKey, altKey, metaKey } = options;

    /*-- 用 ref 存储 keySet 和 handler，避免每次渲染重新绑定监听器 --*/
    const keySetRef = useRef<Set<string>>(new Set(Array.isArray(keys) ? keys : [keys]));
    keySetRef.current = new Set(Array.isArray(keys) ? keys : [keys]);

    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    /*-- 用 ref 存储配置，避免内联对象每次新建引用 --*/
    const optsRef = useRef({ ignoreInputs, ctrlKey, shiftKey, altKey, metaKey });
    optsRef.current = { ignoreInputs, ctrlKey, shiftKey, altKey, metaKey };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const opts = optsRef.current;

            /*-- 修饰键检查 --*/
            if (opts.ctrlKey !== undefined && e.ctrlKey !== opts.ctrlKey) return;
            if (opts.shiftKey !== undefined && e.shiftKey !== opts.shiftKey) return;
            if (opts.altKey !== undefined && e.altKey !== opts.altKey) return;
            if (opts.metaKey !== undefined && e.metaKey !== opts.metaKey) return;

            /*-- 忽略输入框 --*/
            if (opts.ignoreInputs && isEditable(e.target)) return;

            /*-- 按键匹配 --*/
            if (keySetRef.current.has(e.key)) {
                handlerRef.current(e);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
}
