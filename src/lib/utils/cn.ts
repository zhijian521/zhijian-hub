/*============================================================================
  cn — 类名组合工具

  基于 clsx 的薄封装，统一项目内类名拼接入口。
  用法：cn(styles.button, isActive && styles.active, 'external-class')
============================================================================*/

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
    return clsx(inputs);
}
