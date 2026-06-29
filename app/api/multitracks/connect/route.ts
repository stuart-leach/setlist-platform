import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { authenticateWith, encryptToken } from "@/lib/multitracks";

export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

// Connect: authenticate with the admin-supplied credentials, then persist only
// the encrypted session token + IDs. The password is never stored.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, password } = await req.json().catch(() => ({}));
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
  const { error } = await db.from("mt_connection").update({
    session_hash: encryptToken(session.hash),
    customer_id: session.customerID,
    user_access_id: session.userAccessID,
    connected_email: username,
    connected_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connected: true, email: username });
}

// Disconnect: clear the stored connection.
export async function DELETE() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createServiceClient();
  await db.from("mt_connection").update({
    session_hash: null,
    customer_id: null,
    user_access_id: null,
    connected_email: null,
    connected_at: null,
    last_error: null,
  }).eq("id", true);
  return NextResponse.json({ connected: false });
}
