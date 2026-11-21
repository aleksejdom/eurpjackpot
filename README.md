# Eurojackpot – Next.js Dashboard

Persönliches Eurojackpot-Archiv auf Basis von Next.js, PostgreSQL und Better Auth. Es enthält Ziehungshistorie, Datumsauswahl, Statistik, einen Bereich **Meine Spiele**, eine Fotoerfassung mit Tesseract-OCR im Browser, Ausgaben und eine Trefferprüfung anhand der erfassten Ziehungen.

## Login im Frontend / Better Auth

Das frühere HTTP-Basic-Auth-Popup wurde entfernt. Stattdessen erscheint unter `/login` ein eigenes Loginformular mit E-Mail und Passwort. Das Dashboard liegt unter `/` und wird erst bei einer gültigen Better-Auth-Sitzung gerendert. Die Ziehungs- und Spielschein-APIs prüfen ebenfalls die Sitzung. Oben im Dashboard gibt es „Abmelden“.

Better Auth speichert Benutzerkonten und Sessions in derselben PostgreSQL-Datenbank wie die Ziehungsdaten. Das benötigte Better-Auth-Schema wird bei der ersten Anfrage über die integrierte Migration erstellt. Die PostgreSQL-Rolle muss die nötigen Tabellenrechte besitzen.

### Coolify-Einrichtung

- Branch: `main`
- Build Pack: `Dockerfile`, Port `3000`
- `DATABASE_URL`: geheime interne PostgreSQL-Verbindungs-URL
- `BETTER_AUTH_SECRET`: mindestens 32 Zeichen, zufällig; zum Beispiel mittels `openssl rand -base64 48`
- `BETTER_AUTH_URL`: exakte, öffentlich erreichbare HTTPS-Adresse der App, beispielsweise `https://lotto.example.de`
- `BETTER_AUTH_ENABLE_SIGNUP`: **nur bei erster Einrichtung auf `true`**, danach **`false`** und erneut deployen
- `SYNC_INTERVAL_HOURS=6`: optional, Ziehungsdaten werden bei Seitenabrufen aktualisiert

Die alten Variablen `BASIC_AUTH_USER` und `BASIC_AUTH_PASSWORD` werden nicht mehr verwendet und können entfernt werden.

**Erstes Konto anlegen:** zunächst `BETTER_AUTH_ENABLE_SIGNUP=true` setzen und deployen. `/login` aufrufen und „Erstes Konto einrichten“ auswählen. Nach erfolgreicher Registrierung **sofort** `BETTER_AUTH_ENABLE_SIGNUP=false` setzen und redeployen. Damit ist die öffentliche Registrierung wieder gesperrt. Alternativ kann ein Konto über administrative Better-Auth-Werkzeuge angelegt werden.

⚠️ Diese App besitzt aktuell **keine getrennten Datenräume pro User**. Alle angemeldeten Konten sehen dieselben Tipps und Ausgaben. Deshalb in dieser persönlichen Installation nur das eigene Konto anlegen.


## Passwort zurücksetzen (Better Auth)

Im Login befindet sich der Link **Passwort vergessen?**. Unter
`/forgot-password` wird ein Einmal-Link an die hinterlegte E-Mail-Adresse
verschickt; `/reset-password` nimmt den Einmal-Token entgegen und fordert
zweimal das neue Passwort (12–128 Zeichen). Better Auth beendet nach der
Änderung alle bisherigen Sitzungen.

**Wichtig: Erst nach SMTP-Konfiguration versandfähig.** In Coolify
die folgenden geheimen Runtime-Variablen ergänzen:

- `SMTP_HOST` – SMTP-Server des E-Mail-Anbieters
- `SMTP_PORT` – in der Regel 587 (STARTTLS) oder 465 (TLS)
- `SMTP_USER` – Benutzername für das Postfach
- `SMTP_PASSWORD` – SMTP-Passwort
- `SMTP_FROM` – Absender, beispielsweise `Eurojackpot <postfach@example.de>`
- `BETTER_AUTH_URL=https://euro.ad-d.info` – bestehende offizielle HTTPS-Adresse

Bei fehlenden SMTP-Einstellungen liefert die Reset-API HTTP 503, sodass kein
Versand behauptet wird. E-Mail und Ablauf-Link werden **nie** in Logs geschrieben.
Der Link wird beim Aufruf aus der Browser-Adresszeile entfernt. Token laufen nach
30 Minuten ab; nach Nutzung sind sie nicht wiederverwendbar.

