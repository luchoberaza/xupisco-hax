import * as path from 'path';
import { BrowserWindow } from 'electron';
import { AppConfig } from '../shared/types';
import { setupNavigationSecurity, setupPermissions } from './security';

const HAXBALL_URL = 'https://www.haxball.com/play';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(config: AppConfig): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: config.windowWidth,
    height: config.windowHeight,
    minWidth: 800,
    minHeight: 600,
    fullscreen: config.startFullscreen,
    alwaysOnTop: config.alwaysOnTop,
    title: 'Xupisco Hax',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: ({ og:'#2c3540', light:'#f0f0f0', morado:'#0c0014', blue:'#020a18' } as Record<string,string>)[config.theme] || '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(HAXBALL_URL);

  setupNavigationSecurity(mainWindow.webContents);
  setupPermissions(mainWindow.webContents);

  mainWindow.webContents.on('will-prevent-unload', (e) => { e.preventDefault(); });
  mainWindow.on('closed', () => { mainWindow = null; });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function toggleFullscreen(): void {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
}

export function setAlwaysOnTop(value: boolean): void {
  if (mainWindow) mainWindow.setAlwaysOnTop(value);
}
