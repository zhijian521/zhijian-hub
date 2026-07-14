'use client';

/*============================================================================
  dialog — 通用弹窗

  遮罩 + 居中面板，支持焦点陷阱（Tab/Shift+Tab 循环）、Escape 关闭、
  外部点击关闭、打开时禁止 body 滚动。
  直角边框 + 朱砂红描边，中国风简约。
============================================================================*/

import { useEffect, useRef, useCallback, useId } from 'react';

import styles from './dialog.module.css';

/*== 类型定义 ==*/
interface DialogProps {
    /*-- 是否打开 --*/
    open: boolean;
    /*-- 弹窗标题 --*/
    title: string;
    /*-- 关闭回调 --*/
    onClose: () => void;
    /*-- 弹窗内容 --*/
    children: React.ReactNode;
    /*-- 面板最大宽度，默认 24rem --*/
    maxWidth?: string;
}

/*== Dialog 通用弹窗 — 遮罩+居中面板，焦点陷阱+Escape关闭 ==*/
export function Dialog({ open, title, onClose, children, maxWidth }: DialogProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    /*-- 焦点陷阱：Tab / Shift+Tab 在面板内循环 --*/
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;

            const focusable = panelRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        },
        [onClose]
    );

    /*-- 打开时锁定滚动、聚焦弹窗，关闭后恢复触发元素焦点 --*/
    useEffect(() => {
        if (!open) return;

        const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        const animationFrame = requestAnimationFrame(() => {
            const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusable?.[0]) {
                focusable[0].focus();
                return;
            }
            panelRef.current?.focus();
        });

        return () => {
            cancelAnimationFrame(animationFrame);
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            returnFocus?.focus();
        };
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
            <div
                aria-labelledby={titleId}
                aria-modal="true"
                className={styles.panel}
                ref={panelRef}
                role="dialog"
                style={maxWidth ? { maxWidth } : undefined}
                tabIndex={-1}
            >
                <div className={styles.header}>
                    <h2 className={styles.title} id={titleId}>
                        {title}
                    </h2>
                </div>
                <div className={styles.body}>{children}</div>
            </div>
        </div>
    );
}
