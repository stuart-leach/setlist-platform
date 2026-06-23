"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "./UserAvatar";
import MessageInput from "./MessageInput";
import ModerationMenu from "./ModerationMenu";
import type { MessageWithProfile, MessageReplyWithProfile, Profile } from "@/lib/supabase/types";

interface ReplyReaction {
  id: string;
  reply_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

interface Props {
  parentMessage: MessageWithProfile;
  currentUserId: string;
  currentUserRole?: string;
  onClose: () => void;
  onReplyAdded: (parentId: string) => void;
  onProfileClick?: (profile: Profile) => void;
}

const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮"];
const GROUP_GAP_MS = 5 * 60 * 1000;

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays < 7) return `${d.toLocaleDateString([], { weekday: "long" })} ${timeStr}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export default function ThreadView({
  parentMessage,
  currentUserId,
  currentUserRole,
  onClose,
  onReplyAdded,
  onProfileClick,
}: Props) {
  const [replies, setReplies] = useState<MessageReplyWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactionMap, setReactionMap] = useState<Map<string, ReplyReaction[]>>(new Map());
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const isPreview = currentUserId === "preview-user-id";
  const canModerate = currentUserRole === "admin" || currentUserRole === "moderator";

  // ── Load replies + reactions ─────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      setReplies([]);
      setReactionMap(new Map());
      if (isPreview) { setLoading(false); return; }

      const { data } = await supabase
        .from("message_replies")
        .select("*, profiles(*)")
        .eq("parent_id", parentMessage.id)
        .order("created_at", { ascending: true });

      const list = (data as MessageReplyWithProfile[]) ?? [];
      setReplies(list);

      if (list.length > 0) {
        const { data: rxn } = await supabase
          .from("reply_reactions")
          .select("*")
          .in("reply_id", list.map((r) => r.id));
        if (rxn) {
          const map = new Map<string, ReplyReaction[]>();
          (rxn as ReplyReaction[]).forEach((r) => {
            map.set(r.reply_id, [...(map.get(r.reply_id) ?? []), r]);
          });
          setReactionMap(map);
        }
      }
      setLoading(false);
    }
    load();
  }, [parentMessage.id]);

  // ── Real-time: new replies ───────────────────────────────────────────────────
  useEffect(() => {
    if (isPreview) return;
    const sub = supabase
      .channel(`thread-${parentMessage.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_replies", filter: `parent_id=eq.${parentMessage.id}` },
        async (payload) => {
          const { data } = await supabase
            .from("message_replies").select("*, profiles(*)").eq("id", payload.new.id).single();
          if (data) {
            setReplies((prev) =>
              prev.some((r) => r.id === data.id) ? prev : [...prev, data as MessageReplyWithProfile]
            );
            setNewIds((prev) => new Set(prev).add(data.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [parentMessage.id]);

  // ── Real-time: reply reactions ───────────────────────────────────────────────
  useEffect(() => {
    if (isPreview) return;
    const sub = supabase
      .channel(`thread-rxn-${parentMessage.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reply_reactions" }, (payload) => {
        const r = payload.new as ReplyReaction;
        setReactionMap((prev) => {
          const existing = prev.get(r.reply_id) ?? [];
          if (existing.some((e) => e.id === r.id)) return prev;
          const next = new Map(prev);
          const cleaned = existing.filter(
            (e) => !(e.user_id === r.user_id && e.emoji === r.emoji && e.id.startsWith("opt-"))
          );
          next.set(r.reply_id, [...cleaned, r]);
          return next;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reply_reactions" }, (payload) => {
        const r = payload.old as ReplyReaction;
        setReactionMap((prev) => {
          const existing = prev.get(r.reply_id);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(r.reply_id, existing.filter((e) => e.id !== r.id));
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [parentMessage.id]);

  // ── Close picker on outside click ────────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!(e.target as Element).closest(".msg-emoji-wrap")) setPickerOpenId(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  // ── Toggle reaction ──────────────────────────────────────────────────────────
  async function toggleReaction(replyId: string, emoji: string) {
    const current = reactionMap.get(replyId) ?? [];
    const mine = current.find((r) => r.emoji === emoji && r.user_id === currentUserId);

    if (mine) {
      setReactionMap((prev) => {
        const next = new Map(prev);
        next.set(replyId, (next.get(replyId) ?? []).filter((r) => r.id !== mine.id));
        return next;
      });
      if (!isPreview) await supabase.from("reply_reactions").delete().eq("id", mine.id);
    } else {
      const tempId = `opt-${Date.now()}`;
      const optimistic: ReplyReaction = {
        id: tempId, reply_id: replyId, user_id: currentUserId, emoji, created_at: new Date().toISOString(),
      };
      setReactionMap((prev) => {
        const next = new Map(prev);
        next.set(replyId, [...(next.get(replyId) ?? []), optimistic]);
        return next;
      });
      if (!isPreview) {
        const { data, error } = await supabase
          .from("reply_reactions")
          .insert({ reply_id: replyId, user_id: currentUserId, emoji })
          .select().single();
        if (error) {
          setReactionMap((prev) => {
            const next = new Map(prev);
            next.set(replyId, (next.get(replyId) ?? []).filter((r) => r.id !== tempId));
            return next;
          });
        } else if (data) {
          setReactionMap((prev) => {
            const next = new Map(prev);
            next.set(replyId, (next.get(replyId) ?? []).map((r) => r.id === tempId ? (data as ReplyReaction) : r));
            return next;
          });
        }
      }
    }
  }

  // ── Delete reply ─────────────────────────────────────────────────────────────
  async function deleteReply(replyId: string) {
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
    if (!isPreview) await supabase.from("message_replies").delete().eq("id", replyId);
  }

  // ── Send reply ───────────────────────────────────────────────────────────────
  async function sendReply(content: string, optimisticMsg: MessageWithProfile) {
    const tempId = `opt-reply-${Date.now()}`;
    const optimistic: MessageReplyWithProfile = {
      id: tempId,
      parent_id: parentMessage.id,
      user_id: currentUserId,
      content: optimisticMsg.content,
      attachment_url: optimisticMsg.attachment_url ?? null,
      created_at: optimisticMsg.created_at,
      profiles: optimisticMsg.profiles,
    };
    setReplies((prev) => [...prev, optimistic]);
    setNewIds((prev) => new Set(prev).add(tempId));
    onReplyAdded(parentMessage.id);

    if (isPreview) return;

    const { data, error } = await supabase
      .from("message_replies")
      .insert({
        parent_id: parentMessage.id,
        user_id: currentUserId,
        content: optimisticMsg.content,
        attachment_url: optimisticMsg.attachment_url ?? null,
      })
      .select("*, profiles(*)")
      .single();

    if (error) {
      setReplies((prev) => prev.filter((r) => r.id !== tempId));
    } else if (data) {
      setReplies((prev) => prev.map((r) => r.id === tempId ? (data as MessageReplyWithProfile) : r));
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  let lastDateLabel = "";
  let lastUserId = "";
  let lastTimestamp = 0;

  const parentAuthor = parentMessage.profiles?.display_name ?? parentMessage.profiles?.username ?? "Unknown";

  return (
    <>
      <div className="thread-header">
        <span className="thread-header-label">Thread</span>
        <button className="thread-close-btn" onClick={onClose} aria-label="Close thread">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="thread-feed">
        {/* ── Parent message (quoted) ── */}
        <div className="thread-parent-msg">
          <div className="message-row">
            {onProfileClick ? (
              <button className="avatar-clickable" onClick={() => onProfileClick(parentMessage.profiles as Profile)} aria-label="View profile">
                <UserAvatar profile={parentMessage.profiles} size={32} />
              </button>
            ) : (
              <UserAvatar profile={parentMessage.profiles} size={32} />
            )}
            <div className="message-col">
              <div className="message-meta">
                <span className="message-author">{parentAuthor}</span>
                <span className="message-time">{formatTimestamp(parentMessage.created_at)}</span>
              </div>
              <div className="message-body">
                {parentMessage.content.trim() && (
                  <p className="message-content">{parentMessage.content}</p>
                )}
                {parentMessage.attachment_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={parentMessage.attachment_url} alt="attachment" className="message-attachment" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Replies divider ── */}
        <div className="thread-replies-divider">
          <div className="thread-replies-line" />
          <span className="thread-replies-label">
            {loading
              ? "Loading…"
              : replies.length === 0
              ? "No replies yet"
              : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
          </span>
          <div className="thread-replies-line" />
        </div>

        {/* ── Reply list ── */}
        {replies.map((reply) => {
          const isOwnMessage = reply.user_id === currentUserId;
          const replyDate = new Date(reply.created_at);
          const dateLabel = formatDateLabel(reply.created_at);
          const showDate = dateLabel !== lastDateLabel;
          const timeDiff = replyDate.getTime() - lastTimestamp;
          const isGrouped = !showDate && reply.user_id === lastUserId && timeDiff < GROUP_GAP_MS;
          const isNew = newIds.has(reply.id);

          lastDateLabel = dateLabel;
          lastUserId = reply.user_id;
          lastTimestamp = replyDate.getTime();

          const reactions = reactionMap.get(reply.id) ?? [];
          const reactionGroups = new Map<string, { count: number; mine: boolean }>();
          reactions.forEach((r) => {
            const g = reactionGroups.get(r.emoji) ?? { count: 0, mine: false };
            reactionGroups.set(r.emoji, { count: g.count + 1, mine: g.mine || r.user_id === currentUserId });
          });

          const profile = reply.profiles as Profile;

          return (
            <div key={reply.id}>
              {showDate && (
                <div className="date-divider">
                  <div className="date-divider-line" />
                  <span className="date-divider-label">{dateLabel}</span>
                  <div className="date-divider-line" />
                </div>
              )}
              <div id={`msg-${reply.id}`} className={`message-row-wrap${isOwnMessage ? " own-message" : ""}${isGrouped ? " grouped" : ""}${pickerOpenId === reply.id ? " picker-open" : ""}`}>
                <div className={`message-row${isNew ? " message-entering" : ""}`}>
                  {isGrouped ? (
                    isOwnMessage ? null : <div className="avatar-spacer" />
                  ) : onProfileClick ? (
                    <button className="avatar-clickable" onClick={() => onProfileClick(profile)} aria-label="View profile">
                      <UserAvatar profile={profile} size={32} />
                    </button>
                  ) : (
                    <UserAvatar profile={profile} size={32} />
                  )}

                  <div className="message-col">
                    {!isGrouped && (
                      <div className="message-meta">
                        <span className="message-author">{profile.display_name ?? profile.username}</span>
                        <span className="message-time">{formatTimestamp(reply.created_at)}</span>
                      </div>
                    )}

                    <div className={`message-body${isGrouped ? " grouped" : ""}`}>
                      {/* Reaction chips */}
                      {reactionGroups.size > 0 && (
                        <div className="message-reactions">
                          {Array.from(reactionGroups.entries()).map(([emoji, { count, mine }]) => (
                            <button
                              key={emoji}
                              className={`reaction-chip${mine ? " mine" : ""}`}
                              onClick={() => toggleReaction(reply.id, emoji)}
                            >
                              {emoji}{count > 1 && <span className="reaction-count">{count}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {reply.content.trim() && <p className="message-content">{reply.content}</p>}
                      {reply.attachment_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={reply.attachment_url} alt="attachment" className="message-attachment" />
                      )}

                      {/* Hover action bar */}
                      <div className="msg-actions">
                        <div className="msg-emoji-wrap">
                          <button
                            className="msg-action-btn"
                            onClick={() => setPickerOpenId(pickerOpenId === reply.id ? null : reply.id)}
                            aria-label="Add reaction"
                            title="Add reaction"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M5.5 9.5C5.5 9.5 6.5 11 8 11C9.5 11 10.5 9.5 10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <circle cx="6" cy="6.5" r="0.8" fill="currentColor"/>
                              <circle cx="10" cy="6.5" r="0.8" fill="currentColor"/>
                            </svg>
                          </button>
                          {pickerOpenId === reply.id && (
                            <div className="reaction-picker">
                              {REACTION_EMOJIS.map((e) => (
                                <button
                                  key={e}
                                  className="reaction-pick-btn"
                                  onClick={() => { toggleReaction(reply.id, e); setPickerOpenId(null); }}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <ModerationMenu
                          messageId={reply.id}
                          targetUserId={reply.user_id}
                          targetUsername={profile.display_name ?? profile.username}
                          currentUserId={currentUserId}
                          currentUserRole={currentUserRole ?? "member"}
                          isOwnMessage={isOwnMessage}
                          onDeleteMessage={() => deleteReply(reply.id)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <MessageInput
        placeholder="Reply in thread…"
        currentUserId={currentUserId}
        onSend={sendReply}
      />
    </>
  );
}
