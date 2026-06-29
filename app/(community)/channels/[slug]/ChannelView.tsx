"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MessageFeed from "@/components/MessageFeed";
import MessageInput from "@/components/MessageInput";
import ChannelSearch from "@/components/ChannelSearch";
import ThreadView from "@/components/ThreadView";
import UserProfileModal from "@/components/UserProfileModal";
import PinnedBanner from "@/components/PinnedBanner";
import type { Channel, MessageWithProfile, MessageReaction, Profile } from "@/lib/supabase/types";

const ROLE_OPTIONS = [
  { value: "worship_leader",      label: "Worship Leaders" },
  { value: "band_member",         label: "Band Members" },
  { value: "vocalist",            label: "Vocalists" },
  { value: "music_director",      label: "Music Directors" },
  { value: "production_director", label: "Production Directors" },
];

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

interface ChannelSettingsForm {
  name: string;
  slug: string;
  description: string;
  required_roles: string[];
  locked: boolean;
}

interface Props {
  channel: Channel;
  initialMessages: MessageWithProfile[];
  currentUserId: string;
  currentUserRole: string;
  initialPinnedMessage: MessageWithProfile | null;
  currentUserMutedUntil: string | null;
  basePath?: string;
  deleteFallback?: string;
}

const PREVIEW = "preview-user-id";

function buildReactionMap(msgs: MessageWithProfile[]): Map<string, MessageReaction[]> {
  const map = new Map<string, MessageReaction[]>();
  msgs.forEach((m) => {
    if (m.message_reactions) map.set(m.id, m.message_reactions as MessageReaction[]);
  });
  return map;
}

