import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchSetlists, decryptToken, type MtSession } from "@/lib/multitracks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sync one org's setlists into its channels. Returns counts; throws on API error.
async function syncOrg(db: Awaited<ReturnType<typeof createServiceClient>>, conn: {
  org_id: string; session_hash: string; customer_id: number; user_access_id: number;
}): Promise<{ org_id: string; total: number; created: number; updated: number }> {
  const session: MtSession = {
    hash: decryptToken(conn.session_hash),
    customerID: conn.customer_id,
    userAccessID: conn.user_access_id,
  };
  const setlists = await fetchSetlists(session);

  let created = 0;
  let updated = 0;
  for (const s of setlists) {
    const { data: existing } = await db
      .from("channels")
      .select("id")
      .eq("org_id", conn.org_id)
      .eq("mt_setlist_id", s.setlistID)
      .maybeSingle();

    if (existing) {
      await db.from("channels").update({ name: s.title, mt_setlist_date: s.date || null }).eq("id", existing.id);
      updated++;
    } else {
      const { error } = await db.from("channels").insert({
        slug: `setlist-${conn.org_id.slice(0, 8)}-${s.setlistID}`,
        name: s.title,
        channel_type: "setlist",
        mt_setlist_id: s.setlistID,
        mt_setlist_date: s.date || null,
        required_role: null,
        locked: false,
        org_id: conn.org_id,
      });
      if (!error) created++;
    }
  }

  await db.from("org_settings").update({ setlists_last_synced_at: new Date().toISOString() }).eq("org_id", conn.org_id);
  return { org_id: conn.org_id, total: setlists.length, created, updated };
}

// POST — admin-triggered for one org (cookie session, must be that org's manager).
export async function POST(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") || (await req.json().catch(() => ({}))).org;
  if (!orgId) return NextResponse.json({ error: "Missing org." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: membership } = await supabase
    .from("organization_members").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await createServiceClient();
  const { data: conn } = await db
    .from("mt_connection")
    .select("org_id, session_hash, customer_id, user_access_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!conn?.session_hash || conn.customer_id == null || conn.user_access_id == null) {
    return NextResponse.json({ error: "No MultiTracks account connected." }, { status: 400 });
  }

  try {
    const result = await syncOrg(db, conn as any);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "MultiTracks sync failed.";
    await db.from("mt_connection").update({ last_error: msg }).eq("org_id", orgId);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// GET — daily Vercel Cron (Bearer CRON_SECRET). Syncs EVERY connected org.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await createServiceClient();
  const { data: conns } = await db
    .from("mt_connection")
    .select("org_id, session_hash, customer_id, user_access_id")
    .not("session_hash", "is", null)
    .not("org_id", "is", null);

  const results: any[] = [];
  for (const conn of conns ?? []) {
    if (conn.customer_id == null || conn.user_access_id == null) continue;
    try {
      results.push(await syncOrg(db, conn as any));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync failed";
      await db.from("mt_connection").update({ last_error: msg }).eq("org_id", conn.org_id);
      results.push({ org_id: conn.org_id, error: msg });
    }
  }
  return NextResponse.json({ ok: true, orgs: results.length, results });
}
