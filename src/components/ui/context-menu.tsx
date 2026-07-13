'use client';

/*============================================================================
  context-menu — 右键菜单

  固定定位浮层，点击外部或 Escape 关闭。
  菜单项支持 danger 样式（删除等危险操作）和分隔线。
============================================================================*/

import { useEffect, useRef } from 'react';

import { useKeyPress } from '@/lib/hooks/use-key-press';
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
    /*-- 菜单条目 --*/
    items: ContextMenuEntry[];
    /*-- 关闭回调 --*/
    onClose: () => void;
}

/*== ContextMenu 右键菜单 — 固定定位浮层 ==*/
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    /*-- Escape 关闭（复用 useKeyPress） --*/
    useKeyPress('Escape', onClose, { ignoreInputs: false });

    /*-- 点击外部关闭 --*/
    useEffect(() => {
        const handleDocumentClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        /*-- 延迟绑定，避免触发菜单的同一次 mousedown 立即关闭 --*/
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleDocumentClick);
        }, 0);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleDocumentClick);
        };
    }, [onClose]);

    return (
        <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
            {items.map((entry, index) => {
                if (isSeparator(entry)) {
                    return <div key={`sep-${index}`} className={styles.separator} />;
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
                        onClick={() => {
                            entry.onClick();
                            onClose();
                        }}
                    >
                        {entry.label}
                    </button>
                );
            })}
        </div>
    );
}