Die Zurücksetzungs-E-Mail funktioniert nur, wenn die hinterlegte
Better-Auth-E-Mail-Adresse tatsächlich empfangen werden kann. Die Funktion
umgeht keine Datenbank- oder Authentifizierungsfehler. Der erfolgreiche
GitHub-Build prüft keinen realen SMTP-Versand; nach Coolify-Redeploy ist
ein Test mit dem echten Postfach erforderlich.

## Spielscheinerkennung

Die Erkennung orientiert sich an Lotto-Baden-Württemberg-EUROJACKPOT-Spielquittungen: Spielnummer, 5/50-Hauptzahlen, 2/12-Eurozahlen, Kaufdatum, Laufzeit, Ziehungstermine und Betrag. Das Foto wird vor der Texterkennung lokal im Browser aufbereitet. Bei unsicheren Ergebnissen bleiben Felder leer und werden zur manuellen Kontrolle markiert. **OCR kann Zahlen, Beträge oder Daten falsch ablesen; niemals ungeprüft speichern.** Bilddateien werden nicht in der Datenbank abgelegt oder an die App-API übertragen. OCR-Sprachmodelle können nachgeladen werden.

Der Reiter „Meine Spiele“ speichert nach Bestätigung Tippfelder, Kaufdatum, Ziehungsdaten und Kosten in PostgreSQL. Die Kosten werden pro Schein nur einmal gezählt. Die App zeigt Haupt- und Eurozahlentreffer, individuelle Zahlenhäufigkeiten, Ausgaben nach Monat und optional manuell erfasste Auszahlungen. Gewinnquoten und tatsächliche Gewinnsummen werden nicht automatisch ermittelt.

## Datenquelle

Öffentliches Eurojackpot-JSON-Archiv von https://github.com/protomultix/eurojackpot-api auf Grundlage des LOTTO-Bayern-Archivs, standardmäßig ab 25.03.2022. Import bei erstem Abruf und erneuter Abruf nach dem konfigurierten Intervall; kein Hintergrund-Cronjob.

## API

- `/api/auth/[...all]`: Better Auth
- `GET /api/draws`: Ziehungen
- `GET /api/games`, `POST /api/games`: Spielscheine
- `DELETE /api/games/:id`: Spielschein löschen
- `PUT /api/games/:id/payout`: Auszahlung erfassen

## Lokal

Node.js 22+ und PostgreSQL erforderlich. `npm install` ausführen, `.env.example` als `.env.local` kopieren und eigene Laufzeitvariablen eintragen, dann `npm run dev`.

**Hinweise:** HTTPS verwenden, PostgreSQL-Backups einrichten, Zugangsdaten nicht in GitHub speichern. Es gibt derzeit weder Multiuser-Datentrennung noch automatisierte offizielle Gewinnquoten. Alle Angaben ohne Gewähr; keine offizielle Eurojackpot-Anwendung.

## Gespeicherte Spielscheine bearbeiten

In **Meine Spiele → Gespeicherte Spielscheine** über das Stiftsymbol einen vorhandenen Schein auswählen. Das Formular wird mit den aktuell gespeicherten Hauptzahlen, Eurozahlen, Kaufdatum, Ziehungsterminen, Gesamtpreis und Notiz gefüllt. Zahlen, Felder, Tage und Preise können geändert, ergänzt oder entfernt werden; danach **Änderungen speichern**.

Die Bearbeitung nutzt **PUT /api/games/:id** mit Better-Auth-Sitzungsprüfung und derselben serverseitigen Prüfung wie beim Anlegen. PostgreSQL aktualisiert alle Daten **in einer Transaktion**, ohne den Spielschein zu duplizieren. Auszahlungen zu beibehaltenen Ziehungsterminen bleiben erhalten; beim Entfernen eines Ziehungsdatums werden zugehörige Auszahlungen nach Rückfrage ebenfalls entfernt. Eine Korrektur von Tippzahlen oder Datum aktualisiert automatisch die Trefferanzeige und die Zahlenstatistik.

**Ausgaben:** Die monatliche Übersicht wurde entfernt. Die Seite zeigt die **Summe aller erfassten Scheine**, unabhängig vom Kaufmonat, sowie die erfassten Auszahlungen und die Gesamtbilanz. Jeder Schein zählt einmal, auch bei mehreren Ziehungsterminen.

