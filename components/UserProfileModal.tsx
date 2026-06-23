"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "./UserAvatar";
import type { Profile } from "@/lib/supabase/types";

interface Props {
  user: Profile;
  currentUserId?: string;
  currentUserRole: string;
  onClose: () => void;
  onUpdate?: (updates: Partial<Profile>) => void;
}

const MUTE_OPTIONS = [
  { label: "Mute 1 hour",   ms: 60 * 60 * 1000 },
  { label: "Mute 24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "Mute 7 days",   ms: 7 * 24 * 60 * 60 * 1000 },
];

const LS_KEY = (userId: string) => `admin-profile-${userId}`;

function loadLocalOverrides(userId: string): { adminNote?: string; mtLink?: string; displayName?: string } {
  try { return JSON.parse(localStorage.getItem(LS_KEY(userId)) ?? "{}"); } catch { return {}; }
}
function saveLocalOverride(userId: string, updates: Record<string, string>) {
  const current = loadLocalOverrides(userId);
  localStorage.setItem(LS_KEY(userId), JSON.stringify({ ...current, ...updates }));
}

export default function UserProfileModal({ user, currentUserId, currentUserRole, onClose, onUpdate }: Props) {
  const router = useRouter();
  const isPreview = user.id.startsWith("fake-") || user.id === "preview-user-id";
  const isCurrentUserPreview = currentUserId?.startsWith("preview") ?? false;
  const isOwnProfile = !!currentUserId && currentUserId === user.id;
  const canModerate = currentUserRole === "admin" || currentUserRole === "moderator";
  const isAdmin = currentUserRole === "admin";
  const showDmButton = !!currentUserId && !isOwnProfile && !isCurrentUserPreview && !isPreview;

  const overrides = loadLocalOverrides(user.id);

  const [displayName, setDisplayName] = useState(overrides.displayName ?? user.display_name ?? "");
  const [editingName, setEditingName] = useState(false);
  const [adminNote, setAdminNote] = useState(overrides.adminNote ?? user.admin_note ?? "");
  const [mtLink, setMtLink] = useState(overrides.mtLink ?? user.mt_account_link ?? "");
  const [isMuted, setIsMuted] = useState(
    !!user.muted_until && new Date(user.muted_until) > new Date()
  );
  const [isBanned, setIsBanned] = useState(user.is_banned);
  const [saved, setSaved] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function saveToDB(updates: Partial<Profile>) {
    if (isPreview) return;
    await supabase.from("profiles").update(updates as Record<string, unknown>).eq("id", user.id);
  }

  async function handleMute(ms: number) {
    const until = new Date(Date.now() + ms).toISOString();
    setIsMuted(true);
    setSaved("User muted");
    setTimeout(() => setSaved(""), 3000);
    if (!isPreview) await saveToDB({ muted_until: until });
  }

  async function handleUnmute() {
    setIsMuted(false);
    setSaved("User unmuted");
    setTimeout(() => setSaved(""), 3000);
    if (!isPreview) await saveToDB({ muted_until: null });
  }

  async function handleBan() {
    setIsBanned(true);
    setSaved("User banned");
    setTimeout(() => setSaved(""), 3000);
    if (!isPreview) await saveToDB({ is_banned: true });
    onUpdate?.({ is_banned: true });
  }

  async function handleUnban() {
    setIsBanned(false);
    setSaved("User unbanned");
    setTimeout(() => setSaved(""), 3000);
    if (!isPreview) await saveToDB({ is_banned: false });
    onUpdate?.({ is_banned: false });
  }

  function handleSaveName() {
    setEditingName(false);
    saveLocalOverride(user.id, { displayName });
    setSaved("Name updated");
    setTimeout(() => setSaved(""), 3000);
    if (!isPreview) saveToDB({ display_name: displayName });
    onUpdate?.({ display_name: displayName });
  }

  function handleNoteBlur() {
    saveLocalOverride(user.id, { adminNote });
    if (!isPreview) saveToDB({ admin_note: adminNote });
  }

  function handleMtLinkBlur() {
    saveLocalOverride(user.id, { mtLink });
    if (!isPreview) saveToDB({ mt_account_link: mtLink });
  }

  const displayProfile: Profile = { ...user, display_name: displayName || user.username };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="user-profile-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="upm-header">
          <h2 className="upm-title">User Profile</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Identity */}
        <div className="upm-identity">
          <UserAvatar profile={displayProfile} size={72} />
          <div className="upm-identity-info">
            {editingName ? (
              <div className="upm-name-edit">
                <input
                  className="upm-name-input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                  autoFocus
                />
                <button className="upm-name-save" onClick={handleSaveName}>Save</button>
                <button className="upm-name-cancel" onClick={() => setEditingName(false)}>✕</button>
              </div>
            ) : (
              <div className="upm-name-row">
                <span className="upm-display-name">{displayName || user.username}</span>
                {isAdmin && (
                  <button className="upm-edit-name-btn" onClick={() => setEditingName(true)} title="Edit display name">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M9.5 2L12 4.5L5 11.5H2.5V9L9.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            <span className="upm-username">@{user.username}</span>
            {user.job_title && <span className="upm-job-title">{user.job_title}</span>}
            {user.location && <span className="upm-location">📍 {user.location}</span>}
            <div className="upm-badges">
              {user.role === "admin" && <span className="role-badge role-badge-admin">Admin</span>}
              {user.role === "moderator" && <span className="role-badge role-badge-mod">Mod</span>}
              {isBanned && <span className="upm-badge-banned">Banned</span>}
              {isMuted && <span className="upm-badge-muted">🔇 Muted</span>}
            </div>
          </div>
        </div>

        {showDmButton && (
          <div className="upm-dm-row">
            <button
              className="upm-dm-action"
              onClick={() => { router.push(`/dm/${user.id}`); onClose(); }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3C2 2.45 2.45 2 3 2H13C13.55 2 14 2.45 14 3V10C14 10.55 13.55 11 13 11H5L2 14V3Z"/>
              </svg>
              <span>Send direct message</span>
              <svg className="upm-dm-chevron" width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3L9 7L5 11"/>
              </svg>
            </button>
          </div>
        )}

        {user.bio && <p className="upm-bio">{user.bio}</p>}

        {/* Admin fields */}
        {canModerate && (
          <>
            <div className="upm-divider" />
            <div className="upm-admin-section">
              <div className="upm-field">
                <label className="upm-label">MultiTracks Account</label>
                <input
                  className="upm-input"
                  value={mtLink}
                  onChange={e => setMtLink(e.target.value)}
                  onBlur={handleMtLinkBlur}
                  placeholder="https://multitracks.com/user/..."
                />
                {mtLink && (
                  <a href={mtLink} target="_blank" rel="noreferrer" className="upm-mt-link">
                    View on MultiTracks →
                  </a>
                )}
              </div>
              {isAdmin && (
                <div className="upm-field">
                  <label className="upm-label">Admin Note <span className="upm-label-hint">(only visible to admins)</span></label>
                  <textarea
                    className="upm-textarea"
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                    onBlur={handleNoteBlur}
                    placeholder="Internal notes about this user…"
                    rows={3}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Moderation actions */}
        {canModerate && (
          <>
            <div className="upm-divider" />
            <div className="upm-mod-section">
              <p className="upm-section-title">Moderation</p>
              <div className="upm-mod-actions">
                {!isMuted ? (
                  <div className="upm-mute-group">
                    {MUTE_OPTIONS.map(opt => (
                      <button key={opt.ms} className="upm-mod-btn" onClick={() => handleMute(opt.ms)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button className="upm-mod-btn upm-mod-btn-success" onClick={handleUnmute}>
                    Unmute User
                  </button>
                )}

                {!isBanned ? (
                  <button className="upm-mod-btn upm-mod-btn-danger" onClick={handleBan}>
                    Ban User
                  </button>
                ) : (
                  <button className="upm-mod-btn upm-mod-btn-success" onClick={handleUnban}>
                    Unban User
                  </button>
                )}

                {isAdmin && (
                  <div className="upm-role-group">
                    <label className="upm-label">Platform Role</label>
                    <div className="upm-role-btns">
                      {["admin", "moderator", "member"].map(r => (
                        <button
                          key={r}
                          className={`upm-role-btn${user.role === r ? " active" : ""}`}
                          onClick={async () => {
                            if (!isPreview) await saveToDB({ role: r });
                            onUpdate?.({ role: r });
                            setSaved(`Role set to ${r}`);
                            setTimeout(() => setSaved(""), 3000);
                          }}
                        >
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {saved && <p className="upm-saved">✓ {saved}</p>}
      </div>
    </div>
  );
}