export default function ChannelView({ channel, initialMessages, currentUserId, currentUserRole, initialPinnedMessage, currentUserMutedUntil, basePath = "/channels", deleteFallback = "/" }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageWithProfile[]>(initialMessages);
  const [reactionMap, setReactionMap] = useState<Map<string, MessageReaction[]>>(() => buildReactionMap(initialMessages));
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [flySend, setFlySend] = useState(false);
  const [activeThreadMsg, setActiveThreadMsg] = useState<MessageWithProfile | null>(null);
  const [replyCountMap, setReplyCountMap] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    initialMessages.forEach((m) => { map.set(m.id, m.message_replies?.length ?? 0); });
    return map;
  });
  const [effectiveRole, setEffectiveRole] = useState(currentUserRole);
  const [profileModalUser, setProfileModalUser] = useState<Profile | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<MessageWithProfile | null>(initialPinnedMessage);
  const [feedScrolled, setFeedScrolled] = useState(false);
  const [localName, setLocalName] = useState(channel.name);
  const [localDesc, setLocalDesc] = useState(channel.description ?? "");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<ChannelSettingsForm | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    function handler(e: Event) {
      setEffectiveRole((e as CustomEvent<string>).detail);
    }
    window.addEventListener("preview-role-change", handler);
    return () => window.removeEventListener("preview-role-change", handler);
  }, []);

  // Reset messages + reactions + description when switching channels,
  // then immediately fetch fresh messages from the DB so stale server
  // cache never hides messages that arrived since the last page render.
  useEffect(() => {
    setMessages(initialMessages);
    setReactionMap(buildReactionMap(initialMessages));
    setLocalName(channel.name);
    setLocalDesc(channel.description ?? "");
    setShowSettings(false);
    setSettingsForm(null);
    setDeleteConfirm(false);

    if (currentUserId === PREVIEW) return;

    supabase
      .from("messages")
      .select("*, profiles(*), message_reactions(*), message_replies(id)")
      .eq("channel_id", channel.id)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) {
          setMessages(data as MessageWithProfile[]);
          setReactionMap(buildReactionMap(data as MessageWithProfile[]));
          // Sync reply counts
          const counts = new Map<string, number>();
          (data as MessageWithProfile[]).forEach((m) => {
            counts.set(m.id, m.message_replies?.length ?? 0);
          });
          setReplyCountMap(counts);
        }
      });
  }, [channel.id]);

  function openSettings() {
    setSettingsForm({
      name: localName,
      slug: channel.slug,
      description: localDesc,
      required_roles: channel.required_role ?? [],
      locked: channel.locked ?? false,
    });
    setSettingsError("");
    setDeleteConfirm(false);
    setShowSettings(true);
  }

  async function deleteChannel() {
    const { error } = await supabase.from("channels").delete().eq("id", channel.id);
    if (error) { setSettingsError(error.message); setDeleteConfirm(false); return; }
    router.push(deleteFallback);
  }

  async function saveSettings() {
    if (!settingsForm) return;
    const name = settingsForm.name.trim();
    if (!name) { setSettingsError("Channel name is required."); return; }
    const slug = settingsForm.slug.trim() || toSlug(name);
    if (!slug) { setSettingsError("Could not generate a valid slug."); return; }
    const slugChanged = slug !== channel.slug;

    const { error } = await supabase.from("channels").update({
      name,
      slug,
      description: settingsForm.description.trim() || null,
      required_role: settingsForm.required_roles.length > 0 ? settingsForm.required_roles : null,
      locked: settingsForm.locked,
    }).eq("id", channel.id);

    if (error) { setSettingsError(error.message); return; }

    setLocalName(name);
    setLocalDesc(settingsForm.description.trim());
    setShowSettings(false);
    setSettingsForm(null);

    if (slugChanged) {
      router.push(`${basePath}/${slug}`);
    } else {
      router.refresh();
    }
  }

  // Jump to a flagged message when arriving from Admin Hub
  useEffect(() => {
    const jumpId = sessionStorage.getItem("admin_jump_msg");
    if (!jumpId) return;
    sessionStorage.removeItem("admin_jump_msg");
    const tryScroll = (attempts = 0) => {
      const el = document.getElementById(`msg-${jumpId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("msg-highlight");
        setTimeout(() => el.classList.remove("msg-highlight"), 1800);
      } else if (attempts < 12) {
        setTimeout(() => tryScroll(attempts + 1), 150);
      }
    };
    setTimeout(() => tryScroll(), 300);
  }, [channel.id]);

  // Merge reactions for newly-arrived messages (don't overwrite existing)
  useEffect(() => {
    setReactionMap((prev) => {
      const next = new Map(prev);
      messages.forEach((m) => {
        if (!next.has(m.id) && m.message_reactions) {
          next.set(m.id, m.message_reactions as MessageReaction[]);
        }
      });
      return next;
    });
  }, [messages]);

  // ── Message subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (currentUserId === PREVIEW) return;

    const subscription = supabase
      .channel(`channel-${channel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` },
        async (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return prev;
          });
          const { data } = await supabase
            .from("messages").select("*, profiles(*), message_reactions(*)").eq("id", payload.new.id).single();
          if (data) {
            setMessages((prev) =>
              prev.some((m) => m.id === data.id)
                ? prev.map((m) => (m.id === data.id ? (data as MessageWithProfile) : m))
                : [...prev, data as MessageWithProfile]
            );
            setNewIds((prev) => new Set(prev).add(data.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [channel.id, currentUserId]);

  // ── Reaction subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (currentUserId === PREVIEW) return;

    const sub = supabase
      .channel(`rxn-${channel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as MessageReaction;
          setReactionMap((prev) => {
            const existing = prev.get(r.message_id) ?? [];
            if (existing.some((e) => e.id === r.id)) return prev;
            const next = new Map(prev);
            // Replace any pending optimistic entry for the same user+emoji
            const cleaned = existing.filter(
              (e) => !(e.user_id === r.user_id && e.emoji === r.emoji && e.id.startsWith("opt-"))
            );
            next.set(r.message_id, [...cleaned, r]);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.old as MessageReaction;
          setReactionMap((prev) => {
            const existing = prev.get(r.message_id);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(r.message_id, existing.filter((e) => e.id !== r.id));
            return next;
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          // message_reactions is likely not in the Supabase realtime publication.
          // Run: alter publication supabase_realtime add table message_reactions;
          console.warn("[rxn subscription]", status, err);
        }
      });

    return () => { supabase.removeChannel(sub); };
  }, [channel.id, currentUserId]);

  // ── Send message ────────────────────────────────────────────────────────────
  async function sendMessage(content: string, optimisticMsg: MessageWithProfile) {
    setFlySend(true);
    setTimeout(() => setFlySend(false), 650);

    setMessages((prev) => [...prev, optimisticMsg]);
    setNewIds((prev) => new Set(prev).add(optimisticMsg.id));
    setTimeout(() => {
      setNewIds((prev) => { const n = new Set(prev); n.delete(optimisticMsg.id); return n; });
    }, 550);

    if (currentUserId === PREVIEW) return;

    const { data, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channel.id,
        user_id: currentUserId,
        content,
        attachment_url: optimisticMsg.attachment_url ?? null,
      })
      .select("*, profiles(*), message_reactions(*)")
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      console.error("Send failed:", error.message);
    } else if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMsg.id ? (data as MessageWithProfile) : m))
      );
    }
  }

  // ── Delete message ──────────────────────────────────────────────────────────
  async function deleteMessage(messageId: string) {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    if (currentUserId !== PREVIEW) {
      await supabase.from("messages").delete().eq("id", messageId);
    }
  }

  // ── Toggle reaction ─────────────────────────────────────────────────────────
  async function toggleReaction(messageId: string, emoji: string) {
    const isPreview = currentUserId === PREVIEW;
    const current = reactionMap.get(messageId) ?? [];
    const mine = current.find((r) => r.emoji === emoji && r.user_id === currentUserId);

    if (mine) {
      setReactionMap((prev) => {
        const next = new Map(prev);
        next.set(messageId, (next.get(messageId) ?? []).filter((r) => r.id !== mine.id));
        return next;
      });
      if (!isPreview) {
        await supabase.from("message_reactions").delete().eq("id", mine.id);
      }
    } else {
      const tempId = `opt-${Date.now()}`;
      const optimistic: MessageReaction = {
        id: tempId,
        message_id: messageId,
        user_id: currentUserId,
        emoji,
        created_at: new Date().toISOString(),
      };
      setReactionMap((prev) => {
        const next = new Map(prev);
        next.set(messageId, [...(next.get(messageId) ?? []), optimistic]);
        return next;
      });
      if (!isPreview) {
        const { data, error } = await supabase
          .from("message_reactions")
          .insert({ message_id: messageId, user_id: currentUserId, emoji })
          .select()
          .single();
        if (error) {
          setReactionMap((prev) => {
            const next = new Map(prev);
            next.set(messageId, (next.get(messageId) ?? []).filter((r) => r.id !== tempId));
            return next;
          });
        } else if (data) {
          setReactionMap((prev) => {
            const next = new Map(prev);
            next.set(messageId, (next.get(messageId) ?? []).map((r) => r.id === tempId ? (data as MessageReaction) : r));
            return next;
          });
        }
      }
    }
  }

  function handleReplyAdded(parentId: string) {
    setReplyCountMap((prev) => {
      const next = new Map(prev);
      next.set(parentId, (next.get(parentId) ?? 0) + 1);
      return next;
    });
  }

  async function handlePinMessage(messageId: string) {
    const newPinnedId = messageId || null;
    // Optimistic update
    if (newPinnedId) {
      const msg = messages.find((m) => m.id === newPinnedId) ?? null;
      setPinnedMessage(msg);
    } else {
      setPinnedMessage(null);
    }
    await supabase
      .from("channels")
      .update({ pinned_message_id: newPinnedId })
      .eq("id", channel.id);
  }

  return (
    <div className="channel-shell">
      {/* Main channel column */}
      <div className="channel-main">
        {flySend && (
          <div className="send-arrow-wrap">
            <svg className="send-arrow" width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 18V4M11 4L5 10M11 4L17 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}

        <div className="channel-header">
          <span className="channel-hash">#</span>
          <h1 className="channel-title">{localName}</h1>
          {localDesc && (
            <>
              <div className="channel-divider" />
              <p className="channel-desc">{localDesc}</p>
            </>
          )}
          <div className="channel-header-actions">
            {effectiveRole === "admin" && (
              <button
                className="channel-settings-btn"
                onClick={openSettings}
                title="Channel settings"
                aria-label="Channel settings"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
                </svg>
              </button>
            )}
            <ChannelSearch channelId={channel.id} channelName={channel.name} />
          </div>
        </div>

        {pinnedMessage && (
          <PinnedBanner
            message={pinnedMessage}
            collapsed={feedScrolled}
            canPin={effectiveRole === "admin" || effectiveRole === "moderator"}
            onUnpin={() => handlePinMessage("")}
            onJump={() => {
              const el = document.getElementById(`msg-${pinnedMessage.id}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                // Brief highlight flash
                el.classList.add("msg-highlight");
                setTimeout(() => el.classList.remove("msg-highlight"), 1500);
              }
            }}
          />
        )}

        <MessageFeed
          messages={messages}
          currentUserId={currentUserId}
          newIds={newIds}
          onOpenThread={setActiveThreadMsg}
          replyCountMap={replyCountMap}
          currentUserRole={effectiveRole}
          onDeleteMessage={deleteMessage}
          onProfileClick={setProfileModalUser}
          reactionMap={reactionMap}
          onToggleReaction={toggleReaction}
          onPinMessage={handlePinMessage}
          pinnedMessageId={pinnedMessage?.id ?? null}
          onScroll={(top) => setFeedScrolled(top > 60)}
        />
        <div ref={inputAreaRef}>
          <MessageInput
            placeholder={`Message #${channel.name}`}
            currentUserId={currentUserId}
            currentUserRole={effectiveRole}
            onSend={sendMessage}
            mutedUntil={currentUserMutedUntil}
            isLocked={channel.locked}
            isAdmin={effectiveRole === "admin"}
          />
        </div>

        {profileModalUser && (
          <UserProfileModal
            user={profileModalUser}
            currentUserId={currentUserId}
            currentUserRole={effectiveRole}
            onClose={() => setProfileModalUser(null)}
            onUpdate={(updates) => setProfileModalUser((prev) => prev ? { ...prev, ...updates } : null)}
          />
        )}

        {/* ── Channel settings modal ── */}
        {showSettings && settingsForm && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal-box modal-box--wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Channel Settings</h2>
                <button className="modal-close" onClick={() => setShowSettings(false)}>×</button>
              </div>
              <div style={{ padding: "16px 20px 20px" }}>

                <div className="ch-form-row">
                  <div className="ch-form-field" style={{ flex: 2 }}>
                    <label className="ch-form-label">Name</label>
                    <input
                      className="ch-form-input"
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm((f) => f ? { ...f, name: e.target.value } : f)}
                      autoFocus
                    />
                  </div>
                  <div className="ch-form-field" style={{ flex: 1 }}>
                    <label className="ch-form-label">
                      Slug <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(changes URL)</span>
                    </label>
                    <div className="ch-form-slug-wrap">
                      <span className="ch-form-slug-prefix">/channels/</span>
                      <input
                        className="ch-form-input ch-form-input-slug"
                        value={settingsForm.slug}
                        onChange={(e) => setSettingsForm((f) => f ? { ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } : f)}
                      />
                    </div>
                  </div>
                </div>

                <div className="ch-form-field">
                  <label className="ch-form-label">Description <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <input
                    className="ch-form-input"
                    value={settingsForm.description}
                    onChange={(e) => setSettingsForm((f) => f ? { ...f, description: e.target.value } : f)}
                    placeholder="What's this channel for?"
                  />
                </div>

                <div className="ch-form-row">
                  <div className="ch-form-field" style={{ flex: 1 }}>
                    <label className="ch-form-label">Access</label>
                    <p className="ch-role-hint">Check roles to restrict access. Leave all unchecked for public.</p>
                    <div className="ch-form-checks">
                      {ROLE_OPTIONS.map((r) => (
                        <label key={r.value} className="ch-check">
                          <input
                            type="checkbox"
                            checked={settingsForm.required_roles.includes(r.value)}
                            onChange={(e) => setSettingsForm((f) => f ? {
                              ...f,
                              required_roles: e.target.checked
                                ? [...f.required_roles, r.value]
                                : f.required_roles.filter((x) => x !== r.value),
                            } : f)}
                          />
                          <span>{r.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="ch-form-field" style={{ flex: 1 }}>
                    <label className="ch-form-label">Posting permissions</label>
                    <div className="ch-form-radios">
                      <label className="ch-radio">
                        <input type="radio" checked={!settingsForm.locked} onChange={() => setSettingsForm((f) => f ? { ...f, locked: false } : f)} />
                        <span>Open — all members can post</span>
                      </label>
                      <label className="ch-radio">
                        <input type="radio" checked={settingsForm.locked} onChange={() => setSettingsForm((f) => f ? { ...f, locked: true } : f)} />
                        <span>Locked — admins &amp; mods only</span>
                      </label>
                    </div>
                  </div>
                </div>

                {settingsError && <p className="ch-form-error">{settingsError}</p>}

                <div className="ch-form-actions">
                  <button className="ch-btn-primary" onClick={saveSettings}>Save Changes</button>
                  <button className="ch-btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
                </div>

                {!deleteConfirm ? (
                  <div className="ch-danger-zone">
                    <button className="ch-btn-danger-link" onClick={() => setDeleteConfirm(true)}>
                      Delete this channel
                    </button>
                  </div>
                ) : (
                  <div className="ch-delete-confirm">
                    <p className="ch-delete-confirm-text">
                      Delete <strong>#{settingsForm.name}</strong>? All messages will be permanently removed. This cannot be undone.
                    </p>
                    <div className="ch-form-actions">
                      <button className="ch-btn-danger" onClick={deleteChannel}>Delete Channel</button>
                      <button className="ch-btn-ghost" onClick={() => setDeleteConfirm(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Thread sidebar — slides in from the right */}
      <div className={`thread-panel${activeThreadMsg ? " open" : ""}`}>
        <div className="thread-panel-inner">
          {activeThreadMsg && (
            <ThreadView
              parentMessage={activeThreadMsg}
              currentUserId={currentUserId}
              currentUserRole={effectiveRole}
              onClose={() => setActiveThreadMsg(null)}
              onReplyAdded={handleReplyAdded}
              onProfileClick={setProfileModalUser}
            />
          )}
        </div>
      </div>
    </div>
  );
}
