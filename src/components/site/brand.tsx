/*============================================================================
  brand — 品牌标识组件

  左上角 logo + 名称，透明背景浮层
============================================================================*/

/*== 组件导入 ==*/
import Image from 'next/image';

/*== 样式导入 ==*/
import styles from './brand.module.css';

export function Brand() {
    return (
        <div className={styles.brand}>
            <Image src="/logo.webp" alt="" width={28} height={28} />
            <span className={styles.name}>知简</span>
        </div>
    );
}
