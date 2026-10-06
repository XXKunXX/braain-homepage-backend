-- Braain Homepage-Anbindung: Grundschema
-- Siehe produkt/homepage-anbindung-spezifikation.md im Claude-Projekt "braain"
-- für die vollständige fachliche Spezifikation. Reihenfolge der Tabellen ist
-- wegen der Fremdschlüssel wichtig: customers zuerst, dann pool_instances.

-- ─────────────────────────────────────────────────────────────────────────
-- Kundenregister
-- Kunde ↔ Instanz ↔ Stripe ↔ Backup ↔ Wunschadresse in einer Zeile.
-- Zeilen werden nie gelöscht (auch nicht nach "release"), damit die
-- 90-Tage-Reservierung des Slugs und die Backup-Wiederherstellung
-- funktionieren. released_at markiert den Rückbau.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists customers (
  customer_ref          text primary key,            -- z. B. "c_3a9e..." (Schlüssel gegenüber der Instanz, ändert sich NIE)
  company                text not null,
  admin_email            text not null,
  slug                   text not null,               -- Wunschadresse, z. B. "musterbau"

  instance_id            text,                        -- aktuell zugeteilte Instanz (NULL nach release)

  -- Spiegel des zuletzt an die Instanz gemeldeten / von ihr gelieferten Stands
  status                 text not null default 'TRIAL'
                           check (status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'CANCELED')),
  plan                   text check (plan in ('FREE', 'STARTER', 'PRO', 'BUSINESS')),
  quota                  integer,
  trial_ends_at          timestamptz,
  grace_until            timestamptz,
  portal_url             text,

  -- Stripe-Zuordnung (bleibt getrennt vom customer_ref, der gegenüber der Instanz zählt)
  stripe_customer_id     text,
  stripe_subscription_id text,

  -- Wunschadresse / Einrichtungsstatus, Spiegel aus dem letzten `status`-Aufruf
  domain                 text,
  domain_ready           boolean not null default false,
  invited                boolean not null default false,
  domain_error           text,

  -- Nutzung, Spiegel aus dem letzten `status`-Aufruf
  last_activity_at       timestamptz,
  usage_month            text,                        -- "YYYY-MM"
  usage_delivery_notes   integer,
  previous_usage_month   text,
  previous_usage_count   integer,

  -- Lebenszyklus
  last_backup_id         text,                        -- letzte bekannte backupId (für restore)
  released_at            timestamptz,
  released_reason        text check (released_reason in ('INACTIVE', 'CANCELED')),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Ein Slug ist nur einmal "aktiv" belegt (released_at is null). Nach dem
-- Rückbau darf historisch derselbe Slug mehrfach auftauchen (gleicher Kunde,
-- erneute Zuteilung) oder nach Ablauf der 90-Tage-Frist neu vergeben werden
-- -- deshalb kein einfacher unique-Index auf slug, sondern Prüfung in
-- lib/slug.ts (siehe isSlugAvailable).
create index if not exists idx_customers_slug on customers (slug);
create index if not exists idx_customers_instance_id on customers (instance_id);
create index if not exists idx_customers_admin_email on customers (admin_email);

-- ─────────────────────────────────────────────────────────────────────────
-- Instanz-Pool-Register
-- Jede Zeile ist eine Braain-Instanz (kNN.braain.io). Instanzen melden sich
-- selbst über POST /api/pool/instances an (siehe Abschnitt "Instanz-Pool").
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists pool_instances (
  instance_id           text primary key,             -- z. B. "k01", "k02"
  base_url              text not null,                 -- https://k02.braain.io

  -- Das PROVISIONING_SECRET wird NIE im Klartext gespeichert, sondern mit
  -- AES-256-GCM verschlüsselt (siehe lib/secretCrypto.ts). Format:
  -- base64(iv) + "." + base64(ciphertext+authTag).
  secret_encrypted      text not null,
  region                text,

  -- Zustände: frei | zugeteilt | gekuendigt
  status                text not null default 'frei'
                          check (status in ('frei', 'zugeteilt', 'gekuendigt')),
  assigned_customer_ref text references customers (customer_ref),

  last_status_check_at  timestamptz,
  last_status_ok        boolean,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_pool_instances_status on pool_instances (status);

-- ─────────────────────────────────────────────────────────────────────────
-- Idempotenz für eingehende Stripe-Webhooks (getrennt von der 90-Tage-
-- Idempotenz, die jede Braain-Instanz selbst für eventId führt).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists processed_stripe_events (
  event_id   text primary key,
  type       text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- Protokoll jedes Aufrufs Richtung Instanz (assign/billing/status/release/
-- restore) -- für Fehlersuche und die Alarmregeln aus dem Abschnitt
-- "Idempotenz und Fehlerbehandlung".
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists instance_call_log (
  id            bigserial primary key,
  event_id      text not null,
  instance_id   text,
  customer_ref  text,
  path          text not null,                        -- assign | billing | status | release | restore
  http_status   integer,
  ok            boolean,
  error_code    text,
  attempt       integer not null default 1,
  created_at    timestamptz not null default now()
);

create index if not exists idx_instance_call_log_event_id on instance_call_log (event_id);
