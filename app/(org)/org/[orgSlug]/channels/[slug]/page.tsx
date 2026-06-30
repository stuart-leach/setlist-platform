import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChannelView from "@/app/(community)/channels/[slug]/ChannelView";
import type { MessageWithProfile } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ orgSlug: string; slug: string }>;
}

export default async function OrgChannelPage({ params }: Props) {
  const { orgSlug, slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Fetch org + channel together
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) notFound();

  const [channelResult, profileResult, membershipResult] = await Promise.all([
    supabase.from("channels").select("*").eq("slug", slug).eq("org_id", org.id).single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("organization_members").select("role, muted_until").eq("org_id", org.id).eq("user_id", user.id).maybeSingle(),
  ]);

  const channel = channelResult.data;
  if (!channel) notFound();

  // Posting permission uses the org membership role; mute is per-org.
  const currentUserRole = membershipResult.data?.role === "owner" || membershipResult.data?.role === "admin"
    ? "admin"
    : (profileResult.data?.role ?? "member");
  const currentUserMutedUntil = membershipResult.data?.muted_until ?? null;

  const { data: messages } = await supabase
    .from("messages")
    .select("*, profiles(*), message_reactions(*), message_replies(id)")
    .eq("channel_id", channel.id)
    .order("created_at", { ascending: true })
    .limit(100);

  let pinnedMessage: MessageWithProfile | null = null;
  if (channel.pinned_message_id) {
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
      currentUserId={user.id}
      currentUserRole={currentUserRole}
      initialPinnedMessage={pinnedMessage}
      currentUserMutedUntil={currentUserMutedUntil}
      basePath={`/org/${orgSlug}/channels`}
      deleteFallback={`/org/${orgSlug}`}
    />
  );
}
