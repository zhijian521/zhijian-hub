'use client';

/*============================================================================
  input-dialog — 输入弹窗

  基于 Dialog + Button 组合，含文本输入框和确认/取消按钮。
  Escape 关闭、Enter 确认、打开时自动聚焦并全选文本。
============================================================================*/

import { useState, useEffect, useRef, useCallback, useId } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import styles from './input-dialog.module.css';

interface InputDialogProps {
    /*-- 是否打开 --*/
    open: boolean;
    /*-- 弹窗标题 --*/
    title: string;
    /*-- 输入框占位提示 --*/
    placeholder?: string;
    /*-- 输入框标签，默认与弹窗标题一致 --*/
    label?: string;
    /*-- 初始值 --*/
    initialValue?: string;
    /*-- 确认回调，返回字符串 --*/
    onConfirm: (value: string) => void;
    /*-- 取消/关闭回调 --*/
    onClose: () => void;
}

/*== InputDialog 输入弹窗 — 基于 Dialog+Button ==*/
export function InputDialog({
    open,
    title,
    placeholder,
    label = title,
    initialValue = '',
    onConfirm,
    onClose,
}: InputDialogProps) {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const inputId = useId();

    /*-- 打开时重置为初始值并自动聚焦 --*/
    useEffect(() => {
        if (!open) return;
        setValue(initialValue);
        const animationFrame = requestAnimationFrame(() => inputRef.current?.select());
        return () => cancelAnimationFrame(animationFrame);
    }, [open, initialValue]);

    /*-- 确认：不允许空值 --*/
    const handleConfirm = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed) return;
        onConfirm(trimmed);
    }, [value, onConfirm]);

    /*-- 输入框 Enter 确认 --*/
    const handleInputKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        },
        [handleConfirm]
    );

    return (
        <Dialog open={open} title={title} onClose={onClose}>
            <label className={styles.label} htmlFor={inputId}>
                {label}
            </label>
            <Input
                id={inputId}
                ref={inputRef}
                autoComplete="off"
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
            />
            <div className={styles.actions}>
                <Button size="small" onClick={onClose}>
                    取消
                </Button>
                <Button variant="primary" size="small" disabled={!value.trim()} onClick={handleConfirm}>
                    确认
                </Button>
            </div>
        </Dialog>
    );
}
