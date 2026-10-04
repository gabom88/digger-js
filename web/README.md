# Digger (versión web)

Port a JavaScript de Digger Remastered (Andrew Jenner, 1998-2004, GPL v2),
basado en el código C de la carpeta superior. Funciona en navegadores de
escritorio y móviles y se puede instalar como PWA.

## Probarlo

```sh
python3 tools/serve.py 8000      # desde la carpeta del proyecto
```

Luego abre http://localhost:8000/. Los módulos ES y el sonido no funcionan si
se abre `index.html` como archivo (`file://`).

Para instalarlo en el iPhone como app, la página tiene que servirse por
**HTTPS** (por ejemplo GitHub Pages, Netlify o Cloudflare Pages: basta con
subir la carpeta `web/`). Por `http://IP-local` el juego funciona, pero
Safari no activa el modo sin conexión.

## Estructura

| Archivo | Equivale a |
|---|---|
| `js/engine.js` | main.c, digger.c, monster.c, bags.c, drawing.c, sprite.c, scores.c, input.c, sound.c, newsnd.c |
| `js/video.js` | win_vid.c (framebuffer indexado de 640x400) |
| `js/audio.js`, `js/audio-worklet.js` | win_snd.c / Sound Blaster |
| `js/controls.js`, `js/touch.js` | teclado de win_sys.c, más táctil y mando |
| `js/settings.js` | DIGGER.INI y DIGGER.SCO en localStorage |
| `js/gfxdata.js` | generado desde vgagrafx.c, alpha.c y vtitle.bmp |

Si se cambian los gráficos en C, se regeneran con `node tools/convert-assets.mjs`.

Al publicar una versión nueva, cambia `VERSION` en `sw.js`.

## Pantalla de título

Al pulsar la primera tecla, el letrero «Windmill Software 1983» se desvanece
pixelándose y en su lugar aparece la ayuda. Esc o N cambia entre ONE PLAYER,
TWO PLAYERS y TWO PLAYERS VERSUS (los dos diggers a la vez, con puntos y vidas
compartidos; usa la tabla de récords de 2 jugadores simultáneo). Cualquier otra
tecla pregunta si jugar ORIGINAL (niveles en orden desde el nivel inicial) o
SELECT LEVEL (niveles 1 a 10). En pantallas táctiles, la cruceta cambia el
modo y el botón de pausa vuelve atrás.

## Mando táctil

Al activar «Mostrar controles táctiles» se abre el editor sobre la pantalla del
juego: los controles se arrastran y se dimensionan mientras se ven. Puede haber
una segunda cruceta y un segundo disparo (en azul) para el jugador 2. Aparecen
en los modos simultáneo y versus. Las disposiciones vertical y horizontal se
guardan por separado, y «Guardar preset» guarda las dos juntas, con los
tamaños y la transparencia.

## Velocidad

El juego original avanza un cuadro cada `ftime` ticks del PIT (80000 ≈ 67 ms,
unos 15 fps). Aquí el tiempo objetivo avanza en pasos fijos y se compara con la
marca de tiempo de `requestAnimationFrame`. Así la velocidad no depende del
refresco de la pantalla, aunque sea variable como en muchos Android. Si el
juego se retrasa mucho (pestaña oculta), se resincroniza en vez de acelerar.

`?timer` en la URL mueve los cuadros con `setInterval`. Solo sirve para
pruebas automatizadas con la ventana oculta.