## Zufallsschein und Musterstatistiken

Unter **Zufallsschein** gibt es vier Auswahlstrategien: **Reiner Zufall**, nach historischen Häufigkeiten gewichtet, mit Präferenz für Zahlen aus dem Zeitraum **2–4 Wochen** vor der neuesten gespeicherten Ziehung und Kombinationen mit **benachbarten Hauptzahlen**. Erzeuge 1 bis 10 Felder und kopiere die Tipps.

Die historische Auswertung zeigt u. a. den Anteil der Ziehungen mit benachbarten Hauptzahlen, mit Wiederholungen aus dem 2–4-Wochen-Rückblick sowie die Top-10-Hauptzahlen. Alle Zahlen werden aus dem vorhandenen Eurojackpot-Archiv berechnet, ohne Prognoseversprechen.

**Wichtig:** Jede gültige Kombination hat bei einer neuen Ziehung dieselbe Jackpotchance (1 : 139.838.160). Gewichtet erzeugte Vorschläge besitzen keinen nachgewiesenen Vorteil. Generierte Zahlen sind **keine gekauften Spielscheine** und werden nicht als Ausgaben erfasst.

## Automatische Dienstag-/Freitag-Aktualisierung (GitHub OIDC)

Der geplante Workflow `.github/workflows/sync-eurojackpot.yml` ruft
`https://euro.ad-d.info/api/cron/sync` dienstags und freitags am
Abend (UTC) sowie am Folgemorgen ab. **Es sind keine GitHub Secrets nötig.**

Die GitHub Action fordert mit `permissions: id-token: write` ein kurzlebiges,
von GitHub signiertes **OIDC-ID-Token** für die konkrete Audience
`https://euro.ad-d.info/api/cron/sync` an. Das Backend prüft die
RSA-Signatur über den festen öffentlichen GitHub-JWKS-Endpunkt, Ablaufzeit,
Issuer, Audience und die exakten Ansprüche:

- Repository: `aleksejdom/eurpjackpot`
- Ref: `refs/heads/main`
- Workflow: `aleksejdom/eurpjackpot/.github/workflows/sync-eurojackpot.yml@refs/heads/main`
- Event: `schedule` oder `workflow_dispatch`.

Nur danach dürfen Draw-Synchronisation und optionale Quotenaktualisierung
gestartet werden. Der alte statische Bearer-Key `CRON_SECRET` funktioniert
alternativ weiterhin, sofern in Coolify konfiguriert; er wird von GitHub
Actions nicht mehr benötigt.

**Deployment:** In Coolify die neueste `main`-Version neu bereitstellen,
damit der Endpoint GitHub OIDC akzeptiert. Anschließend im GitHub-Tab
**Actions → Eurojackpot results sync → Run workflow** einmal manuell
auslösen. Vor dem Redeploy liefert der alte Endpoint weiterhin 401/503,
selbst wenn die GitHub-Action bereits das neue OIDC-Token sendet.

Der Workflow meldet einen Fehler, wenn die Haupt-Ziehungsquelle nicht
erreichbar ist, statt einen fehlgeschlagenen Import als erfolgreich
auszugeben. Eine nicht konfigurierte, optionale Quotenquelle
(`EUROJACKPOT_QUOTAS_URL`) verhindert dagegen keine Aktualisierung der
Ziehungszahlen. Geplante GitHub-Läufe können verspätet starten und Daten
können erst nach Veröffentlichung durch die externe Quelle übernommen werden.

## Gewinnbeträge pro Tippfeld

Die App ermittelt eine der 12 Gewinnklassen nach Hauptzahl- und Eurozahlentreffern und zeigt **Gewonnen: 0,00 €**, wenn keine Gewinnklasse erreicht wurde. Bei einer Gewinnklasse ohne gespeicherte Auszahlungsquote zeigt sie **Gewonnen: Quote ausstehend**, nicht einen geschätzten Eurobetrag. Ist für Datum und Klasse eine passende Quote gespeichert, erscheint der Betrag in Euro.

`eurojackpot_prize_quotas` speichert bestätigte Daten nach Datum und Gewinnklasse. `EUROJACKPOT_QUOTAS_URL` ist eine **optionale** HTTPS-JSON-Quelle mit dem in `lib/prizes.ts` unterstützten Quotenformat. Eine verlässlich kompatible, aktuelle Quelle muss vor der Aktivierung noch geprüft werden; es wird keine unbestätigte Quellenadresse fest einkodiert. Ohne Quotenquelle bleiben Gewinnbeträge bei gewinnberechtigten Tipps als **ausstehend** gekennzeichnet. Manuell erfasste tatsächliche Auszahlungen bleiben davon getrennt.

