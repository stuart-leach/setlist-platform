"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "./UserAvatar";
import type { Organization, Profile } from "@/lib/supabase/types";

const RED = "#ff453a";
const GREEN = "#34c759";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const btn: React.CSSProperties = {
  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, padding: "7px 14px",
  background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", cursor: "pointer",
};
const card: React.CSSProperties = {
  padding: "16px 18px", marginTop: 14, borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)",
};

interface Member {
  role: string;
  user_id: string;
  joined_at: string;
  profiles: Profile;
}

interface ChannelRow {
  id: string;
  slug: string;
  name: string;
  channel_type: string | null;
  required_role: string[] | null;
  mt_setlist_id: number | null;
}

interface OrgRole {
  id: string;
  key: string;
  label: string;
}

interface Props {
  org: Organization;
  myRole: string;
  isPlatformAdmin?: boolean;
  roleChannelsEnabled: boolean;
  setlistsLastSyncedAt: string | null;
  members: Member[];
  channels: ChannelRow[];
  roles: OrgRole[];
  memberRoles: { user_id: string; role_key: string }[];
  inviteToken: string | null;
  mtConnectedEmail: string | null;
  mtConnectedAt: string | null;
  mtLastError: string | null;
}

export default function OrgAdminHub(props: Props) {
  const { org } = props;
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<"settings" | "channels" | "members">("settings");
  const isOwner = props.myRole === "owner";

  // ── Channels management ──────────────────────────────────────────────────────
  const [channels, setChannels] = useState<ChannelRow[]>(props.channels);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newChName, setNewChName] = useState("");
  const [chErr, setChErr] = useState<string | null>(null);

  const general = channels.filter((c) => (c.channel_type ?? "general") === "general");
  const setlistCh = channels.filter((c) => c.channel_type === "setlist");
  const roleCh = channels.filter((c) => c.channel_type === "role" || (c.required_role?.length ?? 0) > 0);

  function slugify(s: string) {
    return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
  }
  async function renameChannel(id: string) {
    const name = editName.trim();
    setEditingId(null);
    if (!name) return;
    setChannels((cs) => cs.map((c) => c.id === id ? { ...c, name } : c));
    await supabase.from("channels").update({ name }).eq("id", id);
    router.refresh();
  }
  async function deleteChannel(id: string) {
    setChannels((cs) => cs.filter((c) => c.id !== id));
    await supabase.from("channels").delete().eq("id", id);
    router.refresh();
  }
  async function addGeneralChannel() {
    const name = newChName.trim();
    if (!name) return;
    setChErr(null);
    const base = slugify(name) || "channel";
    const existing = new Set(channels.map((c) => c.slug));
    let slug = base;
    for (let i = 2; existing.has(slug); i++) slug = `${base}-${i}`;
    const { data, error } = await supabase.from("channels")
      .insert({ name, slug, channel_type: "general", required_role: null, locked: false, org_id: org.id })
      .select().single();
    if (error) { setChErr(error.message); return; }
    if (data) setChannels((cs) => [...cs, data as ChannelRow]);
    setNewChName("");
    router.refresh();
  }

  // ── Roles ────────────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<OrgRole[]>(props.roles);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [roleErr, setRoleErr] = useState<string | null>(null);
  // user_id -> set of role_key
  const [memberRoleMap, setMemberRoleMap] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const r of props.memberRoles) (m[r.user_id] ??= []).push(r.role_key);
    return m;
  });

  async function addRole() {
    const label = newRoleLabel.trim();
    if (!label) return;
    setRoleErr(null);
    const key = slugify(label) || "role";
    if (roles.some((r) => r.key === key)) { setRoleErr("That role already exists."); return; }
    const { data, error } = await supabase.from("org_roles")
      .insert({ org_id: org.id, key, label }).select().single();
    if (error) { setRoleErr(error.message); return; }
    if (data) setRoles((rs) => [...rs, data as OrgRole]);
    setNewRoleLabel("");
    router.refresh();
  }
  async function removeRole(role: OrgRole) {
    setRoles((rs) => rs.filter((r) => r.id !== role.id));
    await supabase.from("org_roles").delete().eq("id", role.id);
    // Also clear it from any member assignments.
    await supabase.from("org_member_roles").delete().eq("org_id", org.id).eq("role_key", role.key);
    setMemberRoleMap((m) => {
      const next: Record<string, string[]> = {};
      for (const [uid, keys] of Object.entries(m)) next[uid] = keys.filter((k) => k !== role.key);
      return next;
    });
    router.refresh();
  }
  async function toggleMemberRole(userId: string, key: string) {
    const has = (memberRoleMap[userId] ?? []).includes(key);
    setMemberRoleMap((m) => ({ ...m, [userId]: has ? (m[userId] ?? []).filter((k) => k !== key) : [...(m[userId] ?? []), key] }));
    if (has) {
      await supabase.from("org_member_roles").delete().eq("org_id", org.id).eq("user_id", userId).eq("role_key", key);
    } else {
      await supabase.from("org_member_roles").insert({ org_id: org.id, user_id: userId, role_key: key });
    }
    router.refresh();
  }

  const channelRow = (c: ChannelRow) => (
    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>#</span>
      {editingId === c.id ? (
        <input className="ch-form-input" autoFocus value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") renameChannel(c.id); if (e.key === "Escape") setEditingId(null); }}
          onBlur={() => renameChannel(c.id)} style={{ flex: 1, padding: "4px 8px" }} />
      ) : (
        <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
      )}
      {c.required_role?.length ? (
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.required_role.join(", ")}</span>
      ) : null}
      <button onClick={() => { setEditingId(c.id); setEditName(c.name); }} style={{ ...btn, background: "transparent", padding: "4px 8px" }}>Rename</button>
      <button onClick={() => deleteChannel(c.id)} style={{ ...btn, background: "transparent", color: RED, padding: "4px 8px" }}>Delete</button>
    </div>
  );

  // Branding
  const [name, setName] = useState(org.name);
  const [logo, setLogo] = useState<string | null>(org.logo_url);
  const [brandMsg, setBrandMsg] = useState<string | null>(null);
  const [brandBusy, setBrandBusy] = useState(false);

  async function saveName() {
    setBrandBusy(true); setBrandMsg(null);
    const { error } = await supabase.from("organizations").update({ name: name.trim() || org.name }).eq("id", org.id);
    setBrandBusy(false);
    setBrandMsg(error ? error.message : "Saved.");
    if (!error) router.refresh();
  }
  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) { setBrandMsg("Please choose an image file."); return; }
    if (file.size > 2 * 1024 * 1024) { setBrandMsg("Logo must be under 2 MB."); return; }
    setBrandBusy(true); setBrandMsg(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${org.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (upErr) { setBrandMsg(upErr.message); setBrandBusy(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("branding").getPublicUrl(path);
    const { error } = await supabase.from("organizations").update({ logo_url: publicUrl }).eq("id", org.id);
    setBrandBusy(false);
    if (error) { setBrandMsg(error.message); return; }
    setLogo(publicUrl); setBrandMsg("Logo updated."); router.refresh();
  }

  // Role channels toggle
  const [roleOn, setRoleOn] = useState(props.roleChannelsEnabled);
  async function toggleRole() {
    const next = !roleOn;
    setRoleOn(next);
    await supabase.from("org_settings").update({ role_channels_enabled: next }).eq("org_id", org.id);
    router.refresh();
  }

  // MultiTracks connection
  const [mtEmail, setMtEmail] = useState(props.mtConnectedEmail);
  const [mtAt, setMtAt] = useState(props.mtConnectedAt);
  const [connEmail, setConnEmail] = useState("");
  const [connPw, setConnPw] = useState("");
  const [connBusy, setConnBusy] = useState(false);
  const [connMsg, setConnMsg] = useState<string | null>(props.mtLastError ? `Last sync error: ${props.mtLastError}` : null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(props.setlistsLastSyncedAt);

  async function connect() {
    if (!connEmail.trim() || !connPw) { setConnMsg("Enter your MultiTracks email and password."); return; }
    setConnBusy(true); setConnMsg(null);
    try {
      const res = await fetch("/api/multitracks/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org: org.id, username: connEmail.trim(), password: connPw }),
      });
      const body = await res.json();
      if (!res.ok) setConnMsg(body.error || "Could not connect.");
      else { setMtEmail(body.email); setMtAt(new Date().toISOString()); setConnEmail(""); setConnPw(""); setConnMsg("Connected. You can sync setlists now."); router.refresh(); }
    } catch { setConnMsg("Could not reach the server."); } finally { setConnBusy(false); }
  }
  async function disconnect() {
    setConnBusy(true); setConnMsg(null);
    try { await fetch(`/api/multitracks/connect?org=${org.id}`, { method: "DELETE" }); setMtEmail(null); setMtAt(null); setConnMsg("Disconnected."); router.refresh(); }
    finally { setConnBusy(false); }
  }
  async function syncNow() {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch(`/api/setlists/sync?org=${org.id}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) setSyncMsg(body.error || "Sync failed.");
      else { setSyncMsg(`Synced ${body.total} setlist${body.total === 1 ? "" : "s"} — ${body.created} new, ${body.updated} updated.`); setLastSync(new Date().toISOString()); router.refresh(); }
    } catch { setSyncMsg("Sync failed — could not reach the server."); } finally { setSyncing(false); }
  }

  // Members
  const [members, setMembers] = useState(props.members);
  const [token, setToken] = useState(props.inviteToken);
  const [copied, setCopied] = useState(false);
  const inviteUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${token}` : "";

  async function changeRole(userId: string, role: string) {
    setMembers((m) => m.map((x) => x.user_id === userId ? { ...x, role } : x));
    await supabase.from("organization_members").update({ role }).eq("org_id", org.id).eq("user_id", userId);
    router.refresh();
  }
  async function removeMember(userId: string) {
    setMembers((m) => m.filter((x) => x.user_id !== userId));
    await supabase.from("organization_members").delete().eq("org_id", org.id).eq("user_id", userId);
    router.refresh();
  }
  async function regenInvite() {
    if (token) await supabase.from("organization_invites").delete().eq("org_id", org.id);
    const { data } = await supabase.from("organization_invites").insert({ org_id: org.id }).select("token").single();
    if (data) setToken(data.token);
  }
  function copyInvite() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
    <div style={{ padding: "28px 32px", maxWidth: 760, margin: "0 auto", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{org.name} — Settings</h1>
        {props.isPlatformAdmin && (
          <a href="/admin" style={{ fontSize: 13, color: "#ff453a", textDecoration: "none", whiteSpace: "nowrap" }}>
            Platform moderation →
          </a>
        )}
      </div>
      <div style={{ display: "flex", gap: 18, borderBottom: "1px solid rgba(255,255,255,0.1)", margin: "18px 0 8px" }}>
        {(["settings", "channels", "members"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", color: tab === t ? "#fff" : "rgba(255,255,255,0.5)",
            borderBottom: tab === t ? "2px solid #fff" : "2px solid transparent",
            padding: "8px 2px", fontSize: 14, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
          }}>{t}{t === "members" ? ` (${members.length})` : t === "channels" ? ` (${channels.length})` : ""}</button>
        ))}
      </div>

      {tab === "settings" && (
        <div>
          {/* Branding */}
          <div style={card}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Branding</p>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
              Your organization&apos;s name and logo appear in the sidebar.
            </p>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Name</label>
            <div style={{ display: "flex", gap: 10, margin: "4px 0 16px" }}>
              <input className="ch-form-input" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
              <button onClick={saveName} disabled={brandBusy} style={btn}>Save</button>
            </div>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Logo</label>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {logo ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>None</span>}
              </div>
              <label style={{ ...btn, display: "inline-block" }}>
                {brandBusy ? "Uploading…" : "Upload logo"}
                <input type="file" accept="image/*" hidden disabled={brandBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
              </label>
            </div>
            {brandMsg && <p style={{ margin: "12px 0 0", fontSize: 12, color: /updated|Saved/.test(brandMsg) ? GREEN : RED }}>{brandMsg}</p>}
          </div>

          {/* Role channels */}
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Role channels</p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Show role-specific channels in the sidebar. When off, the section is hidden and those channels can&apos;t be opened.</p>
            </div>
            <button onClick={toggleRole} style={{ position: "relative", width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", background: roleOn ? GREEN : "rgba(255,255,255,0.2)" }}>
              <span style={{ position: "absolute", top: 3, left: roleOn ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
            </button>
          </div>

          {/* MultiTracks connection */}
          <div style={card}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>MultiTracks account</p>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Connect a MultiTracks login so this org can pull its setlists. We store only a secure session token — never the password.</p>
            {mtEmail ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, color: GREEN, fontWeight: 600 }}>Connected as {mtEmail}</p>
                  {mtAt && <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Connected {timeAgo(mtAt)}</p>}
                </div>
                <button onClick={disconnect} disabled={connBusy} style={btn}>Disconnect</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
                <input className="ch-form-input" type="email" autoComplete="off" value={connEmail} onChange={(e) => setConnEmail(e.target.value)} placeholder="MultiTracks email" />
                <input className="ch-form-input" type="password" autoComplete="new-password" value={connPw} onChange={(e) => setConnPw(e.target.value)} placeholder="MultiTracks password" />
                <button onClick={connect} disabled={connBusy} style={{ ...btn, alignSelf: "flex-start" }}>{connBusy ? "Connecting…" : "Connect"}</button>
              </div>
            )}
            {connMsg && <p style={{ margin: "12px 0 0", fontSize: 12, color: /Connected|sync setlists|Disconnected/.test(connMsg) ? GREEN : RED }}>{connMsg}</p>}
          </div>

          {/* Setlist sync */}
          <div style={{ ...card, display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Setlists from MultiTracks</p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Pull upcoming setlists and create a chat for each. Runs automatically once a day.</p>
              {lastSync && <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Last synced {timeAgo(lastSync)}</p>}
              {syncMsg && <p style={{ margin: "8px 0 0", fontSize: 12, color: syncMsg.startsWith("Synced") ? GREEN : RED }}>{syncMsg}</p>}
            </div>
            <button onClick={syncNow} disabled={syncing} style={{ ...btn, marginTop: 2 }}>{syncing ? "Syncing…" : "Sync now"}</button>
          </div>
        </div>
      )}

      {tab === "channels" && (
        <div>
          <div style={card}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>General channels</p>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Shown in the General section of the sidebar.</p>
            {general.map(channelRow)}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <input className="ch-form-input" value={newChName} onChange={(e) => { setNewChName(e.target.value); setChErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") addGeneralChannel(); }} placeholder="New channel name" style={{ flex: 1 }} />
              <button onClick={addGeneralChannel} style={btn}>Add</button>
            </div>
            {chErr && <p style={{ margin: "8px 0 0", fontSize: 12, color: RED }}>{chErr}</p>}
          </div>

          <div style={card}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Setlist channels</p>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Auto-created from MultiTracks. A synced setlist you delete will return on the next sync if it&apos;s still upcoming.</p>
            {setlistCh.length ? setlistCh.map(channelRow) : <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>None yet.</p>}
          </div>

          <div style={card}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Role channels</p>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Visible only to members with the matching role. Create one from the sidebar Role Channels <strong>+</strong>.</p>
            {roleCh.length ? roleCh.map(channelRow) : <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>None yet.</p>}
          </div>

          <div style={card}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Roles</p>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Define the roles you can assign to members and gate channels by. Assign them to people on the Members tab.</p>
            {roles.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ flex: 1, fontSize: 14 }}>{r.label}</span>
                <button onClick={() => removeRole(r)} style={{ ...btn, background: "transparent", color: RED, padding: "4px 8px" }}>Remove</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <input className="ch-form-input" value={newRoleLabel} onChange={(e) => { setNewRoleLabel(e.target.value); setRoleErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") addRole(); }} placeholder="New role (e.g. Vocalists)" style={{ flex: 1 }} />
              <button onClick={addRole} style={btn}>Add role</button>
            </div>
            {roleErr && <p style={{ margin: "8px 0 0", fontSize: 12, color: RED }}>{roleErr}</p>}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div>
          <div style={card}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Invite link</p>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Anyone with this link can join {org.name}.</p>
            {token ? (
              <div style={{ display: "flex", gap: 10 }}>
                <input className="ch-form-input" readOnly value={inviteUrl} style={{ flex: 1 }} />
                <button onClick={copyInvite} style={btn}>{copied ? "Copied!" : "Copy"}</button>
                <button onClick={regenInvite} style={btn}>Regenerate</button>
              </div>
            ) : (
              <button onClick={regenInvite} style={btn}>Create invite link</button>
            )}
          </div>

          <div style={card}>
            <p style={{ margin: "0 0 12px", fontWeight: 600 }}>Members</p>
            {members.map((m) => {
              const assigned = memberRoleMap[m.user_id] ?? [];
              return (
                <div key={m.user_id} style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <UserAvatar profile={m.profiles} size={28} />
                    <span style={{ flex: 1, fontSize: 14 }}>{m.profiles?.display_name ?? m.profiles?.username}</span>
                    {m.role === "owner" ? (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>owner</span>
                    ) : isOwner || props.myRole === "admin" ? (
                      <>
                        <select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} className="ch-form-input" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}>
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                          {isOwner && <option value="owner">owner</option>}
                        </select>
                        <button onClick={() => removeMember(m.user_id)} style={{ ...btn, color: RED, background: "transparent" }}>Remove</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{m.role}</span>
                    )}
                  </div>
                  {roles.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, paddingLeft: 40 }}>
                      {roles.map((r) => {
                        const on = assigned.includes(r.key);
                        return (
                          <button key={r.key} type="button" onClick={() => toggleMemberRole(m.user_id, r.key)}
                            style={{ border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.2)"}`, background: on ? "rgba(255,255,255,0.12)" : "transparent", color: on ? "#fff" : "rgba(255,255,255,0.55)", borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
