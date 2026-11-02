import * as fs from 'fs';
import * as path from 'path';
import { generateKeyPairSync } from 'crypto';
import { app, ipcMain, dialog, Menu, MenuItem } from 'electron';
import { loadConfig, saveConfig, readFpsSetting } from './config';
import { createMainWindow, getMainWindow, toggleFullscreen, setAlwaysOnTop } from './window';
import { AppConfig } from '../shared/types';

if (readFpsSetting()) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('use-angle', 'd3d9');
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let config: AppConfig;
let discordRpc: any = null;

function initDiscordRpc(clientId: string): void {
  try {
    const DiscordRPC = require('discord-rpc');
    discordRpc = new DiscordRPC.Client({ transport: 'ipc' });
    discordRpc.on('ready', () => console.log('Discord RPC ready'));
    discordRpc.login({ clientId }).catch(() => console.log('Discord RPC: failed to connect'));
  } catch {
    console.log('Discord RPC: module not available');
  }
}

app.whenReady().then(() => {
  config = loadConfig();
  createMainWindow(config);
  setupMenu();
  registerIpc();
  if (config.discordRpc && config.discordRpcClientId) {
    initDiscordRpc(config.discordRpcClientId);
  }
});

app.on('window-all-closed', () => app.quit());

function setupMenu(): void {
  const menu = new Menu();
  menu.append(new MenuItem({
    label: 'View',
    submenu: [
      { label: 'Fullscreen', accelerator: 'F11', click: () => toggleFullscreen() },
      {
        label: 'Exit Fullscreen', accelerator: 'Escape', click: () => {
          const w = getMainWindow();
          if (w?.isFullScreen()) w.setFullScreen(false);
        },
      },
      {
        label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => {
          getMainWindow()?.webContents.reload();
        },
      },
      {
        label: 'DevTools', accelerator: 'F12', click: () => {
          getMainWindow()?.webContents.toggleDevTools();
        },
      },
    ],
  }));
  Menu.setApplicationMenu(menu);
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => config);

  ipcMain.handle('config:set', (_ev, partial: Partial<AppConfig>) => {
    config = { ...config, ...partial };
    saveConfig(config);
    if (partial.alwaysOnTop !== undefined) setAlwaysOnTop(partial.alwaysOnTop);
    return config;
  });

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:toggle-fullscreen', () => toggleFullscreen());

  ipcMain.handle('profiles:get', () => config.profiles);

  ipcMain.handle('profiles:save', (_ev, profiles) => {
    config.profiles = profiles;
    saveConfig(config);
    return config.profiles;
  });

  ipcMain.handle('auth:generate-key', () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { format: 'jwk' },
      privateKeyEncoding: { format: 'jwk' },
    } as any);
    const jwk = privateKey as any;
    return `idkey.${jwk.x}.${jwk.y}.${jwk.d}`;
  });

  ipcMain.on('app:restart', () => {
    app.relaunch({ execPath: process.execPath, args: process.argv.slice(1).concat(['--relaunch']) });
    app.exit(0);
  });

  ipcMain.on('discord:update-rpc', (_event, details: string) => {
    if (!discordRpc) return;
    discordRpc.setActivity({
      details,
      largeImageKey: 'xupisco-logo',
      largeImageText: 'Xupisco Hax',
      startTimestamp: Date.now(),
    }).catch(() => {});
  });

  ipcMain.handle('backup:export', async () => {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (!fs.existsSync(configPath)) return { success: false };
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `xupisco-backup-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false };
    fs.copyFileSync(configPath, filePath);
    return { success: true };
  });

  ipcMain.handle('backup:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Importar Backup',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { success: false };
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      const data = JSON.parse(content);
      if (typeof data !== 'object' || data === null) throw new Error('Invalid');
      const configPath = path.join(app.getPath('userData'), 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
      config = loadConfig();
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle('app:bg-base64', () => {
    try {
      const bgPath = path.join(__dirname, '..', '..', 'assets', 'background.png');
      return fs.readFileSync(bgPath).toString('base64');
    } catch { return ''; }
  });
}