## Umsetzung der UX- und Generator-Erweiterungen (Nov. 2026)

- `/games/new`: eigenständige, fokussierte Spielscheinerfassung mit Kamera, lokalem OCR, manueller Korrektur und Speichern. Auf dieser Seite werden keine fremden Dashboard-Abschnitte angezeigt.
- `/games/edit/:id`: derselbe Editor für bestehende Scheine. Beide Seiten prüfen die Better-Auth-Sitzung, die API bleibt zusätzlich serverseitig geschützt. Zurück zu `/?tab=games`.
- Geschlossene Spielschein-Kacheln zeigen die Zahl **richtiger Einzelzahlen insgesamt**, getrennt nach Haupt- und Eurozahlen, über alle bekannten zugeordneten Ziehungen und Tippfelder. Fehlende Ziehungen erscheinen als „Treffer noch offen“.
- Die beiden oberen Karten „Erfasste Auszahlungen“ und „Bilanz“ wurden entfernt, ebenso die gleichnamigen Zeilen in der Ausgabenübersicht. Gesamtausgaben werden über alle Scheine berechnet, niemals monatlich oder mehrfach pro Schein.
- Alle Zahlenbälle im Dashboard, in der neuesten Ziehung, den historischen Ziehungen, Spielscheinen und Zufallsscheinen erhalten kompakte, mobile Größen und Abstände, sodass die vollständige Zeile mit 5 + 2 Zahlen möglichst nicht abgeschnitten wird.
- Für den Editor sind versehentliche Zwei-Finger-Gesten per CSS `touch-action` reduziert, ohne das Browser-Menü zur Textvergrößerung zu deaktivieren.

### Zufallsschein

Unter `Zufallsschein` stehen standardmäßig fünf Tippfelder und **neun einzeln schaltbare Regeln** zur Verfügung. Das Accordion erklärt die Kriterien. Vollständig identische Tipps werden selbst dann verhindert, wenn die anderen Regeln abgeschaltet sind.

Der manuelle Zahlenfilter ist getrennt für Hauptzahlen 1–50 und Eurozahlen 1–12; ausgeschlossene Werte können in keinem generierten Tipp vorkommen. Die eigenen Ausschlüsse bleiben optional lokal im Browser gespeichert. Der zusätzliche **strikte Wochenfilter** sperrt alle Zahlen, die in den letzten **2, 3 oder 4 Wochen einschließlich der neuesten gespeicherten Ziehung** gezogen wurden. Er wirkt für Haupt- und Eurozahlen. Zu wenige verbleibende Zahlen führen zu einer Meldung statt zu einem ungültigen Tipp. Die Grundstrategie „Letzte Wochen ausschließen“ aktiviert diesen harten Filter unabhängig von anderen Gewichtungen.

Historische Auswertungen enthalten die häufigsten Haupt- und Eurozahlen, 2er- und 3er-Kombinationen von Hauptzahlen, Nachbarzahl-Häufigkeit, Wiederholungen und Zahlensummen. Die historischen Werte werden **deutlich getrennt** von der unveränderlichen theoretischen Gewinnchance gezeigt. Statistik-Muster sind keine Prognose.

Die Codeänderungen werden durch `npm run test` sowie das GitHub-Actions-Workflow `Verify Eurojackpot app` auf jedem Push nach `main` überprüft. Ein GitHub-Actions-Erfolg muss nach dem Push geprüft werden, bevor eine erfolgreiche Produktions-Buildprüfung behauptet wird.


## Benutzerbezogene Spielscheine (Better Auth)

**Wichtig:** Seit der Einführung der Benutzertrennung erhält jeder neu angelegte
Spielschein automatisch die Better-Auth-ID des angemeldeten Nutzers
(`ej_tickets.owner_user_id`). `GET /api/games`, Erstellen, Ändern, Löschen
und Auszahlungen verwenden diese ID **serverseitig**, nicht aus dem Request.
Untertabellen `ej_ticket_lines`, `ej_ticket_dates` und `ej_payouts`
bleiben über `ticket_id` referenziert und sind nur über zugeordnete,
berechtigte Scheine erreichbar. Ausgaben und persönliche Zahlenstatistiken
werden ausschließlich aus den Scheinen des eigenen Kontos berechnet.

