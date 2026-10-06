# Deployment: GitHub + Vercel + Postgres

Schritt-für-Schritt, für den aktuellen Stand (Registrierung + Pool-Register,
noch ohne Stripe). Dauer: ca. 20-30 Minuten.

## 1. Repository auf GitHub anlegen

1. Auf GitHub ein neues, **privates** Repository anlegen, z. B.
   `braain-homepage-backend`.
2. Im Projektordner:
   ```bash
   git init
   git add .
   git commit -m "Grundgerüst: Pool-Register, Registrierung, Wartemechanik"
   git branch -M main
   git remote add origin https://github.com/<dein-account>/braain-homepage-backend.git
   git push -u origin main
   ```

## 2. Datenbank einrichten (Neon)

Empfehlung: [Neon](https://neon.tech) -- kostenloser Tier reicht für den
Start, Postgres-kompatibel, funktioniert direkt mit diesem Projekt.

1. Bei Neon ein neues Projekt anlegen (Region z. B. Frankfurt, passend zu
   `eu-central-1`/`fra1` auf Vercel-Seite).
2. Den **Connection String** kopieren (Pooled Connection, Format
   `postgres://user:password@host/dbname?sslmode=require`).
3. Lokal testen, dass die Verbindung funktioniert:
   ```bash
   DATABASE_URL="<dein-connection-string>" npm run migrate
   ```
   Das legt die Tabellen an. Danach in der Neon-Oberfläche kurz
   nachsehen (Tables: `customers`, `pool_instances`, `processed_stripe_events`,
   `instance_call_log`), ob alles da ist.

## 3. Secret-Verschlüsselung vorbereiten

```bash
openssl rand -hex 32
```

Das Ergebnis wird `SECRET_ENCRYPTION_KEY`. **Einmal erzeugen und nie wieder
ändern** -- sonst sind bereits gespeicherte Instanz-Secrets nicht mehr
lesbar.

## 4. Pool-Registry-Token erzeugen

```bash
openssl rand -hex 32
```

Das Ergebnis wird `POOL_REGISTRY_TOKEN`. Diesen Wert bekommt **einmalig und
nicht per Chat/Mail im Klartext** Thomas von Braain, damit sich `k01`-`k03`
selbst am Pool-Register anmelden können (siehe Abschnitt "Instanz-Pool" der
Spezifikation). Praktischer Weg: ein Passwort-Manager-Link mit Ablaufdatum,
oder ein einmalig abrufbarer Secret-Sharing-Dienst.

## 5. Vercel-Projekt anlegen

1. Auf [vercel.com](https://vercel.com) -- "Add New… → Project" -- das
   gerade angelegte GitHub-Repository auswählen.
2. Framework wird automatisch als Next.js erkannt, keine Änderungen an den
   Build-Einstellungen nötig.
3. Unter "Environment Variables" eintragen (für "Production" und
   "Preview"):
   | Name | Wert |
   | --- | --- |
   | `DATABASE_URL` | der Neon-Connection-String aus Schritt 2 |
   | `SECRET_ENCRYPTION_KEY` | aus Schritt 3 |
   | `POOL_REGISTRY_TOKEN` | aus Schritt 4 |
   | `HOMEPAGE_BASE_URL` | `https://braain.io` (oder die Domain, unter der dieses Backend später läuft) |
   | `UPGRADE_PAGE_URL` | `https://braain.io/upgrade` |
4. "Deploy" klicken.

## 6. Domain verbinden (optional, später)

Für den Start reicht die von Vercel vergebene `*.vercel.app`-Adresse zum
Testen. Soll die Registrierung später unter `braain.io/registrieren` oder
einer Subdomain wie `konto.braain.io` erreichbar sein, braucht es einen
DNS-Eintrag -- laut Spezifikation bekommst du den von Braain, falls er unter
`braain.io` liegen soll (die DNS-Zone wird von den Instanzen selbst
bedient).

## 7. Instanz-Secret für den Abnahmetest anfordern

Für den Integrationstest gegen `k02.braain.io` (siehe Abschnitt "Abnahme"
der Spezifikation) das Secret von Braain/Thomas anfordern, sobald Schritt 5
live ist -- entweder registriert Braain `k02` direkt über den jetzt
erreichbaren Pool-Register-Endpunkt, oder du trägst das Secret einmalig von
Hand ein (dann aber ebenfalls nicht per Chat/Mail im Klartext).

## 8. Smoke-Test nach dem Deploy

```bash
# Verfügbarkeit eines Testnamens prüfen
curl "https://<dein-projekt>.vercel.app/api/register/check-slug?slug=testbau"

# Formular im Browser öffnen
open https://<dein-projekt>.vercel.app/registrieren
```

## Spätere Schritte (noch nicht Teil dieses Deployments)

Täglicher Status-Cron, Stripe-Anbindung und Free-Lebenszyklus (siehe
README.md, Abschnitt "Was noch fehlt") brauchen zusätzliche
Umgebungsvariablen (Stripe-Keys, Cron-Secret) -- die kommen in einem
Folge-Schritt dazu, sobald dieses Grundgerüst live und abgenommen ist.
