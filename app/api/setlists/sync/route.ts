import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchSetlists, decryptToken } from "@/lib/multitracks";

export const dynamic = "force-dynamic";

// Authorize either an admin's browser session OR the daily Vercel Cron call
// (which sends `Authorization: Bearer <CRON_SECRET>`).
async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

async function runSync(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service-role client bypasses RLS to read the connection and upsert channels.
  const db = await createServiceClient();

  const { data: conn } = await db
    .from("mt_connection")
    .select("session_hash, customer_id, user_access_id")
    .eq("id", true)
    .maybeSingle();

  if (!conn?.session_hash || conn.customer_id == null || conn.user_access_id == null) {
    return NextResponse.json({ error: "No MultiTracks account connected." }, { status: 400 });
  }

  let setlists;
  try {
    const session = {
      hash: decryptToken(conn.session_hash),
      customerID: conn.customer_id,
      userAccessID: conn.user_access_id,
    };
    setlists = await fetchSetlists(session);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "MultiTracks sync failed.";
    await db.from("mt_connection").update({ last_error: msg }).eq("id", true);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let created = 0;
  let updated = 0;

  for (const s of setlists) {
    const { data: existing } = await db
      .from("channels")
      .select("id")
      .eq("mt_setlist_id", s.setlistID)
      .maybeSingle();

    if (existing) {
      await db
        .from("channels")
        .update({ name: s.title, mt_setlist_date: s.date || null })
        .eq("id", existing.id);
      updated++;
    } else {
      const { error } = await db.from("channels").insert({
        slug: `setlist-${s.setlistID}`,
        name: s.title,
        channel_type: "setlist",
        mt_setlist_id: s.setlistID,
        mt_setlist_date: s.date || null,
        required_role: null,
        locked: false,
        org_id: null,
      });
      if (!error) created++;
    }
  }

  await db
    .from("community_settings")
    .update({ setlists_last_synced_at: new Date().toISOString() })
    .eq("id", true);

  return NextResponse.json({ ok: true, total: setlists.length, created, updated });
}

// Admin button → POST (cookie session). Vercel Cron → GET (Bearer secret).
export async function POST(req: Request) {
  return runSync(req);
}
export async function GET(req: Request) {
  return runSync(req);
}
