/*============================================================================
  Home page — 首页演示组件

  展示中国风简约亮色主题效果
============================================================================*/

export default function Home() {
    return (
        <main
            style={{
                minHeight: '100vh',
                padding: 'var(--space-8)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
            }}
        >
            {/*== 主标题区域 ==*/}
            <div style={{ marginBottom: 'var(--space-8)' }}>
                <h1
                    style={{
                        fontSize: 'var(--text-3xl)',
                        fontFamily: 'var(--font-serif)',
                        color: 'var(--primary)',
                        marginBottom: 'var(--space-4)',
                    }}
                >
                    知简 Hub
                </h1>
                <p
                    style={{
                        fontSize: 'var(--text-lg)',
                        color: 'var(--muted-foreground)',
                        maxWidth: '60ch',
                        margin: '0 auto',
                    }}
                >
                    简约而雅致的中国风设计主题
                </p>
            </div>

            {/*== 主色展示区域 ==*/}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 'var(--space-4)',
                    maxWidth: '800px',
                    width: '100%',
                }}
            >
                <div
                    style={{
                        padding: 'var(--space-6)',
                        backgroundColor: 'var(--primary)',
                        color: 'var(--primary-foreground)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow)',
                    }}
                >
                    <h3 style={{ color: 'inherit' }}>朱砂红主色</h3>
                    <p>文人书斋的典雅</p>
                </div>

                <div
                    style={{
                        padding: 'var(--space-6)',
                        backgroundColor: 'var(--secondary)',
                        color: 'var(--secondary-foreground)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow)',
                    }}
                >
                    <h3 style={{ color: 'inherit' }}>竹青副色</h3>
                    <p>自然清新的气息</p>
                </div>

                <div
                    style={{
                        padding: 'var(--space-6)',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-sm)',
                    }}
                >
                    <h3 style={{ color: 'var(--foreground)' }}>素净背景</h3>
                    <p>留白呼吸感</p>
                </div>
            </div>
        </main>
    );
}
