"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/UserAvatar";

type Tab = "people" | "appeals" | "banned" | "muted" | "flagged" | "settings";

interface Props {
  mutedUsers: any[];
  bannedUsers: any[];
  appeals: any[];
  flags: any[];
  allUsers: any[];
  roleChannelsEnabled: boolean;
  setlistsLastSyncedAt: string | null;
  communityName: string | null;
  logoUrl: string | null;
  mtConnectedEmail: string | null;
  mtConnectedAt: string | null;
  mtLastError: string | null;
}

const PLATFORM_ROLES = [
  { value: "admin",     label: "Admin",     color: "#ff453a" },
  { value: "moderator", label: "Mod",       color: "#ff9f0a" },
  { value: "member",    label: "Member",    color: "rgba(255,255,255,0.35)" },
];

const COMMUNITY_ROLE_LABELS: Record<string, string> = {
  worship_leader:      "Worship Leader",
  band_member:         "Band Member",
  vocalist:            "Vocalist",
  music_director:      "Music Director",
  production_director: "Production Director",
};

// Admin-hub red accent
const ADMIN_RED = "#ff453a";
const ADMIN_RED_DIM = "rgba(255, 69, 58, 0.15)";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatMutedUntil(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const btnBase: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  border: "none",
  flexShrink: 0,
};

