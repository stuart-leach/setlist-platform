import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChannelView from "./ChannelView";
import type { Channel, MessageWithProfile } from "@/lib/supabase/types";

// Always fetch fresh — never serve a cached render for channel pages
export const dynamic = "force-dynamic";

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

  if (user) {
    const [channelResult, profileResult] = await Promise.all([
      supabase.from("channels").select("*").eq("slug", slug).single(),
      supabase.from("profiles").select("role, muted_until").eq("id", user.id).single(),
    ]);
    channel = channelResult.data;
    currentUserRole = profileResult.data?.role ?? "member";
    currentUserMutedUntil = profileResult.data?.muted_until ?? null;
  } else {
    channel = PREVIEW_CHANNELS.find((c) => c.slug === slug) ?? null;
  }

  if (!channel) notFound();

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
