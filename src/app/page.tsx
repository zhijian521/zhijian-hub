/*============================================================================
  Home page — 首页

  家居可视化储物系统 · 布局画板
============================================================================*/

/*== 组件导入 ==*/
import { RoomCanvas } from '@/components/features/room-canvas/room-canvas';

/*== 样式导入 ==*/
import styles from './page.module.css';

export default function Home() {
    return (
        <main className={styles.main}>
            <RoomCanvas />
        </main>
    );
}
