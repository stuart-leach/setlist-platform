"use client";

import UserAvatar from "./UserAvatar";
import type { MessageWithProfile } from "@/lib/supabase/types";

interface Props {
  message: MessageWithProfile;
  collapsed: boolean;
  canPin: boolean;
  onUnpin: () => void;
  onJump: () => void;
}

export default function PinnedBanner({ message, collapsed, canPin, onUnpin, onJump }: Props) {
  const authorName = message.profiles.display_name ?? message.profiles.username;
  const snippet = message.content.length > 120
    ? message.content.slice(0, 120) + "…"
    : message.content;

  return (
    <div className={`pinned-banner${collapsed ? " pinned-banner--collapsed" : ""}`}>

      {/* Clickable body — jumps to the message in the feed */}
      <button className="pinned-banner-jump" onClick={onJump} aria-label="Jump to pinned message">
        <div className="pinned-banner-icon">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 2h6l-1 5H6L5 2Z"/>
            <path d="M3 7.5h10"/>
            <path d="M8 7.5V14"/>
          </svg>
        </div>

        {collapsed ? (
          <div className="pinned-banner-collapsed-body">
            <span className="pinned-banner-label">Pinned</span>
            <span className="pinned-banner-snippet">{snippet}</span>
          </div>
        ) : (
          <div className="pinned-banner-full-body">
            <UserAvatar profile={message.profiles} size={22} />
            <div className="pinned-banner-text">
              <span className="pinned-banner-author">{authorName}</span>
              <span className="pinned-banner-content">{snippet}</span>
            </div>
          </div>
        )}
      </button>

      {/* Unpin button — sits outside the jump button so it doesn't trigger jump */}
      {canPin && (
        <button
          className="pinned-banner-unpin"
          onClick={onUnpin}
          title="Unpin message"
          aria-label="Unpin message"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      )}

    </div>
  );
}
