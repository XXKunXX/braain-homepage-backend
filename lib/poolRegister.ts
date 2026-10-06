// Datenzugriff für das Instanz-Pool-Register (Tabelle pool_instances).
import { getDb } from "./db";
import { decryptSecret, encryptSecret } from "./secretCrypto";

export interface PoolInstance {
  instanceId: string;
  baseUrl: string;
  secret: string; // entschlüsselt
  region: string | null;
  status: "frei" | "zugeteilt" | "gekuendigt";
  assignedCustomerRef: string | null;
}

function mapRow(row: any): PoolInstance {
  return {
    instanceId: row.instance_id,
    baseUrl: row.base_url,
    secret: decryptSecret(row.secret_encrypted),
    region: row.region,
    status: row.status,
    assignedCustomerRef: row.assigned_customer_ref,
  };
}

// Wird vom Braain-Skript aufgerufen, wenn eine Instanz angelegt wird
// (POST /api/pool/instances). Legt neu an oder aktualisiert bei gleicher
// instanceId (auch das Secret), statt einen zweiten Eintrag zu erzeugen.
export async function upsertPoolInstance(input: {
  instanceId: string;
  baseUrl: string;
  secret: string;
  region?: string | null;
}): Promise<void> {
  const db = getDb();
  const secretEncrypted = encryptSecret(input.secret);
  await db.query(
    `insert into pool_instances (instance_id, base_url, secret_encrypted, region)
     values ($1, $2, $3, $4)
     on conflict (instance_id) do update
       set base_url = excluded.base_url,
           secret_encrypted = excluded.secret_encrypted,
           region = excluded.region,
           updated_at = now()`,
    [input.instanceId, input.baseUrl, secretEncrypted, input.region ?? null],
  );
}

// Nimmt die älteste freie Instanz aus dem Pool. Markiert sie noch NICHT als
// "zugeteilt" -- das passiert erst, wenn assign() beim Instanz-Aufruf
// erfolgreich war (siehe app/api/register/route.ts), damit bei einem
// Fehlschlag keine Instanz "verloren" geht.
export async function pickFreeInstance(): Promise<PoolInstance | null> {
  const db = getDb();
  const { rows } = await db.query(
    `select * from pool_instances
      where status = 'frei'
      order by created_at asc
      limit 1`,
  );
  if (rows.length === 0) return null;
  return mapRow(rows[0]);
}

export async function markInstanceAssigned(instanceId: string, customerRef: string): Promise<void> {
  const db = getDb();
  await db.query(
    `update pool_instances
        set status = 'zugeteilt', assigned_customer_ref = $2, updated_at = now()
      where instance_id = $1`,
    [instanceId, customerRef],
  );
}

// Für den Sonderfall "assign antwortet 409 already_assigned": die Instanz
// ist nachweislich vergeben, aber nicht an einen uns bekannten Kunden (sonst
// hätten wir sie nicht als frei ausgewählt) -- deshalb ohne Fremdschlüssel
// auf customers, nur der Zustand wird korrigiert, damit sie nicht nochmal
// ausgewählt wird. Braucht eine manuelle Prüfung im Register.
export async function markInstanceAssignedToUnknownCustomer(instanceId: string): Promise<void> {
  const db = getDb();
  await db.query(
    `update pool_instances
        set status = 'zugeteilt', assigned_customer_ref = null, updated_at = now()
      where instance_id = $1`,
    [instanceId],
  );
}

export async function markInstanceFree(instanceId: string): Promise<void> {
  const db = getDb();
  await db.query(
    `update pool_instances
        set status = 'frei', assigned_customer_ref = null, updated_at = now()
      where instance_id = $1`,
    [instanceId],
  );
}

export async function getInstanceById(instanceId: string): Promise<PoolInstance | null> {
  const db = getDb();
  const { rows } = await db.query(`select * from pool_instances where instance_id = $1`, [instanceId]);
  if (rows.length === 0) return null;
  return mapRow(rows[0]);
}

export async function countFreeInstances(): Promise<number> {
  const db = getDb();
  const { rows } = await db.query(`select count(*)::int as n from pool_instances where status = 'frei'`);
  return rows[0].n as number;
}

export async function listAssignedInstances(): Promise<PoolInstance[]> {
  const db = getDb();
  const { rows } = await db.query(`select * from pool_instances where status = 'zugeteilt'`);
  return rows.map(mapRow);
}

export async function recordStatusCheck(instanceId: string, ok: boolean): Promise<void> {
  const db = getDb();
  await db.query(
    `update pool_instances
        set last_status_check_at = now(), last_status_ok = $2
      where instance_id = $1`,
    [instanceId, ok],
  );
}
