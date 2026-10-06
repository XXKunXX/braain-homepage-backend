// GET /api/customer/:ref/status
// Wird von der Warteseite alle 60 Sekunden abgefragt, bis domainReady und
// invited beide true sind (Abschnitt "Wunschadresse → Ablauf auf der
// Homepage"). Ruft dafür live status() auf der zugeteilten Instanz auf und
// spiegelt das Ergebnis ins Kundenregister.
// Mit CORS, weil das native Registrierungs-Popup auf braain.io (eigener
// Origin, World4You) diesen Endpunkt direkt per fetch() pollt.
import { NextRequest, NextResponse } from "next/server";
import { readStatus } from "@/lib/braainClient";
import { applyStatusSnapshot, getCustomerByRef, logInstanceCall } from "@/lib/customerRegister";
import { getInstanceById, recordStatusCheck } from "@/lib/poolRegister";
import { corsHeaders, handleCorsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req) ?? new Response(null, { status: 204 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const headers = corsHeaders(req.headers.get("origin"));
  const { ref } = await params;
  const customer = await getCustomerByRef(ref);
  if (!customer) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }
  if (!customer.instance_id) {
    return NextResponse.json(
      {
        ok: true,
        assigned: false,
        domain: null,
        domainReady: false,
        invited: false,
      },
      { headers },
    );
  }

  const instance = await getInstanceById(customer.instance_id);
  if (!instance) {
    return NextResponse.json({ error: "instance_not_found" }, { status: 500, headers });
  }

  const result = await readStatus(instance.baseUrl, instance.secret);

  await logInstanceCall({
    eventId: `poll_${Date.now()}`,
    instanceId: instance.instanceId,
    customerRef: customer.customer_ref,
    path: "status",
    httpStatus: result.status,
    ok: result.ok,
  });

  if (!result.ok) {
    // status() antwortet laut Spezifikation praktisch immer mit 200, auch
    // wenn der Identitätsanbieter der Instanz gerade nicht erreichbar ist.
    // Ein Fehler hier deutet auf ein Signatur-/Netzwerkproblem hin.
    return NextResponse.json({ error: "status_call_failed" }, { status: 502, headers });
  }

  await recordStatusCheck(instance.instanceId, true);
  await applyStatusSnapshot(customer.customer_ref, result.body);

  return NextResponse.json(
    {
      ok: true,
      assigned: result.body.assigned,
      domain: result.body.domain,
      domainReady: result.body.domainReady ?? false,
      invited: result.body.invited ?? false,
      domainError: result.body.domainError ?? null,
      status: result.body.status ?? customer.status,
      plan: result.body.plan ?? customer.plan,
      quota: result.body.quota ?? customer.quota,
    },
    { headers },
  );
}
