import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUpcomingSetlists } from "@/lib/multitracks";

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

  let setlists;
  try {
    setlists = await getUpcomingSetlists();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "MultiTracks sync failed." },
      { status: 502 }
    );
  }

  // Service-role client bypasses RLS so the sync can upsert channels.
  const db = await createServiceClient();
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
