'use client';

/*============================================================================
  button — 通用按钮

  支持 primary / ghost / danger 三种变体和 small / medium 尺寸。
  克制小圆角，中国风简约配色。
============================================================================*/

import { cn } from '@/lib/utils/cn';

import styles from './button.module.css';

/*== 按钮变体 ==*/
type ButtonVariant = 'primary' | 'ghost' | 'danger';

/*== 按钮尺寸 ==*/
type ButtonSize = 'small' | 'medium';

/*== 类型定义 ==*/
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /*-- 变体：primary 主按钮 / ghost 次要 / danger 危险 --*/
    variant?: ButtonVariant;
    /*-- 尺寸：small 紧凑 / medium 默认 --*/
    size?: ButtonSize;
}

/*== variant → style class ==*/
const VARIANT_CLASS: Record<ButtonVariant, string> = {
    primary: styles.primary,
    ghost: styles.ghost,
    danger: styles.danger,
};

/*== size → style class ==*/
const SIZE_CLASS: Record<ButtonSize, string> = {
    small: styles.small,
    medium: styles.medium,
};

/*== Button 通用按钮 ==*/
export function Button({ variant = 'ghost', size = 'medium', className, children, ...props }: ButtonProps) {
    return (
        <button className={cn(styles.btn, VARIANT_CLASS[variant], SIZE_CLASS[size], className)} {...props}>
            {children}
        </button>
    );
}
