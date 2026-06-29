import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { authenticateWith, encryptToken } from "@/lib/multitracks";

export const dynamic = "force-dynamic";

// Authorize the caller as an owner/admin of the given org. Returns the org id or null.
async function managerOf(orgId: string | null): Promise<string | null> {
  if (!orgId) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  return membership && (membership.role === "owner" || membership.role === "admin") ? orgId : null;
}

function orgIdFrom(req: Request, body?: { org?: string }): string | null {
  const url = new URL(req.url);
  return body?.org || url.searchParams.get("org");
}

// Connect: authenticate with admin-supplied credentials, persist only the
// encrypted session token + IDs for this org. The password is never stored.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orgId = await managerOf(orgIdFrom(req, body));
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  let session;
  try {
    session = await authenticateWith(username, password);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Authentication failed." }, { status: 502 });
  }

  const db = await createServiceClient();
  const { error } = await db.from("mt_connection").upsert({
    org_id: orgId,
    session_hash: encryptToken(session.hash),
    customer_id: session.customerID,
    user_access_id: session.userAccessID,
    connected_email: username,
    connected_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: "org_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connected: true, email: username });
}

// Disconnect: clear this org's stored connection.
export async function DELETE(req: Request) {
  const orgId = await managerOf(orgIdFrom(req));
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createServiceClient();
  await db.from("mt_connection").delete().eq("org_id", orgId);
  return NextResponse.json({ connected: false });
}