Die Tabelle ist für alle Accounts gemeinsam, aber sämtliche eigenen Zeilen
sind durch `owner_user_id` getrennt. Es werden **keine persönlichen Daten
zwischen Accounts ausgetauscht**. Die öffentlichen Eurojackpot-Ziehungen und
Gewinnquoten sind als gemeinsame, nicht-personenbezogene Daten weiterhin geteilt.

### Upgrade vorhandener Installationen

Die App führt bei der ersten Spielschein-API-Anfrage folgende rückwärtskompatible
Schemaänderung aus:

```sql
ALTER TABLE ej_tickets ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
CREATE INDEX IF NOT EXISTS ej_tickets_owner_idx
  ON ej_tickets(owner_user_id, purchased_on DESC, id DESC);
```

**Alte Spielscheine haben zunächst `owner_user_id IS NULL` und sind somit
für sämtliche Benutzer unsichtbar.** Sie werden nicht gelöscht, aber
aus Datenschutzgründen **nicht automatisch** dem ersten Benutzer zugeteilt.
Insbesondere bei bereits mehreren registrierten Konten wäre diese Zuordnung
unsicher. Ein Administrator muss nach Sicherung der Daten jeden vorhandenen
Schein anhand der bisherigen Datensätze dem richtigen Better-Auth-Konto zuordnen.

In einem gesicherten PostgreSQL-Verwaltungszugang:

```sql
-- Eigentümer anhand der bestehenden Better-Auth-Konten identifizieren:
SELECT id, email FROM "user";

-- Nur alte, nicht zugeordnete Daten anzeigen:
SELECT id, purchased_on, total_cents, note
FROM ej_tickets WHERE owner_user_id IS NULL ORDER BY id;

-- Nach manueller Prüfung die ausdrücklich freigegebenen IDs zuweisen:
BEGIN;
UPDATE ej_tickets
SET owner_user_id = 'HIER_DIE_BESTAETIGTE_USER_ID'
WHERE id IN (123, 456) AND owner_user_id IS NULL;
-- Prüfen, ob die tatsächliche Anzahl zu den ausgewählten Datensätzen passt.
COMMIT;
```

Die Zahlen **123, 456** sind ausschließlich Beispiele. Vorher ein Backup
erstellen und keine pauschale Änderung aller NULL-Zeilen durchführen,
solange die Eigentumsverhältnisse nicht geklärt sind.

### Mehrstufige digitale Spielschein-Erkennung

Digitale Screenshots werden aus dem Originalbild, einer kontrastverbesserten
Version und aus **geometrisch getrennten Spielfeld-Bereichen** analysiert.
Tesseract TSV liefert die Position der Feldüberschriften und Zahlenzeilen;
jedes Spielfeld bleibt über seine Nummer zugeordnet. Wiederholte ganze
Zahlenreihen in mehreren Feldern werden als verdächtig erkannt und nicht
automatisch in jedes Feld übernommen. Bei fehlender Übereinstimmung bleibt
die Zahl leer und muss vor dem Speichern anhand des Originalbilds
kontrolliert werden. **Der Scan ist niemals eine amtliche Gewinnprüfung.**


### Digitale Screenshots: kreisbasierte Erkennung (Version November 2026)

Die Texterkennung von kompletten Bildseiten hat wiederholt dieselben Zahlen in
verschiedene Spielfelder übernommen. Der neue Standardpfad für digitale
Lotto-Screenshots verwendet deshalb **kein Ganzseiten-OCR für Zahlenfelder**:

1. Canvas-Bildanalyse erkennt die hellgrauen horizontalen Zahlenleisten
   anhand ihrer Pixelstruktur (auch auf skalierten Smartphones).
2. Die fünf Hauptzahlen und zwei Eurozahlen werden **je Zahlenkreis** an
   ihrer geometrischen Position ausgeschnitten. Jedes Feld bleibt unabhängig.
3. Tesseract liest die ausgeschnittenen 7 × N Zahlen zunächst in einer
   vertikalen Blattvorlage; ein zweiter Durchlauf nutzt eine andere
   Ausschnittgröße. Widersprüchliche Ziffern bekommen einen dritten Durchlauf.
