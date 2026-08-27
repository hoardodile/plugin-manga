# Manga

Un lector de manga para hoardodile: libros por capítulos con modos de
desplazamiento y paginado, mensajes por página y restauración de la
posición de lectura en el visor de la app.

## Funciones

- Directorios de capítulos: carpetas de páginas (las subcarpetas se
  convierten en capítulos) y archivos de cómic individuales — CBZ/zip,
  CBR/rar, CB7/7z, CBT/tar, EPUB — cuyas páginas se materializan en la
  primera vista previa a través de `extractArchive` del host (los
  formatos que no son zip necesitan el binario 7-Zip incluido).
- Vistas de desplazamiento y paginado con zoom; vistas previas del primer
  fotograma; progreso por capítulo y restauración de la posición.
- Mensajes por página anclados a la página actual.
- Los recursos se pueden filtrar por contenido (imagen / animación) en los
  filtros de búsqueda de la biblioteca; las páginas se utilizan para el
  hash de detección de duplicados.

## Requisitos

- hoardodile ≥ 0.1.1 (consulta el README del repositorio).
- Confía en el repositorio antes de instalarlo: el código del plugin se
  ejecuta en el servidor dentro de un sandbox restringido.
