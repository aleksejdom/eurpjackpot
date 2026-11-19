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

## Automatische Dienstag-/Freitag-Aktualisierung

Die App besitzt einen serverseitigen Abrufendpunkt `GET /api/cron/sync` mit geheimem Bearer-Token. Die GitHub-Action `.github/workflows/sync-eurojackpot.yml` ruft ihn dienstags/freitags mehrmals am Abend und zusätzlich am Folgemorgen auf. **Die Zeitsteuerung ist erst aktiv, wenn beide GitHub Repository Secrets eingerichtet sind:**

- `EUROJACKPOT_APP_URL`: exakte öffentliche HTTPS-URL der App, beispielsweise `https://euro.ad-d.info`
- `EUROJACKPOT_CRON_SECRET`: derselbe mindestens 32 Zeichen lange Wert wie die geschützte Coolify-Runtime-Variable `CRON_SECRET`.

Nach Hinterlegen der Secrets im GitHub-Repository unter Settings → Secrets and variables → Actions kann die Action manuell über Actions → Eurojackpot results sync → Run workflow getestet werden. Geplante GitHub-Actions-Ausführungen können zeitlich verzögert sein. Ein Abruf garantiert nicht, dass die externe Quelle zu diesem Zeitpunkt schon aktualisiert wurde.

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
