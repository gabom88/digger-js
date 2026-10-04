# Digger JS

Port a JavaScript de **Digger Remastered** (Andrew Jenner, 1998-2004), el
clásico de Windmill Software de 1983, para jugar en el navegador de escritorio
y del móvil. Se puede instalar como app (PWA) y funciona sin conexión.

**Jugar:** https://gabom88.github.io/digger-js/

## Novedades de esta versión

- Pantalla de título con modos ONE PLAYER, TWO PLAYERS y TWO PLAYERS VERSUS
  (Esc o N). En VERSUS los dos diggers juegan a la vez y comparten puntos y vidas.
- Al elegir modo se puede jugar ORIGINAL (niveles en orden) o SELECT LEVEL.
- Controles táctiles para uno o dos jugadores, con editor en pantalla y
  presets que guardan la disposición vertical y la horizontal.
- Mando (Gamepad API), teclas configurables y récords compatibles con DIGGER.SCO.

## Estructura

- `web/`: el juego en JavaScript, el sitio que se publica. Ver [web/README.md](web/README.md).
- `tools/`: conversión de gráficos desde el C (`convert-assets.mjs`) y un
  servidor local (`serve.py`).
- Raíz: código C original de Digger Remastered, del que se tradujo el motor.

## Probarlo en local

```sh
python3 tools/serve.py 8000
```

y abrir http://localhost:8000/.

## Licencia

GPL v2 (ver [COPYING](COPYING) y [copyright.txt](copyright.txt)).
Digger © 1983 Windmill Software. Digger Remastered © 1998-2004 Andrew Jenner.
