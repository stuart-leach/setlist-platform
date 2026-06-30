import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CommunityShell from "@/components/CommunityShell";
import type { Organization, Channel, Profile } from "@/lib/supabase/types";

interface Props {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/");

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", orgSlug).single();
  if (!org) redirect("/");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, is_banned")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Non-members who aren't platform admins get bounced
  if (!membership && profile.role !== "admin") redirect("/");

  // Banned from THIS org — show a notice instead of the workspace (no redirect
  // loop, and they keep access to any other orgs).
  if (membership?.is_banned) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#fff", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>You no longer have access to {org.name}</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: "0 0 20px" }}>An admin of this organization removed your access. You can still use your other organizations.</p>
          <a href="/" style={{ color: "#fff", fontSize: 14 }}>← Back to your organizations</a>
        </div>
      </div>
    );
  }

  const isManager =
    membership?.role === "owner" || membership?.role === "admin" || profile.role === "admin";

  const [channelsResult, dmThreadsResult, memberRolesResult, allOrgsResult, settingsResult, orgRolesResult] = await Promise.all([
    supabase.from("channels").select("*").eq("org_id", org.id).order("name"),
    supabase
      .from("dm_threads")
      .select("*, participant_a_profile:profiles!dm_threads_participant_a_fkey(*), participant_b_profile:profiles!dm_threads_participant_b_fkey(*)")
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("org_member_roles").select("role_key").eq("org_id", org.id).eq("user_id", user.id),
    supabase.from("organizations").select("*").order("name"),
    supabase.from("org_settings").select("role_channels_enabled").eq("org_id", org.id).maybeSingle(),
    supabase.from("org_roles").select("key, label").eq("org_id", org.id).order("label"),
  ]);

  const channels = (channelsResult.data ?? []) as Channel[];
  const allOrgs = (allOrgsResult.data ?? []) as Organization[];
  const roleChannelsEnabled = settingsResult.data?.role_channels_enabled ?? true;
  const orgRoles = (orgRolesResult.data ?? []) as { key: string; label: string }[];

  // DMs are global (cross-org) — same shape the community layout builds.
  const threads = dmThreadsResult.data ?? [];
  const dmPartners: Profile[] = threads.map((thread) => {
    const isA = thread.participant_a === user.id;
    return isA
      ? (thread as unknown as Record<string, unknown>)["participant_b_profile"]
      : (thread as unknown as Record<string, unknown>)["participant_a_profile"];
  }).filter(Boolean) as Profile[];
  const dmThreadIds: Record<string, string> = Object.fromEntries(threads.map((thread) => {
    const partnerId = thread.participant_a === user.id ? thread.participant_b : thread.participant_a;
    return [partnerId, thread.id];
  }));
  const userCommunityRoles: string[] = (memberRolesResult.data ?? []).map((r) => r.role_key);

  return (
    <CommunityShell
      channels={channels}
      currentUser={profile}
      dmPartners={dmPartners}
      dmThreadIds={dmThreadIds}
      userCommunityRoles={userCommunityRoles}
      orgs={allOrgs}
      roleChannelsEnabled={roleChannelsEnabled}
      communityName={(org as Organization).name}
      logoUrl={(org as Organization).logo_url}
      basePath={`/org/${orgSlug}/channels`}
      adminPath={`/org/${orgSlug}/admin`}
      profilePath={`/org/${orgSlug}/profile`}
      orgId={org.id}
      canManage={isManager}
      showAdminLink={isManager}
      orgRoles={orgRoles}
    >
      {children}
    </CommunityShell>
  );
}
