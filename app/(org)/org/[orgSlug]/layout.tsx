import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrgShell from "@/components/OrgShell";
import type { Organization, Channel } from "@/lib/supabase/types";

interface Props {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.is_banned) redirect("/channels/general");

  // Fetch this org + verify user is a member (or platform admin)
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/channels/general");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();

  // Non-members who aren't platform admins get bounced
  if (!membership && profile.role !== "admin") redirect("/channels/general");

  // Fetch org channels + member count + all user orgs for switcher
  const [channelsResult, memberCountResult, allOrgsResult] = await Promise.all([
    supabase
      .from("channels")
      .select("*")
      .eq("org_id", org.id)
      .order("name"),
    supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id),
    supabase
      .from("organizations")
      .select("*")
      .order("name"),
  ]);

  const channels = (channelsResult.data ?? []) as Channel[];
  const memberCount = memberCountResult.count ?? 0;
  const allOrgs = (allOrgsResult.data ?? []) as Organization[];

  return (
    <OrgShell
      org={org as Organization}
      channels={channels}
      currentUser={profile}
      allOrgs={allOrgs}
      memberCount={memberCount}
    >
      {children}
    </OrgShell>
  );
}
