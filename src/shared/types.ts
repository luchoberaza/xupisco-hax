export interface GeoOverride {
  lat: number;
  lon: number;
  code: string;
}

export interface Profile {
  id: string;
  name: string;
  autosave: boolean;
  avatar: string | null;
  extrapolation: string | null;
  fav_rooms: string[];
  geo_override: GeoOverride | null;
  player_auth_key: string | null;
  player_name: string | null;
}

export interface AppConfig {
  startFullscreen: boolean;
  windowWidth: number;
  windowHeight: number;
  showLocalMetrics: boolean;
  alwaysOnTop: boolean;
  unlimitedFps: boolean;
  theme: 'og' | 'dark' | 'light' | 'morado' | 'black' | 'blue';
  transparentChat: boolean;
  transparentRoomMenu: boolean;
  transparentScoreboard: boolean;
  ballColor: string | null;
  fieldColor: string | null;
  profiles: Profile[];
  discordRpc: boolean;
  discordRpcClientId: string;
  shortcuts: [string, string][];
  pingOverride: number | null;
}

export const DEFAULT_PROFILE: Profile = {
  id: 'default',
  name: 'Default',
  autosave: true,
  avatar: null,
  extrapolation: null,
  fav_rooms: [],
  geo_override: null,
  player_auth_key: null,
  player_name: null,
};

export const DEFAULT_CONFIG: AppConfig = {
  startFullscreen: false,
  windowWidth: 1280,
  windowHeight: 720,
  showLocalMetrics: false,
  alwaysOnTop: false,
  unlimitedFps: true,
  theme: 'dark',
  transparentChat: false,
  transparentRoomMenu: false,
  transparentScoreboard: false,
  ballColor: null,
  fieldColor: null,
  profiles: [{ ...DEFAULT_PROFILE }],
  discordRpc: false,
  discordRpcClientId: '',
  shortcuts: [['/e', '/extrapolation '], ['/a', '/avatar ']],
  pingOverride: null,
};
