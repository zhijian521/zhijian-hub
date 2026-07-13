'use client';

/*============================================================================
  icon-button — 图标按钮

  正方形纯图标按钮，hover 变色。
  简化版：仅 button 模式，无 Link。
============================================================================*/

import { cn } from '@/lib/utils/cn';

import styles from './icon-button.module.css';

/*== 类型定义 ==*/
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /*-- 按钮图标，传入 SVG 元素 --*/
    icon: React.ReactNode;
}

/*== IconButton 图标按钮 — 正方形，纯图标无文字 ==*/
export function IconButton({ icon, className, ...props }: IconButtonProps) {
    return (
        <button className={cn(styles.button, className)} type="button" {...props}>
            {icon}
        </button>
    );
}
