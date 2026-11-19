# Eurojackpot – Next.js Ziehungsarchiv

Responsive Next.js Dashboard für Eurojackpot-Gewinnzahlen mit Suche, Kalender, Jahresfilter, Statistik und SQLite-Speicherung. Ziehungen werden aus der öffentlichen JSON-API von protomultix bezogen, die ihrerseits das Archiv von LOTTO Bayern verarbeitet. Alle Angaben ohne Gewähr.

## Lokal starten

Node.js 22 oder neuer verwenden:

```bash
npm install
cp .env.example .env.local
# Für die lokale Entwicklung DATABASE_PATH=./data/database.sqlite setzen
npm run dev
```

Unter http://localhost:3000 öffnen. Der erste Abruf von `/api/draws` importiert die Historie in SQLite; danach wird spätestens nach dem in `SYNC_INTERVAL_HOURS` festgelegten Intervall bei einem erneuten Seitenaufruf aktualisiert. Über „Aktualisieren“ kann ein neuer Import manuell angestoßen werden. Ohne Seitenabruf läuft **kein Hintergrund-Cronjob**.

## Coolify / Hetzner Deployment

1. In Coolify eine **Application → Git Repository** anlegen und dieses Repository auswählen. Nach dem Merge des Pull Requests `main` verwenden; zum Testen kann der Feature-Branch verwendet werden.
2. **Build Pack: Dockerfile**, Container-Port **3000**.
3. Die bereits angelegte SQLite-Datenbank muss als Storage am Next.js-Anwendungscontainer unter **`/var/lib/sqlite`** eingebunden sein. Der Screenshot zeigt einen Mount auf diesen Pfad; falls dieser bereits zur korrekten Application verknüpft wurde, keine zweite Verknüpfung anlegen.
4. Environment Variables für die **Application**: `DATABASE_PATH=/var/lib/sqlite/database.sqlite`, `SYNC_INTERVAL_HOURS=6`. Optional `EUROJACKPOT_SOURCE_URL` auf eine kompatible JSON-Quelle setzen.
5. Deploy auslösen und im Logs-Tab prüfen. Die Datenbank-Datei und das Verzeichnis müssen vom App-Container-Benutzer (UID 10001) beschreibbar sein. Berechtigungen des gemounteten Verzeichnisses bei Bedarf **gezielt** korrigieren, nachdem die tatsächliche UID/GID geprüft wurde, keine pauschalen rekursiven Schreibrechte vergeben.
6. Die Anwendung zeigt die importierten Ziehungen an. Zum manuellen Aktualisieren den Refresh-Button nutzen.

### Wichtig: SQLite ist keine Netzwerkdatenbank

Die Coolify-Ressource `sqlite-database-2wujeqyoiqrozki3toguuj46` ist eine Resource-ID, **kein TCP-Hostname**. `localhost` ist für SQLite nicht relevant: Der Zugriff erfolgt über den gemounteten **Dateipfad** `/var/lib/sqlite/database.sqlite` und nicht über eine Host-/Port-Verbindung.

Die App führt ausschließlich `CREATE TABLE IF NOT EXISTS` und Upserts auf **eigenen** Tabellen `eurojackpot_draws` und `eurojackpot_meta` aus. Bestehende andere Tabellen bleiben unverändert. Vor produktivem Einsatz ein Backup der SQLite-Datei anlegen und Containerberechtigungen kontrollieren.

## API

`GET /api/draws`: JSON mit `draws`, `lastSync`, `syncError`, `source`. `GET /api/draws?refresh=1` erzwingt den erneuten Import.

## Datenquelle und Reichweite

Standardquelle: https://github.com/protomultix/eurojackpot-api

Die Quelle umfasst standardmäßig Ziehungen **ab dem 25.03.2022**. Frühere Ziehungen (ab Eurojackpot-Start 2012) sind mit dieser Konfiguration nicht enthalten. Die App zeigt ausschließlich importierte, validierte Ergebnisse an; bei Importfehlern bleiben alte Daten erhalten. Die App verspricht keine Vorhersagen oder offiziellen Live-Quoten.

## Technische Hinweise

- Node.js 22, Next.js App Router, TypeScript, `better-sqlite3`, `lucide-react`
- SQLite mit WAL und `busy_timeout`
- Die Anwendung verwendet zunächst Google Fonts per CSS; bei öffentlich/DSGVO-relevantem Betrieb sollten diese Fonts lokal gehostet oder durch Systemfonts ersetzt werden.
- Ein öffentlich erreichbarer Refresh-Endpunkt ist nicht erforderlich, aber aktuell kann jeder Nutzer über den UI-Button den serverseitigen Re-Import starten. Für stärkere Last oder Drosselung Zugriff beschränken.
