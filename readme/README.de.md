# Manga

Ein Manga-Reader für hoardodile: Kapitelbücher mit Scroll- und Seitenmodus,
Nachrichten pro Seite und Wiederherstellung der Leseposition im Viewer
der App.

## Funktionen

- Kapitelverzeichnisse: Seitenordner (Unterordner werden zu Kapiteln) und
  einzelne Comic-Archive — CBZ/zip, CBR/rar, CB7/7z, CBT/tar, EPUB — deren
  Seiten beim ersten Vorschaublick über `extractArchive` des Hosts
  materialisiert werden (Nicht-Zip-Formate brauchen das gebündelte 7-Zip).
- Scroll- und Seitenansicht mit Zoom, Vorschaubilder der ersten Seite,
  Fortschritt pro Kapitel und Positionswiederherstellung.
- Nachrichten pro Seite, an die aktuelle Seite verankert.
- Ressourcen lassen sich im Suchfilter der Bibliothek nach Inhalt
  (Bild / Animation) filtern; Seiten werden für die Duplikaterkennung
  gehasht.

## Anforderungen

- hoardodile ≥ 0.1.9 (Details im README des Repositories).
- Vertraue dem Repository, bevor du es installierst — Plugin-Code läuft
  serverseitig in einer eingeschränkten Sandbox.
