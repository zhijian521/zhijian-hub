/*============================================================================
  Root layout — 根布局

  家居可视化储物系统
============================================================================*/

/*== 组件导入 ==*/
import type { Metadata } from 'next';

/*== 样式导入 ==*/
import './globals.css';

export const metadata: Metadata = {
    title: '知简 Hub · 家居布局画板',
    description: '可视化家居储物系统 — 绘制房间布局，管理收纳空间',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN">
            <body>{children}</body>
        </html>
    );
}
