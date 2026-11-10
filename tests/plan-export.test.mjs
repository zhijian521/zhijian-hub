import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'node:test';

const require = createRequire(import.meta.url);
const { registerIpc, CHANNELS } = require('../src/main/ipc.cjs');

it('exports only through a trusted frame and the user-selected file; cancel writes nothing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'floor-plan-export-'));
    const destination = path.join(directory, 'plan.svg');
    const frame = {};
    const window = { isDestroyed: () => false, webContents: { mainFrame: frame } };
    const handlers = new Map();
    let canceled = true;
    let dialogCount = 0;
    registerIpc({
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        app: {},
        db: {},
        getWindow: () => window,
        saveDialog: {
            showSaveDialog: async (_owner, options) => {
                dialogCount++;
                assert.equal(options.defaultPath, '我的家.svg');
                return { canceled, filePath: canceled ? undefined : destination };
            },
        },
    });
    const exportPlan = handlers.get(CHANNELS.floorPlanExport);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>我的家</title></svg>';
    try {
        await assert.rejects(exportPlan({ senderFrame: {} }, svg, '我的家'), /非主窗口/);
        await assert.rejects(exportPlan({ senderFrame: frame }, 'invalid', '我的家'), /图纸内容/);
        assert.equal(dialogCount, 0);
        assert.deepEqual(await exportPlan({ senderFrame: frame }, svg, '我的家'), {
            canceled: true,
        });
        await assert.rejects(readFile(destination), /ENOENT/);
        canceled = false;
        assert.deepEqual(await exportPlan({ senderFrame: frame }, svg, '我的家'), {
            canceled: false,
        });
        assert.equal(await readFile(destination, 'utf8'), svg);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
