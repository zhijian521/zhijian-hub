/*============================================================================
  icons — 图标系统

  统一管理全站 SVG 图标，所有图标共用 viewBox="0 0 24 24"。
  stroke 类图标: fill="none" stroke="currentColor"
  新增图标只需在 STROKE_ICONS 中追加条目，无需新增文件。
============================================================================*/

import React from 'react';

/*== 图标组件属性 ==*/
export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
    name: string;
}

/*== 图标组件的函数类型 ==*/
export type IconComponent = React.ComponentType<IconProps>;

/*============================================================================
  图标映射 — SVG inner content

  所有图标共用 viewBox="0 0 24 24"。
  stroke 图标: fill="none" stroke="currentColor" strokeWidth={2}
============================================================================*/

/*-- stroke 类型图标的 inner SVG，按 key 索引 --*/
export const STROKE_ICONS: Record<string, React.ReactNode> = {
    minus: <line x1="5" x2="19" y1="12" y2="12" />,
    plus: <path d="M5 12h14M12 5v14" strokeLinecap="round" strokeLinejoin="round" />,
    /*-- 小手（选取/拖拽画布） --*/
    hand: (
        <path
            d="M8 14V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5V4a1.5 1.5 0 0 1 3 0v7m0-1V5.5a1.5 1.5 0 0 1 3 0v6m0-2a1.5 1.5 0 0 1 3 0v4a8 8 0 0 1-8 8H9.5a4 4 0 0 1-3-1.35L3.5 17a2 2 0 0 1 3-2.6L8 16"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    ),
    /*-- 房间矩形（创建房间） --*/
    room: (
        <path
            d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M10 21v-6h4v6"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    ),
    trash: <path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6" strokeLinecap="round" strokeLinejoin="round" />,
};

/*============================================================================
  图标组件 — 按 key 渲染对应 SVG
============================================================================*/
export function Icon({ name, ...props }: IconProps) {
    const strokeChildren = STROKE_ICONS[name];
    if (strokeChildren) {
        return (
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...props}
            >
                {strokeChildren}
            </svg>
        );
    }

    return null;
}

/*============================================================================
  便捷命名导出 — 兼容 import { XxxIcon } 用法

  后续新增图标直接加 STROKE_ICONS 条目即可，无需新增文件。
============================================================================*/

/*-- 生成具名图标组件 --*/
function makeIcon(name: string): React.ComponentType<Omit<IconProps, 'name'>> {
    const Component = (props: Omit<IconProps, 'name'>) => <Icon name={name} {...props} />;
    Component.displayName = `${name.replace(/(^|-)(\w)/g, (_, _s, c) => c.toUpperCase())}Icon`;
    return Component;
}

export const MinusIcon = makeIcon('minus');
export const PlusIcon = makeIcon('plus');
export const HandIcon = makeIcon('hand');
export const RoomIcon = makeIcon('room');
export const TrashIcon = makeIcon('trash');
