# Dante

**Un conserje de cine con IA para Claude Code.** Pide una película o un episodio con tus palabras. Dante busca
en los motores que ya usas, mira qué está disponible al instante en tu debrid, ordena cada versión según tus
preferencias y te dice por qué, añade lo que elijas y lo reproduce.

*[Read in English](README.md)*

Las herramientas para buscar y resolver enlaces ya son maduras. Lo que faltaba es alguien que lea todos los
resultados, sepa que quieres 4K Dolby Vision con audio en castellano, note que el mejor vídeo no tiene
castellano pero otra versión sí, y te diga cuál elegir y por qué. Eso es Dante.

Cómo se ve (respuesta ilustrativa, no una transcripción):

```text
$ dante
◉ ◉ ◉ ○ ○  Círculo VI · Herejía · caché · Night of the Living Dead · 6s

❧ Para La noche de los muertos vivientes (1968) la elección es el remux 4K: 2160p HDR10, vídeo
  sin tocar, audio en castellano e inglés, cacheado en AllDebrid. El remux 1080p ocupa un
  tercio si lo prefieres.
```

`dante search` da el mismo orden sin la IA (salida real de una película de dominio público, con los nombres
de las versiones abreviados):

```text
Night of the Living Dead (1968): 143 results after ranking, from torrentio (145).

1. torrentio:1  score 95  … 4Kremux2160 ….mkv
   2160p · HDR10 · REMUX · DD · 2.0 · 55.7 GB · 0 seeders · …
   audio: Castilian Spanish, English · cache unknown
   why: +40 2160p (preference 1 of 2) | +15 HDR10 | +30 audio in Castilian Spanish | +10 remux (untouched video and audio)
```

## Qué hace

- **Busca en tus motores a la vez:** [AIOStreams](https://github.com/Viren070/AIOStreams), cualquier addon de Stremio (Comet, Torrentio, MediaFusion) y Jackett/Prowlarr. Dante no rastrea nada por su cuenta.
- **Ordena con motivos.** Cada versión lleva una puntuación con los puntos en palabras ("+25 DV", "-60 no Castilian audio known"), para que puedas comprobar la elección.
- **Mira la caché** en AllDebrid, Real-Debrid y TorBox, y limpia lo que tuvo que añadir para mirar.
- **Añade, resuelve y reproduce:** IINA, VLC o mpv, o una fuente "Dante" dentro de Stremio en cualquier dispositivo (también la tele).
- **Rellena el idioma que falta.** Si el mejor vídeo no tiene tu idioma y otra versión sí, prepara el doblaje con [audio4films](https://github.com/4TheDoctor/audio4films): sincronizado, sin pérdida y verificado.
- **Discos Blu-ray completos (BDMV) con menús:** copia los archivos del menú en tu equipo y enlaza el vídeo del montaje de red, así los menús no se leen por la red. En VLC los menús BD-J pueden seguir siendo lentos: es un límite de libbluray.
- **Su propia interfaz ("Inferno"):** un Dante en pixel art en el encabezado, una regla que arde mientras trabaja y una línea discreta por herramienta. Al lado del chat, los nueve círculos del Infierno: Dante y Virgilio los bajan a medida que el pedido avanza de verdad (título, búsqueda, caché, añadir, reproducir, o los pasos de cualquier otro pedido) y al terminar salen a ver las estrellas. `/inferno` los oculta o los muestra; `animation = "full" | "calm" | "off"` en `dante.toml` decide cuánto se mueven. Se abre solo en terminales de 144 columnas o más. Solo usa los puntos de extensión oficiales de Claude Code, que no se modifica. En inglés y en español.

## Instalación

Necesita [Claude Code](https://claude.com/claude-code) y Node 22 o superior.

```bash
brew install 4thedoctor/tap/dante
# o
npm install -g @4thedoctor/dante
```

Después ejecuta `dante`. La primera vez te pide los motores y las claves de debrid (se guardan en el Llavero de
macOS; en Linux, en el Secret Service o en variables de entorno) y crea `~/Dante`, donde se abre siempre.

```bash
dante                # abre Claude Code en ~/Dante, con las herramientas y la interfaz de Dante
dante doctor         # revisa Claude Code, motores, cuentas de debrid, reproductores y audio4films
dante search TITULO --season 3 --episode 6
dante setup          # cambia motores, claves o preferencias
```

Las preferencias están en `~/Dante/dante.toml`; tus gustos, con tus palabras, en `~/Dante/CLAUDE.md`.

## Motores

| Motor | Qué da | Qué necesita |
| --- | --- | --- |
| AIOStreams | Muchos addons y debrids en una sola búsqueda, con la caché por resultado | Tu instancia (un `docker run`) o una pública. Una pública ve tus claves de debrid |
| Addon de Stremio | Lo que encuentre ese addon; marcas de caché si tiene tu clave | Su URL de manifiesto (se guarda en el Llavero) |
| Jackett / Prowlarr | Tus indexadores, y discos Blu-ray completos | URL Torznab y clave |

## Qué no hace Dante

Dante es para **películas, series, documentales y anime**. No busca software, juegos, plugins ni librerías de
sonido, no busca páginas de torrents en internet y no vigila inscripciones de trackers privados. Lee
[DISCLAIMER.md](DISCLAIMER.md).

## Licencia

[MIT](LICENSE)
