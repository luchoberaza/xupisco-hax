import { shell, WebContents } from 'electron';

const ALLOWED_DOMAINS = [
  'www.haxball.com',
  'haxball.com',
  'html5.haxball.com',
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function setupNavigationSecurity(webContents: WebContents): void {
  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

export function setupPermissions(webContents: WebContents): void {
  webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'fullscreen'];
    callback(allowed.includes(permission));
  });
}