4. Nur Zahlen, die mindestens zwei Durchläufe übereinstimmend ergeben, werden
   übernommen. Anschließend prüft die App 5 unterschiedliche Hauptzahlen von
   1–50 und 2 unterschiedliche Eurozahlen von 1–12.
5. Unvollständige Felder, ungültige Zahlen und verdächtige identische
   ganze Tippfelder bleiben als kontrollierbare Lücken sichtbar.

Kaufdatum, Ziehung, Betrag und Losnummer werden weiterhin separat aus dem
Screenshot-Text ausgelesen. Die alten Ganzseiten-Zahlen dürfen die erkannten
Kreiswerte **nicht überschreiben**. Bei unbekannten Screenshot-Designs ohne
erkennbare Zahlenleisten greift ein vorsichtiger Fallback mit Warnungen.

**Keine OCR kann eine hundertprozentige Trefferquote bei beliebigen Bild-
und Screenshot-Qualitäten garantieren.** Vor dem Speichern müssen die Zahlen
mit dem Originalbild verglichen werden. Die Verarbeitung bleibt lokal im
Browser; die Bilddatei wird nicht auf dem Server gespeichert.


### Fix: iPhone-Screenshots mit leeren OCR-Feldern

Der frühere Scanner setzte 28 Zahlenausschnitte zu einem extrem hohen Bild
zusammen. Tesseract konnte die einzelnen Zahlen darin auf mobilen Geräten
teilweise gar nicht erkennen. Die neue Fassung liest **jeden Zahlenkreis
als eigenes OCR-Bild**, verwendet eine Maske gegen den grauen Kreisrand,
prüft die Zahl der erkennbaren Ziffern (eine oder zwei) und vergleicht zwei
Tesseract-Segmentierungsmodi. Unsichere Werte bleiben zur Prüfung leer.

In der Erfassungsmaske werden keine scheinbar erkannten Beispielzahlen mehr
angezeigt: Leere Eingaben tragen nur den Platzhalter **„Nicht erkannt“**.
Die Statusmeldung unterscheidet zwischen gefundenen Spielfeldern und
vollständig erkannten Zahlensätzen. Das Bild wird weiterhin nur lokal im
Browser verarbeitet; eine hundertprozentige OCR-Trefferquote ist nicht
versprochen.

## Aktuelle Eurojackpot-Ziehungen: automatische Quellenauswahl

Der frühere Workflow konnte `synced:true` melden, obwohl eine alte Datei
erneut importiert wurde. Nun werden der **letzte Ziehungstag**, der zu
erwartende Ziehungstag und der Quellenstand getrennt geprüft.

- Primärquelle: protomultix / LOTTO-Bayern-Archiv
- Sekundärquelle: [Lottochaos Eurojackpot Open Data](https://lottochaos.com/de/open-data/)
  (CSV `https://lottochaos.com/data/ej.csv`, Lizenz CC BY 4.0,
  Quellenangabe „Lottochaos.com“). Die CSV ist nach `date,weekday,n1..n5,b1..b2`
  aufgebaut; die Anwendung importiert ab dem Eurojackpot-Regelstand
  25.03.2022.
- Ist die Primärquelle nicht erreichbar oder älter als die **fällige**
  Dienstags-/Freitagsziehung, wird automatisch die CSV-Quelle verwendet.
- Ein erfolgreicher Download allein reicht **nicht**: Liegt die neueste
  Ziehung noch vor dem erwarteten Termin, meldet die API einen Fehler.
  Vor 23:00 Uhr lokaler Berliner Zeit ist die Ziehung desselben Abends
  noch nicht als überfällig einzustufen.
- Ein altes Backup kann keine neueren, schon gespeicherten Ziehungen
  überschreiben.
- Das Dashboard zeigt den **letzten echten Ziehungstag**, die verwendete
  Quelle und bei Verzögerung einen auffälligen Warnhinweis statt lediglich
  ein neues Synchronisierungsdatum.
- Ein Klick auf **Aktualisieren** erzwingt auch außerhalb des regulären
  Intervalls einen neuen Quellenauswahlversuch. Im Hintergrund synchronisieren
  GitHub Actions dienstags/freitags mehrfach sowie am Folgemorgen.

Hinweis: Die Backupquelle veröffentlicht Zahlen nach eigenen Angaben kurz
nach der Ziehung, ist aber keine amtliche Lotto-Prüfstelle. Bitte
maßgebliche Gewinne anhand der offiziellen Lotto-Veranstalter prüfen.
