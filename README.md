# Xupisco Hax

Cliente desktop para Haxball. Carga Haxball directamente e inyecta búsqueda de salas, favoritos y ajustes dentro de la propia UI del juego.

## Qué hace

- Abre Haxball en ventana desktop sin barra de navegador.
- FPS ilimitados (configurable, usa `--disable-frame-rate-limit` + `--use-angle=gl`).
- Buscador de salas integrado en el room list de Haxball (buscar por nombre, filtrar por país).
- Favoritos persistentes en cada sala.
- Botón de ajustes (engranaje) dentro de la vista de juego con: FPS, always-on-top, fullscreen.
- Contador de FPS opcional.

## Qué NO hace

- No modifica el código de Haxball.
- No manipula WebSocket, red, física ni canvas.
- No implementa fake ping ni spoofing.
- No guarda credenciales.

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Build portable

```bash
npm run package
```

## Atajos

| Atajo | Acción |
|-------|--------|
| F11 | Fullscreen |
| Esc | Salir de fullscreen |
| Ctrl+R | Recargar |

## Configuración

Guardada en `%APPDATA%/xupisco-hax/config.json`:

```json
{
  "startFullscreen": false,
  "windowWidth": 1280,
  "windowHeight": 720,
  "showLocalMetrics": false,
  "alwaysOnTop": false,
  "unlimitedFps": true,
  "favoriteRooms": []
}
```

## Seguridad

- `nodeIntegration: false` — sin acceso a Node.js desde el contenido web.
- `contextIsolation: true` — preload aislado del JS de la página.
- `webSecurity: false` — necesario para acceder al iframe del juego (navegación restringida a dominios de Haxball).
- Navegación restringida — solo dominios de Haxball permitidos.
- Links externos — se abren en el navegador del sistema.
- Sin inyección de código que altere gameplay — solo UI de búsqueda y ajustes.

## Licencia

MIT
