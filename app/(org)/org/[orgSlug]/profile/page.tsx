import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "@/app/(community)/profile/ProfileForm";
import type { Profile } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function OrgProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [profileResult, membershipsResult, assignmentsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("organization_members")
      .select("org_id, organizations(id, name)")
      .eq("user_id", user.id).eq("is_banned", false),
    supabase.from("org_member_roles").select("org_id, role_key").eq("user_id", user.id),
  ]);

  const profile = (profileResult.data ?? {}) as Profile;
  const memberships = membershipsResult.data ?? [];
  const orgIds = memberships.map((m) => m.org_id);

  const assignedByOrg = new Map<string, string[]>();
  for (const a of assignmentsResult.data ?? []) {
    assignedByOrg.set(a.org_id, [...(assignedByOrg.get(a.org_id) ?? []), a.role_key]);
  }

  const rolesByOrg = new Map<string, { key: string; label: string }[]>();
  if (orgIds.length) {
    const { data: roleRows } = await supabase.from("org_roles").select("org_id, key, label").in("org_id", orgIds).order("label");
    for (const r of roleRows ?? []) {
      rolesByOrg.set(r.org_id, [...(rolesByOrg.get(r.org_id) ?? []), { key: r.key, label: r.label }]);
    }
  }

  const orgRoleData = memberships.map((m) => ({
    orgId: m.org_id,
    orgName: (m as any).organizations?.name ?? "Organization",
    roles: rolesByOrg.get(m.org_id) ?? [],
    assigned: assignedByOrg.get(m.org_id) ?? [],
  }));

  return (
    <div className="profile-page">
      <div className="profile-inner">
        <h1 className="profile-heading">Your Profile</h1>
        <ProfileForm profile={profile} isPreview={false} orgRoleData={orgRoleData} authEmail={user.email ?? null} />
      </div>
    </div>
  );
}