const btnApprove: React.CSSProperties = { ...btnBase, background: "rgba(52, 199, 89, 0.15)", color: "#34c759" };
const btnReject: React.CSSProperties = { ...btnBase, background: ADMIN_RED_DIM, color: ADMIN_RED };
const btnNeutral: React.CSSProperties = { ...btnBase, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" };
const btnJump: React.CSSProperties = { ...btnBase, background: ADMIN_RED_DIM, color: ADMIN_RED };

const mutedTextStyle: React.CSSProperties = { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 24 };

export default function AdminHub({ mutedUsers, bannedUsers, appeals, flags, allUsers, roleChannelsEnabled, setlistsLastSyncedAt, communityName, logoUrl, mtConnectedEmail, mtConnectedAt, mtLastError }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("people");
  const [roleChannelsOn, setRoleChannelsOn] = useState<boolean>(roleChannelsEnabled);
  const [savingSetting, setSavingSetting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(setlistsLastSyncedAt);

  // ── MultiTracks connection ────────────────────────────────────────────────
  const [mtEmail, setMtEmail] = useState<string | null>(mtConnectedEmail);
  const [mtConnAt, setMtConnAt] = useState<string | null>(mtConnectedAt);
  const [connEmail, setConnEmail] = useState("");
  const [connPassword, setConnPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connMsg, setConnMsg] = useState<string | null>(mtLastError ? `Last sync error: ${mtLastError}` : null);

  async function connectMt() {
    if (!connEmail.trim() || !connPassword) { setConnMsg("Enter your MultiTracks email and password."); return; }
    setConnecting(true);
    setConnMsg(null);
    try {
      const res = await fetch("/api/multitracks/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: connEmail.trim(), password: connPassword }),
      });
      const body = await res.json();
      if (!res.ok) { setConnMsg(body.error || "Could not connect."); }
      else {
        setMtEmail(body.email);
        setMtConnAt(new Date().toISOString());
        setConnEmail("");
        setConnPassword("");
        setConnMsg("Connected. You can sync setlists now.");
        router.refresh();
      }
    } catch {
      setConnMsg("Could not reach the server.");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectMt() {
    setConnecting(true);
    setConnMsg(null);
    try {
      await fetch("/api/multitracks/connect", { method: "DELETE" });
      setMtEmail(null);
      setMtConnAt(null);
      setConnMsg("Disconnected.");
      router.refresh();
    } finally {
      setConnecting(false);
    }
  }

  // ── Branding ────────────────────────────────────────────────────────────────
  const [brandName, setBrandName] = useState<string>(communityName ?? "");
  const [brandLogo, setBrandLogo] = useState<string | null>(logoUrl);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandMsg, setBrandMsg] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setBrandMsg(null);
    if (!file.type.startsWith("image/")) { setBrandMsg("Please choose an image file."); return; }
    if (file.size > 2 * 1024 * 1024) { setBrandMsg("Logo must be under 2 MB."); return; }
    setSavingBrand(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (upErr) { setBrandMsg(upErr.message); setSavingBrand(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("branding").getPublicUrl(path);
    const { error } = await supabase.from("community_settings").update({ logo_url: publicUrl }).eq("id", true);
    setSavingBrand(false);
    if (error) { setBrandMsg(error.message); return; }
    setBrandLogo(publicUrl);
    setBrandMsg("Logo updated.");
    router.refresh();
  }

  async function saveBrandName() {
    setSavingBrand(true);
    setBrandMsg(null);
    const { error } = await supabase
      .from("community_settings")
      .update({ community_name: brandName.trim() || null })
      .eq("id", true);
    setSavingBrand(false);
    if (error) { setBrandMsg(error.message); return; }
    setBrandMsg("Saved.");
    router.refresh();
  }

  async function syncSetlists() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/setlists/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setSyncMsg(body.error || "Sync failed.");
      } else {
        setSyncMsg(`Synced ${body.total} setlist${body.total === 1 ? "" : "s"} — ${body.created} new, ${body.updated} updated.`);
        setLastSynced(new Date().toISOString());
        router.refresh();
      }
    } catch {
      setSyncMsg("Sync failed — could not reach the server.");
    } finally {
      setSyncing(false);
    }
  }
  const [localAppeals, setLocalAppeals] = useState<any[]>(appeals);
  const [localBanned, setLocalBanned] = useState<any[]>(bannedUsers);
  const [localMuted, setLocalMuted] = useState<any[]>(mutedUsers);
  const [localFlags, setLocalFlags] = useState<any[]>(flags);
  const [localPeople, setLocalPeople] = useState<any[]>(allUsers);
  const [expandedAppeals, setExpandedAppeals] = useState<Set<string>>(new Set());

  // People tab state
  const [peopleSearch, setPeopleSearch] = useState("");
  const [openMuteMenuId, setOpenMuteMenuId] = useState<string | null>(null);
  const [confirmBanId, setConfirmBanId] = useState<string | null>(null);
  const [roleEditId, setRoleEditId] = useState<string | null>(null);

  const supabase = createClient();

  function notifySidebar() {
    window.dispatchEvent(new CustomEvent("admin-count-change"));
  }

  async function approveAppeal(appeal: any) {
    await supabase.from("profiles").update({ is_banned: false }).eq("id", appeal.user_id);
    await supabase.from("ban_appeals").update({ status: "approved" }).eq("id", appeal.id);
    setLocalAppeals((prev) => prev.filter((a) => a.id !== appeal.id));
    notifySidebar();
  }

  async function rejectAppeal(appeal: any) {
    await supabase.from("ban_appeals").update({ status: "rejected" }).eq("id", appeal.id);
    setLocalAppeals((prev) => prev.filter((a) => a.id !== appeal.id));
    notifySidebar();
  }

  async function unbanUser(userId: string) {
    await supabase.from("profiles").update({ is_banned: false }).eq("id", userId);
    setLocalBanned((prev) => prev.filter((u) => u.id !== userId));
  }

  async function unmuteUser(userId: string) {
    await supabase.from("profiles").update({ muted_until: null }).eq("id", userId);
    setLocalMuted((prev) => prev.filter((u) => u.id !== userId));
  }

  async function dismissFlag(flagId: string) {
    await supabase.from("message_flags").delete().eq("id", flagId);
    setLocalFlags((prev) => prev.filter((f) => f.id !== flagId));
    notifySidebar();
  }

  function jumpToMessage(flag: any) {
    const slug = flag.channel?.slug;
    const messageId = flag.message_id;
    if (!slug || !messageId) return;
    sessionStorage.setItem("admin_jump_msg", messageId);
    router.push(`/channels/${slug}`);
  }

  function toggleExpand(id: string) {
    setExpandedAppeals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── People tab actions ──────────────────────────────────────────────────────
  async function setPlatformRole(userId: string, role: string) {
    setRoleEditId(null);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) { alert(`Failed to update role: ${error.message}`); return; }
    setLocalPeople((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
  }

  async function mutePersonInPeople(userId: string, ms: number) {
    setOpenMuteMenuId(null);
    const muted_until = new Date(Date.now() + ms).toISOString();
    const { error } = await supabase.from("profiles").update({ muted_until }).eq("id", userId);
    if (error) { alert(`Failed to mute: ${error.message}`); return; }
    setLocalPeople((prev) => prev.map((u) => u.id === userId ? { ...u, muted_until } : u));
  }

  async function unmutePersonInPeople(userId: string) {
    const { error } = await supabase.from("profiles").update({ muted_until: null }).eq("id", userId);
    if (error) { alert(`Failed to unmute: ${error.message}`); return; }
    setLocalPeople((prev) => prev.map((u) => u.id === userId ? { ...u, muted_until: null } : u));
  }

  async function banPersonInPeople(userId: string) {
    setConfirmBanId(null);
    const { error } = await supabase.from("profiles").update({ is_banned: true }).eq("id", userId);
    if (error) { alert(`Failed to ban: ${error.message}`); return; }
    setLocalPeople((prev) => prev.map((u) => u.id === userId ? { ...u, is_banned: true } : u));
    notifySidebar();
  }

  async function unbanPersonInPeople(userId: string) {
    const { error } = await supabase.from("profiles").update({ is_banned: false }).eq("id", userId);
    if (error) { alert(`Failed to unban: ${error.message}`); return; }
    setLocalPeople((prev) => prev.map((u) => u.id === userId ? { ...u, is_banned: false } : u));
  }

  const filteredPeople = peopleSearch.trim()
    ? localPeople.filter((u) => {
        const q = peopleSearch.toLowerCase();
        return (
          (u.display_name ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q)
        );
      })
    : localPeople;

  const tabs: { key: Tab; label: string; count?: number; danger?: boolean }[] = [
    { key: "people",   label: "People",   count: localPeople.length },
    { key: "appeals",  label: "Appeals",  count: localAppeals.length },
    { key: "banned",   label: "Banned",   count: localBanned.length },
    { key: "muted",    label: "Muted",    count: localMuted.length },
    { key: "flagged",  label: "Flagged",  count: localFlags.length, danger: true },
    { key: "settings", label: "Settings" },
  ];

  async function toggleRoleChannels(next: boolean) {
    setRoleChannelsOn(next); // optimistic
    setSavingSetting(true);
    const { error } = await supabase
      .from("community_settings")
      .update({ role_channels_enabled: next, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSavingSetting(false);
    if (error) { setRoleChannelsOn(!next); return; } // revert on failure
    router.refresh();
  }

  const totalAlerts = localAppeals.length + localFlags.length;

  return (
    <div className="channel-shell">
      <div className="channel-main">
        {/* Header with red gradient */}
        <div
          className="channel-header"
          style={{
            background: "linear-gradient(135deg, rgba(255,69,58,0.10) 0%, rgba(255,69,58,0.02) 60%, transparent 100%)",
            borderBottom: "1px solid rgba(255,69,58,0.15)",
          }}
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke={ADMIN_RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <h1 className="channel-title" style={{ color: ADMIN_RED }}>Admin Hub</h1>
          {totalAlerts > 0 && (
            <span style={{
              marginLeft: 4,
              background: ADMIN_RED,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 10,
              padding: "1px 7px",
              lineHeight: "18px",
            }}>
              {totalAlerts} pending
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 20px" }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const badgeColor = tab.danger ? ADMIN_RED : ADMIN_RED;
            const showCount = tab.count !== undefined && tab.count > 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "10px 16px",
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${ADMIN_RED}` : "2px solid transparent",
                  color: isActive ? ADMIN_RED : "rgba(255,255,255,0.5)",
                  fontSize: "13.5px",
                  cursor: "pointer",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "color 0.12s",
                }}
              >
                {tab.label}
                {showCount && (
                  <span style={{
                    background: tab.danger ? ADMIN_RED : "rgba(255,255,255,0.15)",
                    color: tab.danger ? "#fff" : "rgba(255,255,255,0.7)",
                    borderRadius: 10,
                    padding: "1px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: "16px",
                    minWidth: 16,
                    textAlign: "center",
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>

          {/* ── People ── */}
          {activeTab === "people" && (
            <div>
              {/* Search */}
              <div style={{ marginBottom: 14 }}>
                <input
                  className="people-search-input"
                  placeholder="Search by name or username…"
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {filteredPeople.length === 0 ? (
                <p style={mutedTextStyle}>No users found</p>
              ) : (
                filteredPeople.map((user) => {
                  const name = user.display_name ?? user.username ?? "Unknown";
                  const roleInfo = PLATFORM_ROLES.find((r) => r.value === user.role) ?? PLATFORM_ROLES[2];
                  const communityRoles: string[] = (user.community_roles ?? []).map((r: any) => r.role);
                  const isMuted = user.muted_until && new Date(user.muted_until) > new Date();
                  const isBanned = user.is_banned;
                  const isConfirmingBan = confirmBanId === user.id;
                  const isEditingRole = roleEditId === user.id;
                  const isMuteOpen = openMuteMenuId === user.id;

                  return (
                    <div key={user.id} style={{ ...rowStyle, alignItems: "flex-start", gap: 10 }}>
                      <UserAvatar
                        profile={{ display_name: user.display_name, username: user.username, avatar_url: user.avatar_url }}
                        size={34}
                      />

                      {/* Identity + badges */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ color: "#fff", fontSize: 13.5, fontWeight: 600 }}>{name}</span>
                          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>@{user.username}</span>
                          {/* Platform role badge */}
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                            background: roleInfo.value === "admin" ? ADMIN_RED_DIM : roleInfo.value === "moderator" ? "rgba(255,159,10,0.15)" : "rgba(255,255,255,0.07)",
                            color: roleInfo.color,
                          }}>
                            {roleInfo.label}
                          </span>
                          {isBanned && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 5, background: ADMIN_RED_DIM, color: ADMIN_RED }}>Banned</span>}
                          {isMuted && <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 6px", borderRadius: 5, background: "rgba(255,159,10,0.12)", color: "#ff9f0a" }}>Muted</span>}
                        </div>
                        {/* Community roles */}
                        {communityRoles.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                            {communityRoles.map((r) => (
                              <span key={r} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
                                {COMMUNITY_ROLE_LABELS[r] ?? r}
                              </span>
                            ))}
                          </div>
                        )}
                        {isMuted && (
                          <p style={{ fontSize: 11.5, color: "#ff9f0a", margin: "4px 0 0", opacity: 0.8 }}>
                            Muted until {formatMutedUntil(user.muted_until)}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0, alignItems: "flex-end" }}>
                        {isConfirmingBan ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: ADMIN_RED }}>Ban this user?</span>
                            <button style={btnReject} onClick={() => banPersonInPeople(user.id)}>Ban</button>
                            <button style={btnNeutral} onClick={() => setConfirmBanId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 5 }}>
                            {/* Role selector */}
                            {isEditingRole ? (
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                {PLATFORM_ROLES.map((r) => (
                                  <button
                                    key={r.value}
                                    style={{
                                      ...btnBase,
                                      background: user.role === r.value ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
                                      color: r.color,
                                      fontWeight: user.role === r.value ? 700 : 500,
                                    }}
                                    onClick={() => setPlatformRole(user.id, r.value)}
                                  >
                                    {r.label}
                                  </button>
                                ))}
                                <button style={btnNeutral} onClick={() => setRoleEditId(null)}>✕</button>
                              </div>
                            ) : (
                              <button style={btnNeutral} onClick={() => setRoleEditId(user.id)}>
                                Set role
                              </button>
                            )}

                            {/* Mute */}
                            {isMuteOpen ? (
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <button style={btnNeutral} onClick={() => mutePersonInPeople(user.id, 60 * 60 * 1000)}>1h</button>
                                <button style={btnNeutral} onClick={() => mutePersonInPeople(user.id, 24 * 60 * 60 * 1000)}>24h</button>
                                <button style={btnNeutral} onClick={() => mutePersonInPeople(user.id, 7 * 24 * 60 * 60 * 1000)}>7d</button>
                                <button style={btnNeutral} onClick={() => setOpenMuteMenuId(null)}>✕</button>
                              </div>
                            ) : isMuted ? (
                              <button style={btnNeutral} onClick={() => unmutePersonInPeople(user.id)}>Unmute</button>
                            ) : (
                              <button style={btnNeutral} onClick={() => setOpenMuteMenuId(user.id)}>Mute</button>
                            )}

                            {/* Ban / Unban */}
                            {isBanned ? (
                              <button style={btnNeutral} onClick={() => unbanPersonInPeople(user.id)}>Unban</button>
                            ) : (
                              <button style={btnReject} onClick={() => setConfirmBanId(user.id)}>Ban</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Appeals ── */}
          {activeTab === "appeals" && (
            <div>
              {localAppeals.length === 0 ? (
                <p style={mutedTextStyle}>No pending appeals</p>
              ) : (
                localAppeals.map((appeal) => {
                  const p = appeal.profiles;
                  const isExpanded = expandedAppeals.has(appeal.id);
                  const text: string = appeal.content ?? "";
                  const truncated = text.length > 160 && !isExpanded;
                  return (
                    <div key={appeal.id} style={rowStyle}>
                      {p && (
                        <UserAvatar
                          profile={{ display_name: p.display_name, username: p.username, avatar_url: p.avatar_url }}
                          size={32}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
                            {p?.display_name ?? p?.username ?? "Unknown"}
                          </span>
                          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                            {timeAgo(appeal.created_at)}
                          </span>
                        </div>
                        <p
                          style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0, lineHeight: "1.5", cursor: truncated ? "pointer" : "default" }}
                          onClick={() => truncated && toggleExpand(appeal.id)}
                        >
                          {truncated ? text.slice(0, 160) + "…" : text}
                          {!isExpanded && text.length > 160 && (
                            <span
                              style={{ color: "rgba(255,255,255,0.35)", marginLeft: 4, fontSize: 12 }}
                              onClick={() => toggleExpand(appeal.id)}
                            >
                              show more
                            </span>
                          )}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button style={btnApprove} onClick={() => approveAppeal(appeal)}>Approve</button>
                        <button style={btnReject} onClick={() => rejectAppeal(appeal)}>Reject</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Banned ── */}
          {activeTab === "banned" && (
            <div>
              {localBanned.length === 0 ? (
                <p style={mutedTextStyle}>No banned users</p>
              ) : (
                localBanned.map((user) => (
                  <div key={user.id} style={rowStyle}>
                    <UserAvatar
                      profile={{ display_name: user.display_name, username: user.username, avatar_url: user.avatar_url }}
                      size={32}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
                        {user.display_name ?? user.username}
                      </span>
                      {user.admin_note && (
                        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "2px 0 0" }}>
                          {user.admin_note}
                        </p>
                      )}
                    </div>
                    <button style={btnNeutral} onClick={() => unbanUser(user.id)}>Unban</button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Muted ── */}
          {activeTab === "muted" && (
            <div>
              {localMuted.length === 0 ? (
                <p style={mutedTextStyle}>No currently muted users</p>
              ) : (
                localMuted.map((user) => (
                  <div key={user.id} style={rowStyle}>
                    <UserAvatar
                      profile={{ display_name: user.display_name, username: user.username, avatar_url: user.avatar_url }}
                      size={32}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
                        {user.display_name ?? user.username}
                      </span>
                      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "2px 0 0" }}>
                        Until {formatMutedUntil(user.muted_until)}
                      </p>
                    </div>
                    <button style={btnNeutral} onClick={() => unmuteUser(user.id)}>Unmute</button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Flagged Messages ── */}
          {activeTab === "flagged" && (
            <div>
              {localFlags.length === 0 ? (
                <p style={mutedTextStyle}>No reported messages</p>
              ) : (
                localFlags.map((flag) => {
                  const msg = flag.message;
                  const author = msg?.author;
                  const reporter = flag.reporter;
                  const channel = flag.channel;
                  const content: string = msg?.content ?? "(message deleted)";
                  const canJump = !!(channel?.slug && flag.message_id);
                  return (
                    <div
                      key={flag.id}
                      style={{
                        ...rowStyle,
                        alignItems: "flex-start",
                        padding: "14px 0",
                      }}
                    >
                      {/* Red flag icon */}
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: ADMIN_RED_DIM,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={ADMIN_RED} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 2v12M3 2l10 5-10 5"/>
                        </svg>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Message content */}
                        <p style={{
                          color: "rgba(255,255,255,0.82)",
                          fontSize: 13,
                          margin: "0 0 6px",
                          lineHeight: "1.55",
                          fontStyle: content === "(message deleted)" ? "italic" : "normal",
                        }}>
                          {content.length > 200 ? content.slice(0, 200) + "…" : content}
                        </p>

                        {/* Meta row */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          {author && (
                            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                              by <strong style={{ color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
                                {author.display_name ?? `@${author.username}`}
                              </strong>
                            </span>
                          )}
                          {channel?.name && (
                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                              in <strong style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                                #{channel.name}
                              </strong>
                            </span>
                          )}
                          {reporter && (
                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                              · reported by @{reporter.display_name ?? reporter.username}
                            </span>
                          )}
                          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
                            · {timeAgo(flag.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 2 }}>
                        {canJump && (
                          <button style={btnJump} onClick={() => jumpToMessage(flag)}>
                            View message
                          </button>
                        )}
                        <button style={btnNeutral} onClick={() => dismissFlag(flag.id)}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Settings tab ──────────────────────────────────────────────── */}
          {activeTab === "settings" && (
            <div style={{ padding: "20px 0", maxWidth: 560 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "16px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                    Role channels
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
                    Show role-specific channels (Worship Leaders, Band Members, etc.) in the sidebar.
                    When off, the section is hidden for everyone and those channels can&apos;t be opened.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={roleChannelsOn}
                  disabled={savingSetting}
                  onClick={() => toggleRoleChannels(!roleChannelsOn)}
                  style={{
                    flexShrink: 0,
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    border: "none",
                    cursor: savingSetting ? "default" : "pointer",
                    background: roleChannelsOn ? "#34c759" : "rgba(255,255,255,0.18)",
                    position: "relative",
                    transition: "background 0.15s",
                    marginTop: 2,
                  }}
                  title={roleChannelsOn ? "Disable role channels" : "Enable role channels"}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      left: roleChannelsOn ? 21 : 3,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 0.15s",
                    }}
                  />
                </button>
              </div>

              {/* MultiTracks account connection */}
              <div
                style={{
                  padding: "16px 18px",
                  marginTop: 14,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                  MultiTracks account
                </p>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
                  Connect your MultiTracks login so the platform can pull your setlists. We store only a secure
                  session token — never your password.
                </p>

                {mtEmail ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: "#34c759", fontWeight: 600 }}>
                        Connected as {mtEmail}
                      </p>
                      {mtConnAt && (
                        <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                          Connected {timeAgo(mtConnAt)}
                        </p>
                      )}
                    </div>
                    <button onClick={disconnectMt} disabled={connecting} style={{ ...btnNeutral, flexShrink: 0, padding: "7px 14px", cursor: connecting ? "default" : "pointer", opacity: connecting ? 0.6 : 1 }}>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
                    <input
                      className="ch-form-input"
                      type="email"
                      autoComplete="off"
                      value={connEmail}
                      onChange={(e) => setConnEmail(e.target.value)}
                      placeholder="MultiTracks email"
                    />
                    <input
                      className="ch-form-input"
                      type="password"
                      autoComplete="new-password"
                      value={connPassword}
                      onChange={(e) => setConnPassword(e.target.value)}
                      placeholder="MultiTracks password"
                    />
                    <button onClick={connectMt} disabled={connecting} style={{ ...btnNeutral, alignSelf: "flex-start", padding: "7px 14px", cursor: connecting ? "default" : "pointer", opacity: connecting ? 0.6 : 1 }}>
                      {connecting ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                )}

                {connMsg && (
                  <p style={{ margin: "12px 0 0", fontSize: 12, color: /Connected|sync setlists|Disconnected/.test(connMsg) ? "#34c759" : ADMIN_RED }}>
                    {connMsg}
                  </p>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "16px 18px",
                  marginTop: 14,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                    Setlists from MultiTracks
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
                    Pull upcoming setlists from your MultiTracks account and create a chat for each one.
                    Runs automatically once a day; use this button to sync now.
                  </p>
                  {lastSynced && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                      Last synced {timeAgo(lastSynced)}
                    </p>
                  )}
                  {syncMsg && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: syncMsg.startsWith("Synced") ? "#34c759" : ADMIN_RED }}>
                      {syncMsg}
                    </p>
                  )}
                </div>
                <button
                  onClick={syncSetlists}
                  disabled={syncing}
                  style={{
                    ...btnNeutral,
                    flexShrink: 0,
                    marginTop: 2,
                    padding: "7px 14px",
                    cursor: syncing ? "default" : "pointer",
                    opacity: syncing ? 0.6 : 1,
                  }}
                >
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              </div>

              {/* Church branding */}
              <div
                style={{
                  padding: "16px 18px",
                  marginTop: 14,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                  Church branding
                </p>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
                  Set your community&apos;s name and logo. These appear in the sidebar so the chat looks like your church.
                </p>

                <label className="ch-form-label">Community name</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "4px 0 16px" }}>
                  <input
                    className="ch-form-input"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Grace Community Church"
                    style={{ flex: 1 }}
                  />
                  <button onClick={saveBrandName} disabled={savingBrand} style={{ ...btnNeutral, flexShrink: 0, padding: "7px 14px", cursor: savingBrand ? "default" : "pointer", opacity: savingBrand ? 0.6 : 1 }}>
                    Save
                  </button>
                </div>

                <label className="ch-form-label">Logo</label>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
                  <div
                    style={{
                      width: 52, height: 52, borderRadius: 10, flexShrink: 0,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                    }}
                  >
                    {brandLogo
                      ? <img src={brandLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>None</span>}
                  </div>
                  <label style={{ ...btnNeutral, padding: "7px 14px", cursor: savingBrand ? "default" : "pointer", opacity: savingBrand ? 0.6 : 1, display: "inline-block" }}>
                    {savingBrand ? "Uploading…" : "Upload logo"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={savingBrand}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
                    />
                  </label>
                </div>

                {brandMsg && (
                  <p style={{ margin: "12px 0 0", fontSize: 12, color: /updated|Saved/.test(brandMsg) ? "#34c759" : ADMIN_RED }}>
                    {brandMsg}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
