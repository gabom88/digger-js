# Digger JS: notas para Claude Code

Port a JavaScript de *Digger Remastered* (Andrew Jenner, GPL v2), jugable en el
navegador y como PWA. El dueño del proyecto habla español: **responde en
español** y escribe en español los comentarios, los mensajes de commit y los
textos del menú web. Los textos que dibuja el motor en el canvas van en inglés
y en mayúsculas, como en el original (ONE PLAYER, SELECT LEVEL…).

- Repositorio: https://github.com/gabom88/digger-js (público, rama `main`)
- Sitio: https://gabom88.github.io/digger-js/ (GitHub Pages)

## Estructura

| Ruta | Qué hay |
|---|---|
| `web/` | El juego; es lo único que se publica. |
| `web/js/engine.js` | Motor traducido del C (main.c, digger.c, monster.c, bags.c, sound.c…). Conserva los nombres del C. Las esperas bloqueantes del C son `async` + `await newframe()`. |
| `web/js/video.js` | Framebuffer indexado de 640×400 (coordenadas lógicas de 320×200). La fuente original solo tiene letras, dígitos, `.`, `:` y `_`; `EXTRA_GLYPHS` añade `< > [ ]`. |
| `web/js/main.js` | Menú de la página, editor táctil, presets, pausa con menú, PWA. |
| `web/js/touch.js` | Mando táctil de 1 o 2 jugadores (J1 acciones 0-4, J2 5-9). |
| `web/js/controls.js` | Teclado, mando (Gamepad API) y cola de teclas. |
| `web/js/settings.js` | Ajustes y récords en localStorage (formato DIGGER.SCO). |
| `web/sw.js` | Service worker (sin conexión). |
| `tools/serve.py` | Servidor local sin caché. |
| `tools/engine-test.mjs` | Ejecuta el motor en Node: prueba rápida y capturas PNG. |
| `tools/convert-assets.mjs` | Regenera `gfxdata.js` desde los gráficos del C. |
| `docs/screenshots/` | Imágenes del README. |
| Raíz | Código C original (referencia; no se compila). |

## Probar

- **En el navegador:** `python3 tools/serve.py 8000` y abrir http://localhost:8000/.
  El service worker cachea: al probar, desregístralo o borra las cachés.
- **Sin navegador:** `node tools/engine-test.mjs [--shots carpeta]` corre el
  motor real, comprueba lo básico (título, VERSUS, bloqueo del disparo, pausa
  con menú, salir) y guarda capturas. Importa `start()` para escribir otras
  pruebas. Así se generaron las capturas y el GIF del README (el GIF, uniendo
  PNG cuadro a cuadro con ffmpeg).
- **Con Claude in Chrome:** si la ventana de Chrome está oculta, `rAF` no
  corre y `audio.unlock()` no termina, así que el juego no arranca. Para el
  editor táctil u otras vistas, sirve un iframe con el tamaño del teléfono
  (390×844 vertical, 844×390 horizontal). `?timer` en la URL mueve los cuadros
  con `setInterval` (pero el navegador lo frena en pestañas ocultas).

## Publicar (lo que espera el dueño tras cada cambio)

1. Subir `VERSION` en `web/sw.js` (va en `digger-v8`) para que la app
   instalada se actualice.
2. Commit en español, con el cuerpo explicando el porqué y el pie
   `Co-Authored-By` que indique el sistema.
3. `git push` a `main`. El workflow `.github/workflows/pages.yml` publica `web/`.
4. Comprobar: `gh run watch <id> --exit-status` y
   `curl -s https://gabom88.github.io/digger-js/sw.js | grep VERSION`.

En este repo, Git usa el correo privado de GitHub
(`22862061+gabom88@users.noreply.github.com`), no el personal; configúralo con
`git config user.email` si la otra PC no lo tiene. `gh` necesita el permiso
`workflow` para subir cambios del workflow (`gh auth refresh -s workflow`).

## Funciones añadidas y decisiones

**Pantalla de título** (`titlescreen()` en engine.js):
- La primera tecla desvanece el letrero de Windmill: primero se pixela y luego
  se apaga por bloques (`dissolvecopyright`). Pasa una vez por sesión.
- Después aparece la ayuda escrita letra a letra en la línea inferior (`sethint`/`updatehint`).
- Estados `mode` → `type` → `level`:
  - Esc/N (acción 18) cambia ONE PLAYER → TWO PLAYERS → TWO PLAYERS VERSUS.
  - Cualquier otra tecla lleva a ORIGINAL / SELECT LEVEL.
  - SELECT LEVEL muestra la cuadrícula `[1]`…`[10]`.
- En táctil, la cruceta cambia de modo y el botón de pausa hace de Esc/N.
- Las teclas del título llegan enteras por `titlekeys`, porque `checkkeyb()`
  corre varias veces por cuadro.

**TWO PLAYERS VERSUS** (`mode: 'vs'`, `shared = true`):
- Dos diggers a la vez con puntos y vidas compartidos. La reserva de vidas
  vive en `digdat[0].lives` (`getlives`/`addlife`/`declife`) y los puntos van
  a `scdat[0]` (`addscore`).
- Mientras queden vidas, el que muere revive y gasta una. Con 0 vidas, el
  vivo juega la última. Si el equipo gana una vida, el caído revive y la gasta
  (`revive` en `diggerdie`, caso 4).
- **Al pasar de nivel los dos vuelven a su posición inicial**; esto se corrigió
  en `initdigger()`. El dueño quiere conservar que el que muere revive y
  consume vidas.
- Hay fuego amigo, como en el modo simultáneo. Los récords comparten la tabla
  de «2 jugadores simultáneo» (desplazamiento 222 en DIGGER.SCO).

**Otros comportamientos:**
- **Bloqueo del disparo** (`firelock`): la tecla que empezó la partida o quitó
  la pausa no dispara hasta soltarla. Se eligió el bloqueo y no un retardo.
- **Botón de menú durante el juego:**
  - `engine.suspend()` congela el juego y el audio, y el botón principal dice
    «▶ Continuar».
  - Al continuar, `applySettings()` aplica velocidad, sonido, música y vidas
    ilimitadas. El modo y el nivel se aplican en la próxima partida, salvo si
    se estaba en el título.
  - «Terminar partida» llama a `requestQuit()`.
- **Mando táctil:**
  - Disposición por orientación (`layout.landscape` / `layout.portrait`).
  - Cada jugador tiene su tamaño (`dpadSize`, `dpad2Size`…).
  - Los presets guardan las dos orientaciones.
  - La cruceta de J2 solo aparece si `touch.twoPlayer` está activo y la
    partida en marcha es `2s` o `vs` (`engine.currentMode()`).
  - Al activar la casilla del tacto se abre el editor.
  - El panel del editor se aparta con el asa inferior (toque o arrastre).
- **Botones de pausa y menú:** siempre arriba a la derecha. En vertical la
  pantalla del juego baja 48 px para no taparse con ellos.

## Pendiente o sin probar

- Nada de lo táctil se probó en un teléfono real. Se probó en Chrome con
  iframes del tamaño de un teléfono y en Node.
- En tabletas en horizontal (4:3), los botones de arriba pueden tapar un poco
  la esquina del canvas.
- GitHub Actions avisa de que las acciones aún usan Node 20 y de que
  `ubuntu-latest` cambia a Ubuntu 26. Por ahora funciona.
