import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CommunityShell from "@/components/CommunityShell";
import IntercomProvider from "@/components/IntercomProvider";
import AnonymousAuthProvider from "@/components/AnonymousAuthProvider";
import { FAKE_USERS } from "@/lib/preview-data";
import type { Profile, Channel, Organization } from "@/lib/supabase/types";

const PREVIEW_USER: Profile = {
  id: "preview-user-id",
  username: "preview",
  display_name: "You",
  avatar_url: null,
  intercom_id: null,
  bio: null,
  location: null,
  job_title: null,
  created_at: "",
  role: "admin",
  is_banned: false,
  muted_until: null,
  admin_note: null,
  mt_account_link: null,
};

const PREVIEW_CHANNELS: Channel[] = [
  { id: "0",  slug: "rules",                name: "Rules",                description: "Community rules",            created_at: "", required_role: null,              pinned_message_id: null, locked: true  },
  { id: "1",  slug: "general",              name: "General",              description: "General discussion",         created_at: "", required_role: null,              pinned_message_id: null, locked: false },
  { id: "2",  slug: "announcements",        name: "Announcements",        description: "Product updates",            created_at: "", required_role: null,              pinned_message_id: null, locked: false },
  { id: "3",  slug: "playback",             name: "Playback",             description: "Playback discussion",        created_at: "", required_role: null,              pinned_message_id: null, locked: false },
  { id: "4",  slug: "chart-builder",        name: "ChartBuilder",         description: "ChartBuilder tips",         created_at: "", required_role: null,              pinned_message_id: null, locked: false },
  { id: "5",  slug: "help",                 name: "Support",              description: "Get help",                   created_at: "", required_role: null,              pinned_message_id: null, locked: false },
  { id: "6",  slug: "worship-leaders",      name: "Worship Leaders",      description: "For worship leaders",        created_at: "", required_role: ["worship_leader"],       pinned_message_id: null, locked: false },
  { id: "7",  slug: "band-members",         name: "Band Members",         description: "For band members",           created_at: "", required_role: ["band_member"],          pinned_message_id: null, locked: false },
  { id: "8",  slug: "vocalists",            name: "Vocalists",            description: "For vocalists and singers",  created_at: "", required_role: ["vocalist"],             pinned_message_id: null, locked: false },
  { id: "9",  slug: "music-directors",      name: "Music Directors",      description: "For music directors",        created_at: "", required_role: ["music_director"],       pinned_message_id: null, locked: false },
  { id: "10", slug: "production-directors", name: "Production Directors", description: "For production directors",   created_at: "", required_role: ["production_director"],  pinned_message_id: null, locked: false },
];

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated users must log in first
  if (!user) redirect("/auth/login");

  const [channelsResult, profileResult, dmThreadsResult, communityRolesResult, orgsResult] = await Promise.all([
    // Filter to community-only channels (org_id IS NULL). If migration 019 hasn't run yet
    // and the org_id column doesn't exist, fall back to fetching all channels.
    supabase.from("channels").select("*").is("org_id", null).order("name")
      .then(async (res) => res.error ? supabase.from("channels").select("*").order("name") : res),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("dm_threads")
      .select("*, participant_a_profile:profiles!dm_threads_participant_a_fkey(*), participant_b_profile:profiles!dm_threads_participant_b_fkey(*)")
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("community_roles").select("role").eq("user_id", user.id),
    supabase.from("organizations").select("*").order("name"),
  ]);

  const channels = channelsResult.data ?? PREVIEW_CHANNELS;
  const currentUser = profileResult.data ?? { ...PREVIEW_USER, id: user.id, username: `user_${user.id.slice(0, 8)}`, display_name: null };

  // Banned users can only reach the appeal page
  if (currentUser.is_banned) redirect("/banned");

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
  const userCommunityRoles: string[] = (communityRolesResult.data ?? []).map((r) => r.role);
  const userOrgs: Organization[] = (orgsResult.data ?? []) as Organization[];

  return (
    <AnonymousAuthProvider
      userId={user.id}
      displayName={currentUser.display_name ?? null}
      hasRoles={userCommunityRoles.length > 0}
    >
      <CommunityShell channels={channels} currentUser={currentUser} dmPartners={dmPartners} dmThreadIds={dmThreadIds} userCommunityRoles={userCommunityRoles} orgs={userOrgs}>
        {children}
      </CommunityShell>
      <IntercomProvider
        appId={process.env.NEXT_PUBLIC_INTERCOM_APP_ID ?? ""}
        userId={user?.id ?? ""}
        email={user?.email ?? ""}
        name={currentUser.display_name ?? currentUser.username}
      />
    </AnonymousAuthProvider>
  );
}
