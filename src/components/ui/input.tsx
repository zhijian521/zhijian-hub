'use client';

/*============================================================================
  input — 通用输入框

  统一文本与搜索输入框的尺寸、边框、焦点状态，并支持可选前置图标。
============================================================================*/

import { forwardRef } from 'react';

import { cn } from '@/lib/utils/cn';

import styles from './input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    leadingIcon?: React.ReactNode;
    containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { leadingIcon, containerClassName, className, ...props },
    ref
) {
    return (
        <span className={cn(styles.container, containerClassName)}>
            {leadingIcon && (
                <span className={styles.leadingIcon} aria-hidden="true">
                    {leadingIcon}
                </span>
            )}
            <input ref={ref} className={cn(styles.input, className)} {...props} />
        </span>
    );
});
