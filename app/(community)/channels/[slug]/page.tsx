import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChannelView from "./ChannelView";
import type { Channel, MessageWithProfile } from "@/lib/supabase/types";

// Always fetch fresh — never serve a cached render for channel pages
export const dynamic = "force-dynamic";

const PREVIEW_CHANNELS: Channel[] = [
  { id: "0",  slug: "rules",                name: "Rules",                description: "Community rules",            created_at: "", required_role: null,              pinned_message_id: null, locked: true,  org_id: null, channel_type: "system"  },
  { id: "1",  slug: "general",              name: "General",              description: "General discussion",         created_at: "", required_role: null,              pinned_message_id: null, locked: false, org_id: null, channel_type: "general" },
  { id: "2",  slug: "announcements",        name: "Announcements",        description: "Product updates",            created_at: "", required_role: null,              pinned_message_id: null, locked: false, org_id: null, channel_type: "general" },
  { id: "6",  slug: "worship-leaders",      name: "Worship Leaders",      description: "For worship leaders",        created_at: "", required_role: ["worship_leader"],       pinned_message_id: null, locked: false, org_id: null, channel_type: "role" },
  { id: "7",  slug: "band-members",         name: "Band Members",         description: "For band members",           created_at: "", required_role: ["band_member"],          pinned_message_id: null, locked: false, org_id: null, channel_type: "role" },
  { id: "8",  slug: "vocalists",            name: "Vocalists",            description: "For vocalists and singers",  created_at: "", required_role: ["vocalist"],             pinned_message_id: null, locked: false, org_id: null, channel_type: "role" },
  { id: "9",  slug: "music-directors",      name: "Music Directors",      description: "For music directors",        created_at: "", required_role: ["music_director"],       pinned_message_id: null, locked: false, org_id: null, channel_type: "role" },
  { id: "10", slug: "production-directors", name: "Production Directors", description: "For production directors",   created_at: "", required_role: ["production_director"],  pinned_message_id: null, locked: false, org_id: null, channel_type: "role" },
];

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ChannelPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let channel: Channel | null = null;
  let currentUserRole = "admin"; // preview mode default
  let currentUserMutedUntil: string | null = null;
  let roleChannelsEnabled = true;

  if (user) {
    const [channelResult, profileResult, settingsResult] = await Promise.all([
      supabase.from("channels").select("*").eq("slug", slug).single(),
      supabase.from("profiles").select("role, muted_until").eq("id", user.id).single(),
      supabase.from("community_settings").select("role_channels_enabled").maybeSingle(),
    ]);
    channel = channelResult.data;
    currentUserRole = profileResult.data?.role ?? "member";
    currentUserMutedUntil = profileResult.data?.muted_until ?? null;
    roleChannelsEnabled = settingsResult.data?.role_channels_enabled ?? true;
  } else {
    channel = PREVIEW_CHANNELS.find((c) => c.slug === slug) ?? null;
  }

  if (!channel) notFound();

  // When an admin has disabled role channels, their pages are blocked too.
  const isRoleChannel = channel.channel_type === "role" || (channel.required_role?.length ?? 0) > 0;
  if (isRoleChannel && !roleChannelsEnabled) notFound();

  const { data: messages } = user
    ? await supabase
        .from("messages")
        .select("*, profiles(*), message_reactions(*), message_replies(id)")
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: [] };

  // Fetch pinned message if set
  let pinnedMessage: MessageWithProfile | null = null;
  if (user && channel.pinned_message_id) {
    const { data } = await supabase
      .from("messages")
      .select("*, profiles(*), message_reactions(*)")
      .eq("id", channel.pinned_message_id)
      .single();
    pinnedMessage = data ? (data as MessageWithProfile) : null;
  }

  return (
    <ChannelView
      channel={channel}
      initialMessages={messages ?? []}
      currentUserId={user?.id ?? "preview-user-id"}
      currentUserRole={currentUserRole}
      initialPinnedMessage={pinnedMessage}
      currentUserMutedUntil={currentUserMutedUntil}
    />
  );
}
