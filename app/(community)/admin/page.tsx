import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminHub from "./AdminHub";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/channels/general");

  const now = new Date().toISOString();

  // Run all queries in parallel — keep flags as two separate steps to avoid
  // a 3-level deep PostgREST join which can silently return nothing.
  const [mutedResult, bannedResult, appealsResult, flagsResult, peopleResult, settingsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, muted_until")
      .not("muted_until", "is", null)
      .gt("muted_until", now)
      .order("muted_until", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, admin_note")
      .eq("is_banned", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("ban_appeals")
      .select("*, profiles(id, username, display_name, avatar_url)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    // Step 1: flags + messages join (2 levels deep — reliable in PostgREST)
    supabase
      .from("message_flags")
      .select(`
        id,
        message_id,
        created_at,
        flagged_by,
        reporter:profiles!message_flags_flagged_by_fkey(id, username, display_name, avatar_url),
        message:messages(id, content, created_at, channel_id,
          author:profiles(id, username, display_name, avatar_url)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50),
    // All users for the People tab (with community roles embedded)
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, role, is_banned, muted_until, created_at, community_roles(role)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("community_settings").select("role_channels_enabled, setlists_last_synced_at, community_name, logo_url").maybeSingle(),
  ]);

  const rawFlags = flagsResult.data ?? [];

  // Step 2: look up channel slugs for all flagged messages in one query
  const channelIds = [
    ...new Set(
      rawFlags
        .map((f: any) => f.message?.channel_id)
        .filter(Boolean)
    ),
  ];

  const { data: channelRows } = channelIds.length > 0
    ? await supabase
        .from("channels")
        .select("id, slug, name")
        .in("id", channelIds)
    : { data: [] };

  const channelMap = new Map((channelRows ?? []).map((c: any) => [c.id, c]));

  // Attach channel info to each flag
  const flags = rawFlags.map((f: any) => ({
    ...f,
    channel: channelMap.get(f.message?.channel_id) ?? null,
  }));

  return (
    <AdminHub
      mutedUsers={mutedResult.data ?? []}
      bannedUsers={bannedResult.data ?? []}
      appeals={appealsResult.data ?? []}
      flags={flags}
      allUsers={peopleResult.data ?? []}
      roleChannelsEnabled={settingsResult.data?.role_channels_enabled ?? true}
      setlistsLastSyncedAt={settingsResult.data?.setlists_last_synced_at ?? null}
      communityName={settingsResult.data?.community_name ?? null}
      logoUrl={settingsResult.data?.logo_url ?? null}
    />
  );
}
