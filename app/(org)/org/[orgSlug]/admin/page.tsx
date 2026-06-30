import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import OrgAdminHub from "@/components/OrgAdminHub";
import type { Organization } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgAdminPage({ params }: Props) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", orgSlug).single();
  if (!org) redirect("/");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const { data: membership } = await supabase
    .from("organization_members").select("role").eq("org_id", org.id).eq("user_id", user.id).maybeSingle();

  const isManager =
    membership?.role === "owner" || membership?.role === "admin" || profile?.role === "admin";
  if (!isManager) redirect(`/org/${orgSlug}`);

  const [settingsResult, membersResult, inviteResult, channelsResult, rolesResult, memberRolesResult] = await Promise.all([
    supabase.from("org_settings").select("role_channels_enabled, setlists_last_synced_at").eq("org_id", org.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, user_id, joined_at, profiles(id, username, display_name, avatar_url)")
      .eq("org_id", org.id),
    supabase.from("organization_invites").select("token").eq("org_id", org.id).maybeSingle(),
    supabase.from("channels").select("*").eq("org_id", org.id).order("name"),
    supabase.from("org_roles").select("id, key, label").eq("org_id", org.id).order("label"),
    supabase.from("org_member_roles").select("user_id, role_key").eq("org_id", org.id),
  ]);

  // Service-role reads (caller already verified as a manager above).
  const serviceDb = await createServiceClient();
  const { data: mtConn } = await serviceDb
    .from("mt_connection")
    .select("connected_email, connected_at, last_error")
    .eq("org_id", org.id)
    .maybeSingle();

  // ── Per-org moderation data ────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const [bannedRes, mutedRes, appealsRes, flagsRes] = await Promise.all([
    serviceDb.from("organization_members")
      .select("user_id, admin_note, profiles(id, username, display_name, avatar_url)")
      .eq("org_id", org.id).eq("is_banned", true),
    serviceDb.from("organization_members")
      .select("user_id, muted_until, profiles(id, username, display_name, avatar_url)")
      .eq("org_id", org.id).not("muted_until", "is", null).gt("muted_until", nowIso),
    serviceDb.from("ban_appeals")
      .select("id, user_id, content, created_at, profiles(id, username, display_name, avatar_url)")
      .eq("org_id", org.id).eq("status", "pending").order("created_at", { ascending: false }),
    serviceDb.from("message_flags")
      .select("id, message_id, created_at, reason, messages!inner(id, content, channel_id, channels!inner(org_id, name, slug), author:profiles(id, username, display_name, avatar_url))")
      .eq("messages.channels.org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <OrgAdminHub
      org={org as Organization}
      myRole={membership?.role ?? (profile?.role === "admin" ? "admin" : "member")}
      isPlatformAdmin={profile?.role === "admin"}
      roleChannelsEnabled={settingsResult.data?.role_channels_enabled ?? true}
      setlistsLastSyncedAt={settingsResult.data?.setlists_last_synced_at ?? null}
      members={(membersResult.data ?? []) as any[]}
      channels={(channelsResult.data ?? []) as any[]}
      roles={(rolesResult.data ?? []) as any[]}
      memberRoles={(memberRolesResult.data ?? []) as any[]}
      banned={(bannedRes.data ?? []) as any[]}
      muted={(mutedRes.data ?? []) as any[]}
      appeals={(appealsRes.data ?? []) as any[]}
      flags={(flagsRes.data ?? []) as any[]}
      inviteToken={inviteResult.data?.token ?? null}
      mtConnectedEmail={mtConn?.connected_email ?? null}
      mtConnectedAt={mtConn?.connected_at ?? null}
      mtLastError={mtConn?.last_error ?? null}
    />
  );
}
