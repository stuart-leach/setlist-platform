import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { upsertIntercomContact } from "@/lib/intercom";

/**
 * Called by a Supabase database webhook on INSERT to public.profiles.
 * Payload: { record: { id, username, display_name, avatar_url, ... } }
 *
 * To set this up in Supabase:
 *   Database → Webhooks → Create webhook
 *   Table: profiles | Event: INSERT
 *   URL: https://community.yoursite.com/api/intercom/sync
 *   HTTP method: POST
 *   Add header: x-webhook-secret: <your-secret>
 */
export async function POST(request: NextRequest) {
  // Verify the request is from Supabase
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { record?: { id: string; username: string; display_name?: string; avatar_url?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const profile = body.record;
  if (!profile?.id) {
    return NextResponse.json({ error: "Missing profile" }, { status: 400 });
  }

  // Get the email from auth.users (only accessible via service role)
  const supabase = await createServiceClient();
  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);

  if (!authUser.user?.email) {
    return NextResponse.json({ error: "User email not found" }, { status: 404 });
  }

  const intercomId = await upsertIntercomContact({
    email: authUser.user.email,
    external_id: profile.id,
    name: profile.display_name ?? profile.username,
    ...(profile.avatar_url
      ? { avatar: { type: "avatar" as const, image_url: profile.avatar_url } }
      : {}),
  });

  if (intercomId) {
    await supabase
      .from("profiles")
      .update({ intercom_id: intercomId })
      .eq("id", profile.id);
  }

  return NextResponse.json({ ok: true, intercom_id: intercomId });
}
