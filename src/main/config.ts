import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AppConfig, DEFAULT_CONFIG, DEFAULT_PROFILE } from '../shared/types';

const CONFIG_FILE = 'config.json';

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

export function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    const config: AppConfig = { ...DEFAULT_CONFIG, ...parsed };

    if (!Array.isArray(config.profiles) || config.profiles.length === 0) {
      config.profiles = [{ ...DEFAULT_PROFILE }];
    }

    if ('favoriteRooms' in parsed && Array.isArray(parsed.favoriteRooms)) {
      config.profiles[0].fav_rooms = parsed.favoriteRooms;
      delete (config as any).favoriteRooms;
      saveConfig(config);
    }

    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function readFpsSetting(): boolean {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.unlimitedFps !== false;
  } catch {
    return DEFAULT_CONFIG.unlimitedFps;
  }
}
