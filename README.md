# Eurojackpot – Next.js, PostgreSQL und Meine Spiele

Persönliches Eurojackpot-Archiv mit Ziehungszahlen, Kalenderfilter, gescannten oder manuell erfassten Spielscheinen, Zahlenstatistik sowie Aufzeichnung von Ausgaben und optionalen Auszahlungen.

## Deployment mit Coolify

1. **main** als Git-Branch, **Dockerfile** als Build-Pack und Port **3000** verwenden.
2. Environment Variables (nur **Runtime**, geheim, niemals ins Repository):
   - `DATABASE_URL`: PostgreSQL-Verbindungsadresse aus deiner bestehenden Coolify-Postgres-Ressource.
   - `BASIC_AUTH_USER`: eigener Benutzername.
   - `BASIC_AUTH_PASSWORD`: starkes, einzigartiges Passwort.
   - `SYNC_INTERVAL_HOURS=6`: optionaler Abrufabstand für Ziehungszahlen.
3. Das interne Coolify-Netzwerk muss die App mit PostgreSQL verbinden. PostgreSQL ist keine SQLite-Datei. Alte SQLite-Variablen und Mounts werden nicht benötigt.
4. HTTPS für die Website aktivieren (auch erforderlich für mobile Kamerafunktionen).
5. Deployment starten, anschließend im Browser per HTTP Basic Auth anmelden.

**Fail closed:** Sind BASIC_AUTH_USER oder BASIC_AUTH_PASSWORD nicht gesetzt, reagiert die App mit HTTP 503, ohne Zugang zum Dashboard oder zu APIs.

## Meine Spiele

- Im Reiter **Meine Spiele** den Button „Spielschein erfassen“ auswählen.
- Auf dem Smartphone über das Kamerafeld ein Foto aufnehmen; alternativ ein bestehendes Bild auswählen.
- **OCR läuft im Browser** (Tesseract.js mit Sprachdaten/Worker, die gegebenenfalls über das Internet geladen werden). Fotos werden **nicht** an die App-API gesendet. OCR ist fallibel: alle erkannten Haupt- und Eurozahlen sowie Termine unbedingt mit dem Schein vergleichen.
- Falls die Erkennung unvollständig ist, Zahlen selbst eintragen: 5 unterschiedliche Hauptzahlen 1–50, 2 unterschiedliche Eurozahlen 1–12.
- **Kaufdatum**, **alle Ziehungstermine** (Dienstag/Freitag), **Gesamtpreis inklusive Gebühren** und optional eine Notiz eingeben.
- Nach Bestätigung und Speichern werden die Tipps bei vorhandenen Ziehungen mit den gespeicherten Gewinnzahlen verglichen.
- Die App kennzeichnet Trefferzahlen, zeigt die Anzahl Haupttreffer + Eurotreffer, speichert pro Ticket die **einmaligen** Kosten sowie optional manuell eingetragene tatsächlich erhaltene Auszahlungen.
- Zusätzliche Übersicht: häufig verwendete Zahlen, Ausgaben nach Kaufmonat, Gesamtausgaben und Differenz zwischen erfassten Auszahlungen und Ausgaben.

### Einschränkungen

- **OCR ist eine Erfassungshilfe, keine sichere automatische Scheinprüfung**. Übertragung von Datum, Anzahl Ziehungen, Auswahl und Gesamtpreis erfolgt nach manueller Bestätigung, nicht automatisch aus dem Foto.
- Historie der aktuellen Quelle ab **25.03.2022**. Fehlen Ergebnisse, erscheint kein abgeschlossener Trefferstatus.
- Aus Zahlentreffern werden **keine Euro-Gewinne geschätzt**. Für reale Gewinne sind offizielle Gewinnklassen/Quoten und tatsächliche Auszahlungen zu prüfen.
- Die App erfasst aktuell keinen Zusatzlotterie-Spieltyp; eingetragene Gesamtkosten können diese enthalten, die Trefferwertung nicht.
- Für Datensicherung PostgreSQL-Backups in Coolify konfigurieren.
- HTTP Basic Auth ist eine einfache Zugangssperre für eine persönliche App. Verwende ausschließlich **HTTPS** und sichere Zugangsdaten. Es gibt keine Multiuser-Isolation oder Login-Verwaltung.
- Bei Bedarf später zusätzlich Rate Limiting und einen Auth-Proxy in Coolify aktivieren.
- Die App verwendet externe Google Fonts; für einen produktiven DSGVO-sensiblen Betrieb lokal hosten.
- Alle Angaben ohne Gewähr. Keine offizielle Eurojackpot-Anwendung.

## Datenbank

Es werden zusätzlich zu `eurojackpot_draws` und `eurojackpot_meta` die Tabellen `ej_tickets`, `ej_ticket_lines`, `ej_ticket_dates`, `ej_payouts` automatisch bei der ersten Anfrage angelegt. Bestehende Tabellen werden nicht gelöscht. Ein Schein kann mehrere Tippfelder und Ziehungstermine haben; der Betrag zählt für den gesamten Schein **einmal**.

## Lokal

Node.js 22+, PostgreSQL. `npm install`, `cp .env.example .env.local`, Werte befüllen, `npm run dev`.

## API (Basic Auth erforderlich)

- `GET /api/draws` – Ziehungen; `?refresh=1` aktualisiert bei Bedarf
- `GET /api/games` – gespeicherte Scheine
- `POST /api/games` – geprüften Schein speichern
- `DELETE /api/games/:id` – Schein entfernen
- `PUT /api/games/:id/payout` – Auszahlung für eine zugeordnete Ziehung speichern
