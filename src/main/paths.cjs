/*============================================================================
  paths — 应用数据目录

  所有可变数据都落在 Electron 的 userData 下，不写安装目录：
  安装目录在 Program Files 里通常只读，且升级会整目录覆盖。
============================================================================*/

const fs = require('node:fs');
const path = require('node:path');

/**
 * 返回数据目录并确保存在。
 * @param {import('electron').App} app
 * @returns {{ root: string, database: string, logs: string }}
 */
function configurePaths(app) {
    const root = path.join(app.getPath('userData'), 'data');
    const logs = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(logs, { recursive: true });

    return { root, database: path.join(root, 'zhijian-hub.db'), logs };
}

module.exports = { configurePaths };
