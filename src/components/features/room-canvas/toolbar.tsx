/*============================================================================
  toolbar — 画板顶部工具栏

  类似 PS 左侧工具栏的横向版本，固定在画板顶部居中。
  当前工具：选取（小手，拖拽画布）/ 创建房间（矩形）
============================================================================*/

import { HandIcon, PlusIcon, RoomIcon, TrashIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type { Tool } from '@/lib/types/room-canvas';

import styles from './toolbar.module.css';

/*== 工具条目定义 ==*/
const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <HandIcon />, label: '选取' },
    { id: 'room', icon: <RoomIcon />, label: '房间' },
];

/*== 类型定义 ==*/
interface ToolbarProps {
    /*-- 当前激活工具 --*/
    tool: Tool;
    /*-- 切换工具 --*/
    onToolChange: (tool: Tool) => void;
    /*-- 在视口中心添加默认房间 --*/
    onAddRoom: () => void;
    /*-- 是否允许清空画板 --*/
    canClear: boolean;
    /*-- 清空画板 --*/
    onClear: () => void;
}

/*== Toolbar 工具栏 — 顶部居中浮层 ==*/
export function Toolbar({ tool, onToolChange, onAddRoom, canClear, onClear }: ToolbarProps) {
    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div
            className={styles.container}
            role="toolbar"
            aria-label="画板工具"
            onContextMenu={handleContextMenu}
            onPointerDown={handlePointerDown}
        >
            {TOOLS.map((item) => (
                <button
                    key={item.id}
                    className={cn(styles.button, tool === item.id && styles.buttonActive)}
                    onClick={() => onToolChange(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    aria-pressed={tool === item.id}
                    type="button"
                >
                    {item.icon}
                </button>
            ))}
            <span className={styles.separator} aria-hidden="true" />
            <button className={styles.button} type="button" aria-label="添加房间" title="添加房间" onClick={onAddRoom}>
                <PlusIcon />
            </button>
            <button
                className={styles.button}
                type="button"
                aria-label="清空画板"
                title="清空画板"
                disabled={!canClear}
                onClick={onClear}
            >
                <TrashIcon />
            </button>
        </div>
    );
}
