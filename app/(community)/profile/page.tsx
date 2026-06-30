import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";
import type { Profile } from "@/lib/supabase/types";

const PREVIEW_PROFILE: Profile = {
  id: "preview-user-id",
  username: "preview",
  display_name: "",
  avatar_url: null,
  intercom_id: null,
  bio: "",
  location: "",
  job_title: "",
  created_at: "",
  role: "member",
  is_banned: false,
  muted_until: null,
  admin_note: null,
  mt_account_link: null,
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: Profile = PREVIEW_PROFILE;
  // Roles grouped by the orgs the user belongs to (the single, app-wide role system).
  let orgRoleData: { orgId: string; orgName: string; roles: { key: string; label: string }[]; assigned: string[] }[] = [];

  if (user) {
    const [profileResult, membershipsResult, assignmentsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("organization_members")
        .select("org_id, organizations(id, name)")
        .eq("user_id", user.id).eq("is_banned", false),
      supabase.from("org_member_roles").select("org_id, role_key").eq("user_id", user.id),
    ]);
    if (profileResult.data) profile = profileResult.data;

    const memberships = membershipsResult.data ?? [];
    const orgIds = memberships.map((m) => m.org_id);
    const assignedByOrg = new Map<string, string[]>();
    for (const a of assignmentsResult.data ?? []) {
      assignedByOrg.set(a.org_id, [...(assignedByOrg.get(a.org_id) ?? []), a.role_key]);
    }

    let rolesByOrg = new Map<string, { key: string; label: string }[]>();
    if (orgIds.length) {
      const { data: roleRows } = await supabase.from("org_roles").select("org_id, key, label").in("org_id", orgIds).order("label");
      for (const r of roleRows ?? []) {
        rolesByOrg.set(r.org_id, [...(rolesByOrg.get(r.org_id) ?? []), { key: r.key, label: r.label }]);
      }
    }

    orgRoleData = memberships.map((m) => ({
      orgId: m.org_id,
      orgName: (m as any).organizations?.name ?? "Organization",
      roles: rolesByOrg.get(m.org_id) ?? [],
      assigned: assignedByOrg.get(m.org_id) ?? [],
    }));
  }

  return (
    <div className="profile-page">
      <div className="profile-inner">
        <h1 className="profile-heading">Your Profile</h1>
        {!user && (
          <div className="profile-notice">
            Sign in to save your profile. Changes are shown as a preview only.
          </div>
        )}
        <ProfileForm
          profile={profile}
          isPreview={!user}
          orgRoleData={orgRoleData}
          authEmail={user?.email ?? null}
        />
      </div>
    </div>
  );
}
