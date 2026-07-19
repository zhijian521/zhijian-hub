'use client';

/*============================================================================
  context-menu — 右键菜单

  固定定位浮层，点击外部或 Escape 关闭。
  菜单项支持 danger 样式（删除等危险操作）和分隔线。
============================================================================*/

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';

import styles from './context-menu.module.css';

/*== 菜单项 ==*/
export interface ContextMenuItem {
    /*-- 菜单项标签 --*/
    label: string;
    /*-- 点击回调 --*/
    onClick: () => void;
    /*-- 危险操作（红色文字） --*/
    danger?: boolean;
    /*-- 是否禁用 --*/
    disabled?: boolean;
    /*-- 可选图标，仅作视觉提示 --*/
    icon?: React.ReactNode;
}

/*== 分隔线 ==*/
export interface ContextMenuSeparator {
    type: 'separator';
}

/*== 菜单条目：项目或分隔线 ==*/
export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

/*== 类型守卫：是否为分隔线 ==*/
function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
    return (entry as ContextMenuSeparator).type === 'separator';
}

interface ContextMenuProps {
    /*-- 菜单 X 坐标（视口坐标） --*/
    x: number;
    /*-- 菜单 Y 坐标（视口坐标） --*/
    y: number;
    /*-- 菜单无障碍名称 --*/
    ariaLabel: string;
    /*-- 菜单条目 --*/
    items: ContextMenuEntry[];
    /*-- 关闭回调 --*/
    onClose: () => void;
}

/*== ContextMenu 右键菜单 — 固定定位浮层 ==*/
const VIEWPORT_PADDING = 8;

export function ContextMenu({ x, y, ariaLabel, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const [position, setPosition] = useState({ left: x, top: y });

    /*-- 打开后钳制到视口内并聚焦首个可用菜单项 --*/
    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!menu) return;
        if (!returnFocusRef.current && document.activeElement instanceof HTMLElement) {
            returnFocusRef.current = document.activeElement;
        }
        const rect = menu.getBoundingClientRect();
        setPosition({
            left: Math.max(VIEWPORT_PADDING, Math.min(x, window.innerWidth - rect.width - VIEWPORT_PADDING)),
            top: Math.max(VIEWPORT_PADDING, Math.min(y, window.innerHeight - rect.height - VIEWPORT_PADDING)),
        });
        menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    }, [x, y]);

    /*-- 关闭菜单后恢复原焦点 --*/
    useEffect(() => {
        return () => returnFocusRef.current?.focus();
    }, []);

    /*-- 点击外部关闭 --*/
    useEffect(() => {
        const handleDocumentPointerDown = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        /*-- 延迟绑定，避免触发菜单的同一次 pointerdown 立即关闭 --*/
        const timer = setTimeout(() => {
            document.addEventListener('pointerdown', handleDocumentPointerDown);
        }, 0);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('pointerdown', handleDocumentPointerDown);
        };
    }, [onClose]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const menuItems = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
        );
        if (menuItems.length === 0) return;

        const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Home') {
            menuItems[0].focus();
            return;
        }
        if (e.key === 'End') {
            menuItems[menuItems.length - 1].focus();
            return;
        }

        const direction = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + direction + menuItems.length) % menuItems.length;
        menuItems[nextIndex].focus();
    };

    return (
        <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            aria-label={ariaLabel}
            style={position}
            onKeyDown={handleKeyDown}
        >
            {items.map((entry, index) => {
                if (isSeparator(entry)) {
                    return <div key={`sep-${index}`} className={styles.separator} role="separator" />;
                }

                return (
                    <button
                        key={`${entry.label}-${index}`}
                        className={cn(
                            styles.item,
                            entry.danger && styles.itemDanger,
                            entry.disabled && styles.itemDisabled
                        )}
                        disabled={entry.disabled}
                        role="menuitem"
                        onClick={() => {
                            entry.onClick();
                            onClose();
                        }}
                    >
                        <span className={styles.itemIcon} aria-hidden="true">
                            {entry.icon}
                        </span>
                        {entry.label}
                    </button>
                );
            })}
        </div>
    );
}
