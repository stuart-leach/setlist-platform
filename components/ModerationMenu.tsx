"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";

interface Props {
  messageId: string;
  targetUserId: string;
  targetUsername: string;
  currentUserId: string;
  currentUserRole: string;
  isOwnMessage: boolean;
  onDeleteMessage: () => void;
  onPinMessage?: () => void;
  isPinned?: boolean;
  hideReport?: boolean;
}

const PREVIEW_ID = "preview-user-id";

export default function ModerationMenu({
  messageId,
  targetUserId,
  targetUsername,
  currentUserId,
  currentUserRole,
  isOwnMessage,
  onDeleteMessage,
  onPinMessage,
  isPinned,
  hideReport,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [hasFlagged, setHasFlagged] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const canModerate = currentUserRole === "admin" || currentUserRole === "moderator";
  const isAdmin = currentUserRole === "admin";
  const isPreviewTarget = targetUserId === PREVIEW_ID || targetUserId.startsWith("preview");
  const isPreviewSelf = currentUserId === PREVIEW_ID || currentUserId.startsWith("preview");
  const showShield = canModerate && !isOwnMessage;
  const showReport = !hideReport && !isOwnMessage && !isPreviewSelf;

  useEffect(() => {
    function handler(e: MouseEvent) {
      const inWrap = wrapRef.current?.contains(e.target as Node);
      const inDropdown = dropdownRef.current?.contains(e.target as Node);
      if (!inWrap && !inDropdown) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropdownHeight = 340;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove > dropdownHeight || spaceAbove > spaceBelow) {
      setDropdownStyle({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right });
    } else {
      setDropdownStyle({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [open]);

  async function handleMute(ms: number) {
    setOpen(false);
    if (isPreviewTarget) return;
    await supabase.from("profiles").update({ muted_until: new Date(Date.now() + ms).toISOString() }).eq("id", targetUserId);
  }

  async function handleBan() {
    setOpen(false);
    if (isPreviewTarget) return;
    await supabase.from("profiles").update({ is_banned: true }).eq("id", targetUserId);
  }

  async function handleSetRole(newRole: string) {
    setOpen(false);
    if (isPreviewTarget) return;
    await supabase.from("profiles").update({ role: newRole }).eq("id", targetUserId);
  }

  async function handleReport() {
    setOpen(false);
    if (isPreviewSelf || hasFlagged) return;
    const { error } = await supabase
      .from("message_flags")
      .insert({ message_id: messageId, flagged_by: currentUserId });
    if (!error) {
      setHasFlagged(true);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    }
  }

  const dropdown = open ? (
    <div ref={dropdownRef} className="mod-dropdown" style={{ position: "fixed", zIndex: 1000, ...dropdownStyle }}>
      {canModerate && onPinMessage && (
        <>
          <button className="mod-dropdown-item" onClick={() => { setOpen(false); onPinMessage(); }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M5 2h6l-1 5H6L5 2Z"/>
              <path d="M3 7.5h10"/>
              <path d="M8 7.5V14"/>
            </svg>
            {isPinned ? "Unpin message" : "Pin message"}
          </button>
          <div className="mod-dropdown-separator" />
        </>
      )}

      {showReport && (
        <>
          <button
            className={`mod-dropdown-item${hasFlagged ? " mod-dropdown-item--dim" : ""}`}
            onClick={handleReport}
            disabled={hasFlagged}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 2v12M3 2l10 5-10 5"/>
            </svg>
            {hasFlagged ? "Reported" : "Report message"}
          </button>
          <div className="mod-dropdown-separator" />
        </>
      )}

      {(canModerate || isOwnMessage) && (
        <button className="mod-dropdown-item danger" onClick={() => { setOpen(false); onDeleteMessage(); }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 4H14M5 4V2.5C5 2.22 5.22 2 5.5 2H10.5C10.78 2 11 2.22 11 2.5V4M6 7V12M10 7V12M3 4L4 14H12L13 4H3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Delete message
        </button>
      )}

      {showShield && (
        <>
          <div className="mod-dropdown-separator" />
          <span className="mod-dropdown-label">Mute {targetUsername}</span>
          <button className="mod-dropdown-item" onClick={() => handleMute(60 * 60 * 1000)}>Mute 1 hour</button>
          <button className="mod-dropdown-item" onClick={() => handleMute(24 * 60 * 60 * 1000)}>Mute 24 hours</button>
          <button className="mod-dropdown-item" onClick={() => handleMute(7 * 24 * 60 * 60 * 1000)}>Mute 7 days</button>
          <div className="mod-dropdown-separator" />
          <button className="mod-dropdown-item danger" onClick={handleBan}>Ban user</button>
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="mod-menu-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        className="msg-action-btn"
        onClick={() => setOpen((o) => !o)}
        title="More actions"
        aria-label="More actions"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/>
        </svg>
      </button>
      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
      {typeof document !== "undefined" && showToast && createPortal(
        <div className={`report-toast${showToast ? " report-toast--in" : ""}`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 3L6.5 10.5L3 7"/>
          </svg>
          Message reported. Our admins will review it shortly.
        </div>,
        document.body
      )}
    </div>
  );
}
