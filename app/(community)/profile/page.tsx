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
  let initialCommunityRoles: string[] = [];

  if (user) {
    const [profileResult, communityRolesResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("community_roles").select("role").eq("user_id", user.id),
    ]);
    if (profileResult.data) profile = profileResult.data;
    initialCommunityRoles = (communityRolesResult.data ?? []).map((r) => r.role);
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
          initialCommunityRoles={initialCommunityRoles}
          authEmail={user?.email ?? null}
        />
      </div>
    </div>
  );
}
