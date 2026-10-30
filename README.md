# Mashies – Website

Statische Seite (HTML, CSS, Vanilla-JS), kein Build-Schritt.

## Inhalte ändern
- **Preise, Speisekarte, Signature-Gerichte, Öffnungszeiten:** `data.json`
- Öffnungszeiten stehen zusätzlich für Suchmaschinen im JSON-LD-Block in `index.html` (`openingHoursSpecification`) und als Fallback im Footer – bei Änderungen dort mit anpassen.
- Zeiten über Mitternacht einfach so eintragen, wie sie sind (z. B. `"open": "12:00", "close": "02:00"`).
- Ruhetag: `"closed": true` beim Tag setzen.

## Lokal ansehen
`data.json` wird per `fetch` geladen, deshalb einen kleinen Server starten (nicht per Doppelklick öffnen):

```
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen.

## Hosting
Ordner als statische Seite auf Netlify oder Vercel deployen, keine Einstellungen nötig.

## Offene TODOs
Im Code mit `TODO` markiert: `grep -rn TODO --include=*.html --include=*.css --include=*.js .`
