/**
 * electron-builder 打包配置。
 *
 * 只打 Windows x64 的 NSIS 安装版与便携版，与当前实际使用场景一致；
 * 需要别的平台时再补 target，不提前预留。
 */
module.exports = {
    appId: 'com.zhijian.zhijianhub',
    productName: '知简 Hub',
    electronDist: 'node_modules/electron/dist',
    directories: { output: 'release', buildResources: 'build' },
    files: ['dist/renderer/**/*', 'src/main/**/*', 'src/preload/**/*', 'package.json'],
    win: {
        target: [
            { target: 'nsis', arch: ['x64'] },
            { target: 'portable', arch: ['x64'] },
        ],
    },
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        shortcutName: '知简 Hub',
        artifactName: '知简Hub-安装版-${version}.exe',
    },
    portable: { artifactName: '知简Hub-便携版-${version}.exe' },
};
