"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import UserAvatar from "./UserAvatar";
import ModerationMenu from "./ModerationMenu";
import type { MessageWithProfile, DmMessageWithProfile, MessageReaction, Profile } from "@/lib/supabase/types";

// Parse mention/channel tokens and render styled chips
function parseContent(content: string, currentUserId: string): React.ReactNode[] {
  const regex = /@\[([^\]]+)\]\(([^)]+)\)|#\[([^\]]+)\]\(([^)]+)\)|@everyone/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    if (match[0] === "@everyone") {
      parts.push(<span key={key++} className="mention mention--everyone">@everyone</span>);
    } else if (match[0].startsWith("@")) {
      const isSelf = match[2] === currentUserId;
      parts.push(
        <span key={key++} className={`mention${isSelf ? " mention--self" : ""}`}>
          @{match[1]}
        </span>
      );
    } else {
      parts.push(
        <Link key={key++} href={`/channels/${match[4]}`} className="channel-mention">
          #{match[3]}
        </Link>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [content];
}

type AnyMessage = (MessageWithProfile | DmMessageWithProfile) & { optimistic?: boolean };

const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮"];

interface Props {
  messages: AnyMessage[];
  currentUserId: string;
  newIds?: Set<string>;
  onOpenThread?: (msg: MessageWithProfile) => void;
  replyCountMap?: Map<string, number>;
  currentUserRole?: string;
  onDeleteMessage?: (messageId: string) => void;
  onProfileClick?: (profile: Profile) => void;
  reactionMap: Map<string, MessageReaction[]>;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onPinMessage?: (messageId: string) => void;
  pinnedMessageId?: string | null;
  onScroll?: (scrollTop: number) => void;
  hideReport?: boolean;
}

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (diffDays < 7) {
    const day = d.toLocaleDateString([], { weekday: "long" });
    return `${day} ${timeStr}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export default function MessageFeed({ messages, currentUserId, newIds, onOpenThread, replyCountMap, currentUserRole, onDeleteMessage, onProfileClick, reactionMap, onToggleReaction, onPinMessage, pinnedMessageId, onScroll, hideReport }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);

  // Close emoji picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Element;
      if (!t.closest(".msg-emoji-wrap")) setPickerOpenId(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="feed" onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}>
        <div className="feed-empty">No messages yet — say hello!</div>
      </div>
    );
  }

  const canModerate = currentUserRole === "admin" || currentUserRole === "moderator";
  let lastDate = "";

  return (
    <div className="feed" onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}>
      {messages.map((msg, index) => {
        const dateLabel = formatDate(msg.created_at);
        const showDate = dateLabel !== lastDate;
        if (showDate) lastDate = dateLabel;
        const isNew = newIds?.has(msg.id);
        const reactions = reactionMap.get(msg.id) ?? [];
        const attachmentUrl = (msg as MessageWithProfile).attachment_url;
        const replyCount = replyCountMap?.get(msg.id) ?? 0;
        const isChannelMsg = "channel_id" in msg;
        const msgUserId = isChannelMsg ? (msg as MessageWithProfile).user_id : (msg as DmMessageWithProfile).sender_id;
        const isOwnMessage = msgUserId === currentUserId;
        const authorRole = (msg.profiles as { role?: string }).role ?? "member";
        const authorMutedUntil = (msg.profiles as { muted_until?: string | null }).muted_until ?? null;
        const isMuted = authorMutedUntil ? new Date(authorMutedUntil) > new Date() : false;
        const showTrash = onDeleteMessage && (canModerate || isOwnMessage);
        const showShield = onDeleteMessage && canModerate && !isOwnMessage;
        const isPreviewUser = currentUserId === "preview-user-id" || currentUserId.startsWith("preview");
        const showReportBtn = !hideReport && !isOwnMessage && !isPreviewUser;
        const showMenu = showTrash || showShield || showReportBtn;

        // Message grouping: same sender, no date break
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const prevSenderId = prevMsg
          ? ("channel_id" in prevMsg
              ? (prevMsg as MessageWithProfile).user_id
              : (prevMsg as DmMessageWithProfile).sender_id)
          : null;
        const isGrouped = !showDate && prevSenderId === msgUserId;

        // Group reactions: emoji → { count, mine }
        const reactionGroups = new Map<string, { count: number; mine: boolean }>();
        reactions.forEach((r) => {
          const g = reactionGroups.get(r.emoji) ?? { count: 0, mine: false };
          reactionGroups.set(r.emoji, { count: g.count + 1, mine: g.mine || r.user_id === currentUserId });
        });

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="date-divider">
                <div className="date-divider-line" />
                <span className="date-divider-label">{dateLabel}</span>
                <div className="date-divider-line" />
              </div>
            )}
            <div id={`msg-${msg.id}`} className={`message-row-wrap${msg.optimistic ? " optimistic" : ""}${isOwnMessage ? " own-message" : ""}${isGrouped ? " grouped" : ""}${pickerOpenId === msg.id ? " picker-open" : ""}`}>
              <div className={`message-row${isNew ? " message-entering" : ""}`}>
                {isGrouped ? (
                  isOwnMessage ? null : <div className="avatar-spacer" />
                ) : onProfileClick ? (
                  <button className="avatar-clickable" onClick={() => onProfileClick(msg.profiles as Profile)} aria-label="View profile">
                    <UserAvatar profile={msg.profiles} size={32} />
                  </button>
                ) : (
                  <UserAvatar profile={msg.profiles} size={32} />
                )}
                <div className="message-col">
                  {!isGrouped && (
                    <div className="message-meta">
                      {onProfileClick ? (
                        <button
                          className={`message-author message-author-btn${authorRole === "admin" ? " message-author-admin" : ""}`}
                          onClick={() => onProfileClick(msg.profiles as Profile)}
                        >
                          {msg.profiles.display_name ?? msg.profiles.username}
                        </button>
                      ) : (
                        <span className={`message-author${authorRole === "admin" ? " message-author-admin" : ""}`}>
                          {msg.profiles.display_name ?? msg.profiles.username}
                        </span>
                      )}
                      {authorRole === "admin" && (
                        <svg className="admin-shield" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-label="Admin">
                          <path d="M8 1.5L2 4v4c0 3.31 2.58 6.41 6 7 3.42-.59 6-3.69 6-7V4L8 1.5Z" fill="currentColor"/>
                        </svg>
                      )}
                      {authorRole === "moderator" && (
                        <span className="role-badge role-badge-mod">Mod</span>
                      )}
                      {isMuted && canModerate && (
                        <span className="muted-indicator">🔇</span>
                      )}
                      <span className="message-time">{formatTimestamp(msg.created_at)}</span>
                    </div>
                  )}
                  <div className={`message-body${isGrouped ? " grouped" : ""}`}>
                    {/* Reactions — float above the top corner of the bubble */}
                    {reactionGroups.size > 0 && (
                      <div className="message-reactions">
                        {Array.from(reactionGroups.entries()).map(([emoji, { count, mine }]) => (
                          <button
                            key={emoji}
                            className={`reaction-chip${mine ? " mine" : ""}`}
                            onClick={() => onToggleReaction(msg.id, emoji)}
                          >
                            {emoji}{count > 1 && <span className="reaction-count">{count}</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {msg.content.trim() && <p className="message-content">{parseContent(msg.content, currentUserId)}</p>}
                    {attachmentUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={attachmentUrl} alt="attachment" className="message-attachment" />
                    )}

                    {/* Action bar — emoji + reply + moderation, centred beside the bubble */}
                    <div className="msg-actions">
                      <div className="msg-emoji-wrap">
                        <button
                          className="msg-action-btn"
                          onClick={() => setPickerOpenId(pickerOpenId === msg.id ? null : msg.id)}
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
                        {pickerOpenId === msg.id && (
                          <div className="reaction-picker">
                            {REACTION_EMOJIS.map((e) => (
                              <button
                                key={e}
                                className="reaction-pick-btn"
                                onClick={() => { onToggleReaction(msg.id, e); setPickerOpenId(null); }}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {isChannelMsg && onOpenThread && (
                        <button
                          className="msg-action-btn"
                          onClick={() => onOpenThread(msg as MessageWithProfile)}
                          title="Reply in thread"
                          aria-label="Reply in thread"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M1 2.5C1 1.95 1.45 1.5 2 1.5H12C12.55 1.5 13 1.95 13 2.5V9C13 9.55 12.55 10 12 10H4.5L1 13V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}

                      {showMenu && (
                        <ModerationMenu
                          messageId={msg.id}
                          targetUserId={msgUserId}
                          targetUsername={msg.profiles.display_name ?? msg.profiles.username}
                          currentUserId={currentUserId}
                          currentUserRole={currentUserRole ?? "member"}
                          isOwnMessage={isOwnMessage}
                          onDeleteMessage={() => onDeleteMessage ? onDeleteMessage(msg.id) : undefined}
                          onPinMessage={onPinMessage ? () => onPinMessage(pinnedMessageId === msg.id ? "" : msg.id) : undefined}
                          isPinned={pinnedMessageId === msg.id}
                          hideReport={hideReport}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Thread count button — visible when replies exist */}
              {isChannelMsg && replyCount > 0 && onOpenThread && (
                <div className="thread-button-wrap">
                  <button
                    className="thread-button"
                    onClick={() => onOpenThread(msg as MessageWithProfile)}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 3C2 2.45 2.45 2 3 2H13C13.55 2 14 2.45 14 3V10C14 10.55 13.55 11 13 11H5L2 14V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    </svg>
                    {replyCount} {replyCount === 1 ? "reply" : "replies"}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
