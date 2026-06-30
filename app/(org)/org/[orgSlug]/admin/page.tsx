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

  // MultiTracks connection status (service role — table is locked to clients).
  const serviceDb = await createServiceClient();
  const { data: mtConn } = await serviceDb
    .from("mt_connection")
    .select("connected_email, connected_at, last_error")
    .eq("org_id", org.id)
    .maybeSingle();

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
      inviteToken={inviteResult.data?.token ?? null}
      mtConnectedEmail={mtConn?.connected_email ?? null}
      mtConnectedAt={mtConn?.connected_at ?? null}
      mtLastError={mtConn?.last_error ?? null}
    />
  );
}
