// Datenzugriff für das Kundenregister (Tabelle customers).
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { StatusResponse } from "./braainClient";

export function newCustomerRef(): string {
  return `c_${randomUUID()}`;
}

export function newEventId(prefix: "reg" | "rel" | "res"): string {
  return `${prefix}_${randomUUID()}`;
}

export interface NewCustomerInput {
  customerRef: string;
  company: string;
  adminEmail: string;
  slug: string;
  instanceId: string;
  plan: "FREE" | "STARTER" | "PRO" | "BUSINESS";
  quota: number;
  portalUrl?: string | null;
}

export async function insertPendingCustomer(input: NewCustomerInput): Promise<void> {
  const db = getDb();
  await db.query(
    `insert into customers
       (customer_ref, company, admin_email, slug, instance_id, status, plan, quota, portal_url)
     values ($1, $2, $3, $4, $5, 'TRIAL', $6, $7, $8)`,
    [
      input.customerRef,
      input.company,
      input.adminEmail,
      input.slug,
      input.instanceId,
      input.plan,
      input.quota,
      input.portalUrl ?? null,
    ],
  );
}

export async function getCustomerByRef(customerRef: string) {
  const db = getDb();
  const { rows } = await db.query(`select * from customers where customer_ref = $1`, [customerRef]);
  return rows[0] ?? null;
}

// Zweitregistrierung mit derselben E-Mail erkennen (Abschnitt "Instanz-Pool
// → Sonderfälle"): gleiche E-Mail mit bestehender aktiver Instanz, oder mit
// Backup innerhalb 90 Tagen.
export async function findExistingCustomerByEmail(adminEmail: string) {
  const db = getDb();
  const { rows } = await db.query(
    `select * from customers
      where admin_email = $1
      order by created_at desc
      limit 1`,
    [adminEmail],
  );
  return rows[0] ?? null;
}

export async function markCustomerActive(
  customerRef: string,
  fields: { plan: string; quota: number; portalUrl?: string | null },
): Promise<void> {
  const db = getDb();
  await db.query(
    `update customers
        set status = 'ACTIVE', plan = $2, quota = $3, portal_url = coalesce($4, portal_url), updated_at = now()
      where customer_ref = $1`,
    [customerRef, fields.plan, fields.quota, fields.portalUrl ?? null],
  );
}

// Spiegelt die Felder aus einem status()-Aufruf der Instanz in die
// Kundenzeile -- wird sowohl vom Warte-Polling als auch vom täglichen
// Cron-Job genutzt.
export async function applyStatusSnapshot(customerRef: string, status: StatusResponse): Promise<void> {
  const db = getDb();
  await db.query(
    `update customers
        set domain = $2,
            domain_ready = coalesce($3, domain_ready),
            invited = coalesce($4, invited),
            domain_error = $5,
            last_activity_at = coalesce($6, last_activity_at),
            usage_month = coalesce($7, usage_month),
            usage_delivery_notes = coalesce($8, usage_delivery_notes),
            previous_usage_month = coalesce($9, previous_usage_month),
            previous_usage_count = coalesce($10, previous_usage_count),
            updated_at = now()
      where customer_ref = $1`,
    [
      customerRef,
      status.domain,
      status.domainReady ?? null,
      status.invited ?? null,
      status.domainError ?? null,
      status.lastActivityAt ?? null,
      status.usage?.month ?? null,
      status.usage?.deliveryNotes ?? null,
      status.usage?.previousMonth?.month ?? null,
      status.usage?.previousMonth?.deliveryNotes ?? null,
    ],
  );
}

export async function markCustomerReleased(
  customerRef: string,
  fields: { reason: "INACTIVE" | "CANCELED"; backupId: string },
): Promise<void> {
  const db = getDb();
  await db.query(
    `update customers
        set instance_id = null,
            released_at = now(),
            released_reason = $2,
            last_backup_id = $3,
            domain_ready = false,
            invited = false,
            updated_at = now()
      where customer_ref = $1`,
    [customerRef, fields.reason, fields.backupId],
  );
}

export async function logInstanceCall(entry: {
  eventId: string;
  instanceId?: string | null;
  customerRef?: string | null;
  path: "assign" | "billing" | "status" | "release" | "restore";
  httpStatus: number;
  ok: boolean;
  errorCode?: string | null;
  attempt?: number;
}): Promise<void> {
  const db = getDb();
  await db.query(
    `insert into instance_call_log
       (event_id, instance_id, customer_ref, path, http_status, ok, error_code, attempt)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.eventId,
      entry.instanceId ?? null,
      entry.customerRef ?? null,
      entry.path,
      entry.httpStatus,
      entry.ok,
      entry.errorCode ?? null,
      entry.attempt ?? 1,
    ],
  );
}
