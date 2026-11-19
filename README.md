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
