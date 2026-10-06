# braain-homepage-backend

Backend für die Homepage-Anbindung von braain: Registrierung, Instanz-Pool,
Stripe-Abrechnung. Vollständige fachliche Spezifikation liegt im
Claude-Projekt "braain" unter `produkt/homepage-anbindung-spezifikation.md`.

Getrennt von der jetzigen Marketing-Website (braain.io, World4You) -- dieses
Projekt braucht eine echte Datenbank, dauerhaft erreichbare Webhooks und
Cron-Jobs, was eine klassische Webhosting-Seite nicht zuverlässig kann.

## Was schon funktioniert (Stand dieses Commits)

- **Instanz-Pool-Register**: `POST /api/pool/instances` -- Instanzen melden
  sich selbst an. Secrets werden AES-256-GCM-verschlüsselt gespeichert.
- **Wunschadresse**: Format-Validierung, reservierte Namen, Live-Verfügbarkeitsprüfung
  (`GET /api/register/check-slug`), 90-Tage-Reservierung nach Rückgabe.
- **Registrierung**: `/registrieren` (Formular) → `POST /api/register`
  (wählt eine freie Instanz, ruft `assign`, dann `billing` mit `ACTIVE`/`FREE`/30)
  → `/registrieren/warten` (pollt alle 60s, bis `domainReady` und `invited`
  beide `true` sind).
- Komplett end-to-end gegen eine Fake-Instanz getestet (siehe "Lokal testen"
  unten) -- inklusive Duplikat-Registrierung, vergebenem Slug, ungültigen
  Eingaben und `already_assigned`-Race.

## Was noch fehlt (nächste Schritte, siehe Projekt-Dokument)

Diese Teile sind in der Spezifikation beschrieben, aber in diesem Commit
**noch nicht gebaut** -- bewusst, um zuerst Schritt 1-3 (Grundgerüst,
Pool-Register, Registrierung) solide zu haben, bevor Stripe dazukommt:

- Täglicher Cron-Job (03:00), der `status` für alle zugeteilten Instanzen
  liest und ins Register schreibt.
- Stripe: Checkout, Webhooks, monatliche Abrechnung (1. des Monats, 04:00).
- Free-Lebenszyklus: Inaktivitäts-E-Mails (Tag 7/12), automatisches
  `release` nach 14 Tagen ohne Aktivität.
- `restore`-Endpunkt (Wiederherstellung innerhalb 90 Tagen) -- die
  Datenbank-Felder dafür (`last_backup_id`, `released_at`) existieren
  schon, der Aufruf selbst noch nicht.
- Eine echte Warteschlange für "Pool leer" (aktuell: klare Meldung an den
  Kunden, aber kein automatisches Nachrücken bei neuer/freier Instanz).
- Benachrichtigung ans Braain-Team bei Pool-Knappheit (< 2 freie Instanzen).

## Bekannte Grenzfälle

- Wenn `assign()` auf der Instanz erfolgreich ist, aber der anschließende
  Datenbank-Schreibvorgang bei uns fehlschlägt (z. B. kurzer DB-Ausfall),
  entsteht eine Inkonsistenz: Die Instanz denkt, sie ist zugeteilt, unser
  Register weiß nichts davon. `instance_call_log` protokolliert jeden
  Aufruf -- ein Abgleich "erfolgreicher assign ohne passenden Kunden" ist
  ein guter Kandidat für den täglichen Cron-Job.

## Lokal entwickeln

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run migrate              # Schema anlegen
npm run dev
```

## Projektstruktur

```
app/
  api/
    pool/instances/route.ts          POST -- Instanz-Selbstregistrierung
    register/route.ts                POST -- Registrierungsformular -> assign + billing
    register/check-slug/route.ts     GET  -- Live-Verfügbarkeitsprüfung
    customer/[ref]/status/route.ts   GET  -- Live-Status für die Warteseite
  registrieren/page.tsx              Registrierungsformular
  registrieren/warten/page.tsx       Warteseite mit 60s-Polling
lib/
  braainClient.ts    HMAC-Signierung + typisierte assign/billing/status/release/restore-Aufrufe
  customerRegister.ts  Datenzugriff Kundenregister
  poolRegister.ts      Datenzugriff Instanz-Pool
  slug.ts              Wunschadressen-Regeln
  secretCrypto.ts       AES-256-GCM für PROVISIONING_SECRET
  db.ts                 Postgres-Verbindungspool
migrations/001_init.sql  Datenbankschema
```

Siehe `DEPLOYMENT.md` für die Einrichtung auf Vercel.
