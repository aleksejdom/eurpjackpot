# Eurojackpot – Next.js mit PostgreSQL

Responsive Next.js-Dashboard zur Darstellung historischer Ziehungszahlen. Kalender, Jahresfilter, Suche, Häufigkeitsstatistik und persistente PostgreSQL-Speicherung.

## Coolify / Hetzner

1. Repository in Coolify als **Application** auswählen, Build Pack **Dockerfile**, Port **3000**.
2. In der Application unter **Environment Variables** die geheime Laufzeitvariable **`DATABASE_URL`** mit der vollständigen PostgreSQL-URL setzen. **Nicht** in GitHub oder einen öffentlichen Build-Log schreiben. Bei einem Coolify-Postgres-Dienst muss der interne Hostname aus der PostgreSQL-Ressource verwendet werden; `localhost` ist nicht korrekt, wenn App und DB in unterschiedlichen Containern laufen.
3. Optional **`SYNC_INTERVAL_HOURS=6`** konfigurieren. Diese Variable bestimmt, nach wie vielen Stunden bei einem erneuten API-Seitenabruf aktualisiert wird.
4. App und Postgres-Ressource müssen über ein gemeinsames Docker-Netz erreichbar sein. Postgres muss Zugriffe der Application erlauben.
5. **Deploy** auslösen und die Logs überprüfen. Der erste Aufruf von `/api/draws` legt die Tabellen an und importiert die Historie automatisch.

Die Datenbankresource benötigt **kein SQLite-Volume**. Die App nutzt den PostgreSQL-Dienst direkt über das Docker-Netz.

## Lokal

Node.js >= 22 und eine erreichbare PostgreSQL-Datenbank erforderlich.

```bash
npm install
cp .env.example .env.local
# DATABASE_URL in .env.local durch sichere persönliche Laufzeitverbindung ersetzen
npm run dev
```

## Datenbank

Zwei eigenständige Tabellen werden mit `CREATE TABLE IF NOT EXISTS` erzeugt: `eurojackpot_draws`, `eurojackpot_meta`. Es gibt keine DROP-Anweisung und keine Datenbankmigration alter Tabellen. Zeichnungen werden per Upsert gespeichert. Bestehende andere Tabellen werden nicht angetastet.

**Eine vorherige SQLite-Datenbank wird nicht automatisch migriert.** Daten werden stattdessen aus der öffentlichen Datenquelle neu importiert.

## Datenquelle / Grenzen

Standard: https://github.com/protomultix/eurojackpot-api

Historische Ziehungen ab 25.03.2022 auf Basis des LOTTO-Bayern-Archivs. Automatischer Abruf beim ersten Öffnen und nach `SYNC_INTERVAL_HOURS` bei einem erneuten Seitenabruf; kein echter Cronjob. Manuelles Refresh per Oberfläche oder `GET /api/draws?refresh=1`. `GET /api/draws` liefert `draws`, `lastSync`, `syncError` und `source`.

Alle Angaben ohne Gewähr. Keine offizielle Lotto-Anwendung und keine Vorhersage zukünftiger Zahlen.

## Hinweise

- Bei offenem Zugriff kann der Refresh-Endpunkt von jedem Besucher ausgelöst werden; gegebenenfalls nach Deployment authentifizieren oder drosseln.
- Die Oberfläche bindet derzeit Google Fonts extern ein. Für einen DSGVO-konformen öffentlichen Betrieb Fonts selbst hosten.
- PostgreSQL-Zugangsdaten nie committen. Nach versehentlicher Veröffentlichung das Datenbankpasswort rotieren.
