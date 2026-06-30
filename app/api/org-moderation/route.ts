import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Verify the caller is an owner/admin of the given org (or platform admin).
async function managerOf(orgId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "admin") return true;
  const { data: m } = await supabase
    .from("organization_members").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  return m?.role === "owner" || m?.role === "admin";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { org, action, id, status } = body as { org?: string; action?: string; id?: string; status?: string };
  if (!org || !action || !id) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  if (!(await managerOf(org))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await createServiceClient();

  if (action === "dismissFlag") {
    // Confirm the flagged message belongs to this org before deleting.
    const { data: flag } = await db.from("message_flags").select("message_id").eq("id", id).maybeSingle();
    if (!flag) return NextResponse.json({ ok: true });
    const { data: msg } = await db.from("messages").select("channel_id").eq("id", flag.message_id).maybeSingle();
    const { data: ch } = msg ? await db.from("channels").select("org_id").eq("id", msg.channel_id).maybeSingle() : { data: null };
    if (ch?.org_id !== org) return NextResponse.json({ error: "Not in this org." }, { status: 403 });
    await db.from("message_flags").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "resolveAppeal") {
    const next = status === "approved" ? "approved" : "rejected";
    // Confirm the appeal belongs to this org.
    const { data: appeal } = await db.from("ban_appeals").select("org_id, user_id").eq("id", id).maybeSingle();
    if (!appeal || appeal.org_id !== org) return NextResponse.json({ error: "Not in this org." }, { status: 403 });
    await db.from("ban_appeals").update({ status: next }).eq("id", id);
    // Approving an appeal lifts the org ban.
    if (next === "approved") {
      await db.from("organization_members").update({ is_banned: false }).eq("org_id", org).eq("user_id", appeal.user_id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
