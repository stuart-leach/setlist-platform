import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FAKE_USERS, FAKE_DM_CONVERSATIONS } from "@/lib/preview-data";
import DmView from "./DmView";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function DmPage({ params }: Props) {
  const { userId: partnerId } = await params;

  // Preview mode: serve fake conversations without auth
  if (partnerId.startsWith("fake-")) {
    const partner = FAKE_USERS.find((u) => u.id === partnerId);
    if (!partner) notFound();
    const fakeThread = { id: `fake-thread-${partnerId}`, participant_a: "preview-user-id", participant_b: partnerId, created_at: "" };
    const fakeMessages = FAKE_DM_CONVERSATIONS[partnerId] ?? [];
    return (
      <DmView
        thread={fakeThread}
        partner={partner}
        initialMessages={fakeMessages}
        currentUserId="preview-user-id"
      />
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("muted_until")
    .eq("id", user.id)
    .single();
  const currentUserMutedUntil = currentProfile?.muted_until ?? null;

  if (partnerId === user.id) notFound();

  const { data: partner } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", partnerId)
    .single();

  if (!partner) notFound();

  // participant_a must be the lesser UUID (enforced by DB constraint)
  const [pA, pB] =
    user.id < partnerId ? [user.id, partnerId] : [partnerId, user.id];

  // Find or create thread (upsert can return null on conflict, so select first)
  let { data: thread } = await supabase
    .from("dm_threads")
    .select()
    .eq("participant_a", pA)
    .eq("participant_b", pB)
    .maybeSingle();

  if (!thread) {
    const { data: newThread } = await supabase
      .from("dm_threads")
      .insert({ participant_a: pA, participant_b: pB })
      .select()
      .single();
    thread = newThread;
  }

  if (!thread) notFound();

  const { data: messages } = await supabase
    .from("dm_messages")
    .select("*, profiles(*)")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(100);

  return (
    <DmView
      thread={thread}
      partner={partner}
      initialMessages={messages ?? []}
      currentUserId={user.id}
      currentUserMutedUntil={currentUserMutedUntil}
    />
  );
}
