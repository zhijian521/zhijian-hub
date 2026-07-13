'use client';

/*============================================================================
  zoom-control — 缩放控制组件

  固定在画板右下角，显示当前缩放比例，
  两侧有 +/- 图标按钮，点击步进 10%。
  缩放范围 50% — 200%。
============================================================================*/

import { IconButton } from '@/components/ui/icon-button';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';

import styles from './zoom-control.module.css';

/*== 类型定义 ==*/
interface ZoomControlProps {
    /*-- 当前缩放比例（0.5 — 2.0） --*/
    zoom: number;
    /*-- 放大 --*/
    onZoomIn: () => void;
    /*-- 缩小 --*/
    onZoomOut: () => void;
}

/*== 缩放范围常量 ==*/
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

/*== ZoomControl 缩放控制 — 右下角浮层 ==*/
export function ZoomControl({ zoom, onZoomIn, onZoomOut }: ZoomControlProps) {
    return (
        <div className={styles.container}>
            <IconButton
                icon={<MinusIcon />}
                onClick={onZoomOut}
                disabled={zoom <= MIN_ZOOM}
                aria-label="缩小"
            />
            <span className={styles.label}>{Math.round(zoom * 100)}%</span>
            <IconButton
                icon={<PlusIcon />}
                onClick={onZoomIn}
                disabled={zoom >= MAX_ZOOM}
                aria-label="放大"
            />
        </div>
    );
}
