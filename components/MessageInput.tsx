"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "./UserAvatar";
import type { MessageWithProfile } from "@/lib/supabase/types";

const EMOJIS = [
  "😀","😂","😍","🥰","😎","😢","😮","😅",
  "🤔","😏","🥳","🤩","😭","💀","🤣","🥹",
  "😤","🫶","🙌","🤦","😡","🫡","🙈","😈",
  "👍","👎","❤️","🔥","✅","🎉","🙏","💪",
  "👏","🚀","⭐","💯","🤝","🎶","🎸","🎵",
  "😴","🤧","🥶","🤯","💅","🫠","😬","🤮",
];

function formatMuteRemaining(mutedUntil: string): string {
  const ms = new Date(mutedUntil).getTime() - Date.now();
  if (ms <= 0) return "shortly";
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""}`;
  if (hours >= 1) { const m = mins % 60; return `${hours}h${m > 0 ? ` ${m}m` : ""}`; }
  return `${Math.max(1, mins)} minute${mins !== 1 ? "s" : ""}`;
}

interface Props {
  placeholder: string;
  currentUserId: string;
  currentUserRole?: string;
  onSend: (content: string, optimisticMsg: MessageWithProfile) => Promise<void>;
  mutedUntil?: string | null;
  isLocked?: boolean;
  isAdmin?: boolean;
}

type MentionTrigger = "@" | "#" | null;

interface UserSug  { kind: "user";     id: string; username: string; display_name: string | null; avatar_url: string | null; }
interface ChanSug  { kind: "channel";  id: string; slug: string; name: string; }
interface EveryoneSug { kind: "everyone"; }
type Suggestion = UserSug | ChanSug | EveryoneSug;

// Detect if the text before the cursor contains an active @ or # trigger.
// Returns { trigger, query, start } or null.
function detectTrigger(text: string, cursorPos: number): { trigger: MentionTrigger; query: string; start: number } | null {
  const before = text.slice(0, cursorPos);
  // @ not followed by [ (to skip already-formatted mentions)
  const atMatch = before.match(/(?:^|[\s])(@(?!\[)(\w*)$)/);
  if (atMatch) {
    const start = cursorPos - atMatch[1].length;
    return { trigger: "@", query: atMatch[2], start };
  }
  // # not followed by [
  const hashMatch = before.match(/(?:^|[\s])(#(?!\[)(\w*)$)/);
  if (hashMatch) {
    const start = cursorPos - hashMatch[1].length;
    return { trigger: "#", query: hashMatch[2], start };
  }
  return null;
}

export default function MessageInput({ placeholder, currentUserId, currentUserRole, onSend, mutedUntil, isLocked, isAdmin }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [showMutePopup, setShowMutePopup] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Mention autocomplete state
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const canMentionEveryone = isAdmin || currentUserRole === "moderator";

  // Close emoji panel on outside click
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (emojiPanelRef.current && !emojiPanelRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  // ── Mention fetching ──────────────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (trigger: MentionTrigger, query: string) => {
    setSelectedIdx(0);
    if (trigger === "@") {
      const showEveryone = canMentionEveryone && "everyone".startsWith(query.toLowerCase());
      const everyoneItem: Suggestion[] = showEveryone ? [{ kind: "everyone" }] : [];

      const q = query.length === 0
        ? supabase.from("profiles").select("id, username, display_name, avatar_url").neq("id", currentUserId).limit(6)
        : supabase.from("profiles").select("id, username, display_name, avatar_url")
            .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
            .neq("id", currentUserId).limit(6);
      const { data } = await q;
      setSuggestions([...everyoneItem, ...(data ?? []).map((u: any) => ({ kind: "user" as const, ...u }))]);
    } else if (trigger === "#") {
      const q = query.length === 0
        ? supabase.from("channels").select("id, slug, name").order("name").limit(8)
        : supabase.from("channels").select("id, slug, name").ilike("name", `%${query}%`).limit(8);
      const { data } = await q;
      setSuggestions((data ?? []).map((ch: any) => ({ kind: "channel" as const, ...ch })));
    }
  }, [currentUserId, canMentionEveryone]);

  // ── Insert chosen suggestion ──────────────────────────────────────────────
  function insertSuggestion(sug: Suggestion) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    let token: string;
    if (sug.kind === "everyone") {
      token = "@everyone";
    } else if (sug.kind === "user") {
      token = `@[${sug.display_name ?? sug.username}](${sug.id})`;
    } else {
      token = `#[${sug.name}](${sug.slug})`;
    }
    const newValue = value.slice(0, mentionStart) + token + " " + value.slice(cursorPos);
    setValue(newValue);
    setMentionTrigger(null);
    setSuggestions([]);
    const newCursor = mentionStart + token.length + 1;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor); }, 0);
  }

  // ── Textarea change handler ───────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setValue(val);
    const cursorPos = e.target.selectionStart ?? val.length;
    const ctx = detectTrigger(val, cursorPos);
    if (ctx) {
      setMentionTrigger(ctx.trigger);
      setMentionStart(ctx.start);
      fetchSuggestions(ctx.trigger, ctx.query);
    } else {
      setMentionTrigger(null);
      setSuggestions([]);
    }
  }

  // ── Keyboard handler ──────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionTrigger && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); insertSuggestion(suggestions[selectedIdx]); return; }
      if (e.key === "Escape") { setMentionTrigger(null); setSuggestions([]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  // ── File handling ─────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setPendingFile(file);
    setPendingUrl(null);
    if (currentUserId === "preview-user-id") { setPendingUrl(URL.createObjectURL(file)); return; }
    setUploading(true);
    const path = `messages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data, error } = await supabase.storage.from("attachments").upload(path, file, { upsert: false });
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(data.path);
      setPendingUrl(publicUrl);
    }
    setUploading(false);
  }

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (!ta) { setValue((v) => v + emoji); return; }
    const start = ta.selectionStart ?? value.length;
    const end   = ta.selectionEnd   ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
    setShowEmoji(false);
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async function submit() {
    if (mutedUntil && new Date(mutedUntil) > new Date()) { setShowMutePopup(true); return; }
    const trimmed = value.trim();
    if ((!trimmed && !pendingUrl && !pendingFile) || sending || uploading) return;

    setSending(true);
    setLaunched(true);
    setValue("");
    setMentionTrigger(null);
    setSuggestions([]);
    setTimeout(() => textareaRef.current?.focus(), 0);

    const attachUrl = pendingUrl;
    setPendingFile(null);
    setPendingUrl(null);
    setTimeout(() => setLaunched(false), 450);

    const optimistic: MessageWithProfile = {
      id: `optimistic-${Date.now()}`,
      channel_id: "",
      user_id: currentUserId,
      content: trimmed || " ",
      attachment_url: attachUrl,
      created_at: new Date().toISOString(),
      profiles: {
        id: currentUserId, username: "you", display_name: "You", avatar_url: null,
        intercom_id: null, bio: null, location: null, job_title: null, created_at: "",
        role: "member", is_banned: false, muted_until: null, admin_note: null, mt_account_link: null,
      },
    };

    await onSend(trimmed || " ", optimistic);
    setSending(false);
  }

  const hasContent = value.trim().length > 0 || !!pendingUrl;
  const isMuted = !!mutedUntil && new Date(mutedUntil) > new Date();
  const showDropdown = mentionTrigger !== null && suggestions.length > 0;

  // Locked channel — non-admins see a read-only bar
  if (isLocked && !isAdmin) {
    return (
      <div className="input-bar">
        <div className="channel-locked-bar">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>
          </svg>
          This channel is read-only — only admins can post here.
        </div>
      </div>
    );
  }

  return (
    <>
      {showMutePopup && typeof document !== "undefined" && createPortal(
        <div className="mute-popup-overlay" onClick={() => setShowMutePopup(false)}>
          <div className="mute-popup" onClick={(e) => e.stopPropagation()}>
            <div className="mute-popup-icon">🔇</div>
            <h3 className="mute-popup-title">You've been muted</h3>
            <p className="mute-popup-body">
              An admin has muted you. You won't be able to send messages for another{" "}
              <strong>{mutedUntil ? formatMuteRemaining(mutedUntil) : ""}</strong>.
            </p>
            <p className="mute-popup-rules">
              Please review the community guidelines in{" "}
              <Link href="/channels/rules" className="mute-popup-link" onClick={() => setShowMutePopup(false)}>#rules</Link>.
            </p>
            <button className="mute-popup-close" onClick={() => setShowMutePopup(false)}>Got it</button>
          </div>
        </div>,
        document.body
      )}

      <div className="input-bar" style={{ position: "relative" }}>
        {/* ── Mention / channel autocomplete dropdown ── */}
        {showDropdown && (
          <div className="mention-dropdown">
            <p className="mention-dropdown-heading">
              {mentionTrigger === "@" ? "Mention someone" : "Jump to channel"}
            </p>
            {suggestions.map((sug, i) => {
              const isSelected = i === selectedIdx;
              if (sug.kind === "everyone") {
                return (
                  <button
                    key="everyone"
                    className={`mention-item${isSelected ? " selected" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); insertSuggestion(sug); }}
                    onMouseEnter={() => setSelectedIdx(i)}
                  >
                    <span className="mention-everyone-icon">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <circle cx="10" cy="7" r="3"/><path d="M3 18c0-4 3-6 7-6s7 2 7 6"/>
                        <circle cx="16" cy="6" r="2"/><path d="M18 14c0-2 1.5-3.5 3.5-3.5"/>
                      </svg>
                    </span>
                    <div>
                      <span className="mention-item-name mention-item-everyone">@everyone</span>
                      <span className="mention-item-username"> · notify all members</span>
                    </div>
                  </button>
                );
              }
              if (sug.kind === "user") {
                return (
                  <button
                    key={sug.id}
                    className={`mention-item${isSelected ? " selected" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); insertSuggestion(sug); }}
                    onMouseEnter={() => setSelectedIdx(i)}
                  >
                    <UserAvatar profile={{ id: sug.id, username: sug.username, display_name: sug.display_name, avatar_url: sug.avatar_url }} size={22} />
                    <div>
                      <span className="mention-item-name">{sug.display_name ?? sug.username}</span>
                      {sug.display_name && <span className="mention-item-username"> @{sug.username}</span>}
                    </div>
                  </button>
                );
              }
              // channel
              return (
                <button
                  key={sug.id}
                  className={`mention-item${isSelected ? " selected" : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); insertSuggestion(sug); }}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span className="mention-channel-hash">#</span>
                  <span className="mention-item-name">{sug.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Attachment preview */}
        {pendingFile && (
          <div className="attachment-preview">
            {pendingUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pendingUrl} alt="attachment" className="attachment-thumb" />
            ) : (
              <div className="attachment-thumb attachment-uploading">
                <span>{uploading ? "Uploading…" : pendingFile.name}</span>
              </div>
            )}
            <button className="attachment-remove-btn" onClick={() => { setPendingFile(null); setPendingUrl(null); }} aria-label="Remove attachment">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
        )}

        <div className={`input-wrap${launched ? " input-launching" : ""}`}>
          <div className="input-left-actions">
            {/* Attach image */}
            <button className="input-action-btn" title="Attach image" aria-label="Attach image" onClick={() => fileInputRef.current?.click()} disabled={sending}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M4 16L8 10L11 14L14 10L17 16H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="13.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.8"/>
                <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

            {/* Emoji picker */}
            <div className="emoji-picker-wrap" ref={emojiPanelRef}>
              <button className={`input-action-btn${showEmoji ? " active" : ""}`} title="Emoji" aria-label="Insert emoji" onClick={() => setShowEmoji((v) => !v)} disabled={sending}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M7 13C7.5 14 8.5 14.5 10 14.5C11.5 14.5 12.5 14 13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx="7.5" cy="8.5" r="1" fill="currentColor"/>
                  <circle cx="12.5" cy="8.5" r="1" fill="currentColor"/>
                </svg>
              </button>
              {showEmoji && (
                <div className="emoji-panel">
                  <div className="emoji-grid">
                    {EMOJIS.map((e) => (<button key={e} className="emoji-btn" onClick={() => insertEmoji(e)}>{e}</button>))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="input-textarea"
          />

          <button
            onClick={submit}
            disabled={!hasContent || sending || uploading}
            className={`send-arrow-btn${launched ? " arrow-launching" : ""}`}
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 16V4M10 4L5 9M10 4L15 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
