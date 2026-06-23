"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import MessageFeed from "@/components/MessageFeed";
import MessageInput from "@/components/MessageInput";
import UserAvatar from "@/components/UserAvatar";
import UserProfileModal from "@/components/UserProfileModal";
import DmSearch from "@/components/DmSearch";
import type { Profile, DmThread, DmMessageWithProfile, MessageWithProfile, DmMessageReaction } from "@/lib/supabase/types";

// Treat DmMessageReaction like MessageReaction for the shared reactionMap type
import type { MessageReaction } from "@/lib/supabase/types";

interface Props {
  thread: DmThread;
  partner: Profile;
  initialMessages: DmMessageWithProfile[];
  currentUserId: string;
  currentUserMutedUntil?: string | null;
}

function buildReactionMap(msgs: DmMessageWithProfile[]): Map<string, MessageReaction[]> {
  return new Map(); // reactions fetched separately on mount
}

export default function DmView({ thread, partner, initialMessages, currentUserId, currentUserMutedUntil }: Props) {
  const [messages, setMessages] = useState<DmMessageWithProfile[]>(initialMessages);
  const [reactionMap, setReactionMap] = useState<Map<string, MessageReaction[]>>(new Map());
  const [profileModalUser, setProfileModalUser] = useState<Profile | null>(null);
  const supabase = createClient();
  const isFake = thread.id.startsWith("fake-thread-");

  // Reset on thread change and immediately fetch fresh messages
  useEffect(() => {
    setMessages(initialMessages);
    setReactionMap(new Map());
    if (isFake) return;
    supabase
      .from("dm_messages")
      .select("*, profiles(*)")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) setMessages(data as DmMessageWithProfile[]);
      });
  }, [thread.id]);

  // Load initial reactions
  useEffect(() => {
    if (isFake || initialMessages.length === 0) return;
    supabase
      .from("dm_message_reactions")
      .select("*")
      .in("message_id", initialMessages.map((m) => m.id))
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, MessageReaction[]>();
        (data as DmMessageReaction[]).forEach((r) => {
          const key = r.message_id;
          map.set(key, [...(map.get(key) ?? []), r as unknown as MessageReaction]);
        });
        setReactionMap(map);
      });
  }, [thread.id]);

  // Realtime: new DM messages
  useEffect(() => {
    if (isFake) return;
    const sub = supabase
      .channel(`dm-${thread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${thread.id}` },
        async (payload) => {
          const { data } = await supabase
            .from("dm_messages").select("*, profiles(*)").eq("id", payload.new.id).single();
          if (data) {
            setMessages((prev) =>
              prev.some((m) => m.id === data.id)
                ? prev.map((m) => (m.id === data.id ? (data as DmMessageWithProfile) : m))
                : [...prev, data as DmMessageWithProfile]
            );
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [thread.id, isFake]);

  // Realtime: DM reactions
  useEffect(() => {
    if (isFake) return;
    const sub = supabase
      .channel(`dm-rxn-${thread.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_message_reactions" }, (payload) => {
        const r = payload.new as DmMessageReaction;
        setReactionMap((prev) => {
          const existing = prev.get(r.message_id) ?? [];
          if (existing.some((e) => e.id === r.id)) return prev;
          const next = new Map(prev);
          const cleaned = existing.filter(
            (e) => !(e.user_id === r.user_id && e.emoji === r.emoji && e.id.startsWith("opt-"))
          );
          next.set(r.message_id, [...cleaned, r as unknown as MessageReaction]);
          return next;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "dm_message_reactions" }, (payload) => {
        const r = payload.old as DmMessageReaction;
        setReactionMap((prev) => {
          const existing = prev.get(r.message_id);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(r.message_id, existing.filter((e) => e.id !== r.id));
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [thread.id, isFake]);

  async function sendMessage(content: string, optimisticMsg: MessageWithProfile) {
    setMessages((prev) => [...prev, optimisticMsg as unknown as DmMessageWithProfile]);
    if (isFake) return;

    const { data, error } = await supabase.from("dm_messages").insert({
      thread_id: thread.id,
      sender_id: currentUserId,
      content,
    }).select("*, profiles(*)").single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      alert(`Message failed: ${error.message}`);
    } else if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMsg.id ? (data as DmMessageWithProfile) : m))
      );
    }
  }

  async function deleteMessage(messageId: string) {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    if (!isFake) await supabase.from("dm_messages").delete().eq("id", messageId);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const current = reactionMap.get(messageId) ?? [];
    const mine = current.find((r) => r.emoji === emoji && r.user_id === currentUserId);

    if (mine) {
      setReactionMap((prev) => {
        const next = new Map(prev);
        next.set(messageId, (next.get(messageId) ?? []).filter((r) => r.id !== mine.id));
        return next;
      });
      if (!isFake) await supabase.from("dm_message_reactions").delete().eq("id", mine.id);
    } else {
      const tempId = `opt-${Date.now()}`;
      const optimistic: MessageReaction = {
        id: tempId, message_id: messageId, user_id: currentUserId, emoji, created_at: new Date().toISOString(),
      };
      setReactionMap((prev) => {
        const next = new Map(prev);
        next.set(messageId, [...(next.get(messageId) ?? []), optimistic]);
        return next;
      });
      if (!isFake) {
        const { data, error } = await supabase
          .from("dm_message_reactions")
          .insert({ message_id: messageId, user_id: currentUserId, emoji })
          .select().single();
        if (error) {
          setReactionMap((prev) => {
            const next = new Map(prev);
            next.set(messageId, (next.get(messageId) ?? []).filter((r) => r.id !== tempId));
            return next;
          });
        } else if (data) {
          setReactionMap((prev) => {
            const next = new Map(prev);
            next.set(messageId, (next.get(messageId) ?? []).map(
              (r) => r.id === tempId ? (data as unknown as MessageReaction) : r
            ));
            return next;
          });
        }
      }
    }
  }

  return (
    <div className="channel-shell">
      <div className="channel-main">
        <div className="channel-header">
          <Link href="/dm" className="dm-back-btn" title="Back to messages" aria-label="Back to messages">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div className="channel-divider" />
          <UserAvatar profile={partner} size={22} />
          <h1 className="channel-title" style={{ textTransform: "none", letterSpacing: "0.02em", fontSize: 16, flex: 1 }}>
            {partner.display_name ?? partner.username}
          </h1>
          <div className="channel-header-actions">
            <DmSearch threadId={thread.id} partnerName={partner.display_name ?? partner.username} />
          </div>
        </div>

        <MessageFeed
          messages={messages}
          currentUserId={currentUserId}
          onProfileClick={setProfileModalUser}
          reactionMap={reactionMap}
          onToggleReaction={toggleReaction}
          onDeleteMessage={deleteMessage}
          currentUserRole="member"
          hideReport={true}
        />

        <MessageInput
          placeholder={`Message ${partner.display_name ?? partner.username}`}
          currentUserId={currentUserId}
          onSend={sendMessage}
          mutedUntil={currentUserMutedUntil}
        />

        {profileModalUser && (
          <UserProfileModal
            user={profileModalUser}
            currentUserId={currentUserId}
            currentUserRole="member"
            onClose={() => setProfileModalUser(null)}
          />
        )}
      </div>
    </div>
  );
}
