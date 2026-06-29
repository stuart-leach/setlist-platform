"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OrgSwitcher from "./OrgSwitcher";
import UserAvatar from "./UserAvatar";
import type { Channel, Organization, Profile } from "@/lib/supabase/types";

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

interface NewChannelForm {
  name: string;
  slug: string;
  description: string;
  locked: boolean;
}

const BLANK: NewChannelForm = { name: "", slug: "", description: "", locked: false };

interface OrgSettingsForm {
  name: string;
  slug: string;
}

interface Props {
  org: Organization;
  channels: Channel[];
  currentUser: Profile;
  allOrgs: Organization[];
  memberCount: number;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

export default function OrgSidebar({ org, channels, currentUser, allOrgs, memberCount, collapsed, onCollapse, onExpand }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const isAdmin = currentUser.role === "admin";
  const basePath = `/org/${org.slug}/channels`;

  // New channel modal
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [form, setForm] = useState<NewChannelForm>(BLANK);
  const [formError, setFormError] = useState("");

  // Org settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<OrgSettingsForm>({ name: org.name, slug: org.slug });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [orgInvite, setOrgInvite] = useState<{ token: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Sign-out confirmation
  const [showSignOut, setShowSignOut] = useState(false);

  async function openSettings() {
    setSettingsForm({ name: org.name, slug: org.slug });
    setSettingsError("");
    setInviteCopied(false);
    setShowSettings(true);
    // Fetch current invite link
    const { data } = await supabase
      .from("organization_invites")
      .select("token")
      .eq("org_id", org.id)
      .single();
    setOrgInvite(data ?? null);
  }

  async function saveSettings() {
    const name = settingsForm.name.trim();
    const slug = settingsForm.slug.trim() || toSlug(name);
    if (!name) { setSettingsError("Name is required."); return; }
    if (!slug)  { setSettingsError("Could not generate a slug."); return; }
    const slugChanged = slug !== org.slug;
    setSettingsSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ name, slug })
      .eq("id", org.id);
    setSettingsSaving(false);
    if (error) { setSettingsError(error.message); return; }
    setShowSettings(false);
    if (slugChanged) {
      router.push(`/org/${slug}`);
    } else {
      router.refresh();
    }
  }

  async function generateInvite() {
    setInviteLoading(true);
    await supabase.from("organization_invites").delete().eq("org_id", org.id);
    const { data } = await supabase
      .from("organization_invites")
      .insert({ org_id: org.id })
      .select("token")
      .single();
    setOrgInvite(data ?? null);
    setInviteLoading(false);
    setInviteCopied(false);
  }

  function copyInviteLink() {
    if (!orgInvite) return;
    navigator.clipboard.writeText(`${window.location.origin}/join/${orgInvite.token}`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  async function createChannel() {
    const name = form.name.trim();
    if (!name) { setFormError("Channel name is required."); return; }
    const slug = form.slug.trim() || toSlug(name);
    if (!slug) { setFormError("Could not generate a valid slug."); return; }

    const { data, error } = await supabase
      .from("channels")
      .insert({ name, slug, description: form.description.trim() || null, locked: form.locked, org_id: org.id })
      .select()
      .single();

    if (error) { setFormError(error.message); return; }
    setShowNewChannel(false);
    setForm(BLANK);
    router.refresh();
    if (data) router.push(`${basePath}/${slug}`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const inviteUrl = orgInvite ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${orgInvite.token}` : "";

  // ── Collapsed mini rail ───────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="sidebar sidebar-mini">
        <div className="mini-top">
          <button className="mini-expand-btn" onClick={onExpand} title="Expand sidebar" aria-label="Expand sidebar">
            <span className="org-mini-initial">{org.name[0].toUpperCase()}</span>
          </button>
        </div>
        <nav className="mini-nav">
          <div className="mini-nav-wrap">
            <div className="mini-nav-item">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M8 2L6 18M14 2L12 18M3 7.5H18M3 12.5H18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
              <span className="mini-nav-label">Channels</span>
            </div>
            <div className="mini-flyout">
              <p className="mini-flyout-heading">{org.name}</p>
              {channels.map((ch) => (
                <Link key={ch.id} href={`${basePath}/${ch.slug}`} className={`mini-flyout-item${pathname === `${basePath}/${ch.slug}` ? " active" : ""}`}>
                  <span className="mini-flyout-hash">#</span>{ch.name}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <div className="mini-footer">
          <Link href="/profile" className="mini-avatar-btn" title="Your profile" aria-label="Your profile">
            <UserAvatar profile={currentUser} size={28} />
          </Link>
        </div>
      </aside>
    );
  }

  // ── Full sidebar ──────────────────────────────────────────────────────────
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <OrgSwitcher orgs={allOrgs} />
          <button className="sidebar-collapse-btn" onClick={onCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="org-workspace-header">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="org-workspace-name">{org.name}</span>
              {isAdmin && (
                <button className="org-settings-btn" onClick={openSettings} title="Organization settings" aria-label="Organization settings">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
                  </svg>
                </button>
              )}
            </div>
            <span className="org-workspace-meta">{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
          </div>

          <div className="sidebar-section-row">
            <span className="sidebar-section-label">Channels</span>
            {isAdmin && (
              <button
                className="sidebar-new-dm-btn"
                onClick={() => { setForm(BLANK); setFormError(""); setShowNewChannel(true); }}
                title="New channel"
                aria-label="New channel"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {channels.length === 0 && (
            <p className="org-empty-channels">No channels yet{isAdmin ? " — create one above." : "."}</p>
          )}

          {channels.map((ch) => {
            const active = pathname === `${basePath}/${ch.slug}`;
            return (
              <Link key={ch.id} href={`${basePath}/${ch.slug}`} className={`sidebar-item${active ? " active" : ""}`}>
                {ch.locked ? (
                  <svg className="sidebar-lock" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="7" width="10" height="7" rx="1.5"/>
                    <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
                  </svg>
                ) : (
                  <span className="sidebar-hash">#</span>
                )}
                {ch.name}
              </Link>
            );
          })}

          <div className="sidebar-separator" style={{ marginTop: "auto" }} />
          <Link href="/channels/general" className="org-back-link">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8L10 13"/>
            </svg>
            Back to Community
          </Link>
        </nav>

        <div className="sidebar-footer">
          <Link href="/profile" className="sidebar-footer-name" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <UserAvatar profile={currentUser} size={26} />
            <span>{currentUser.display_name ?? currentUser.username}</span>
          </Link>
          <button className="sidebar-signout" onClick={() => setShowSignOut(true)} title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Org settings modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-box modal-box--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Organization Settings</h2>
              <button className="modal-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Name + slug */}
              <div className="ch-form-row">
                <div className="ch-form-field" style={{ flex: 2 }}>
                  <label className="ch-form-label">Organization Name</label>
                  <input
                    className="ch-form-input"
                    value={settingsForm.name}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="ch-form-field" style={{ flex: 1 }}>
                  <label className="ch-form-label">
                    URL Slug <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(changes URL)</span>
                  </label>
                  <div className="ch-form-slug-wrap">
                    <span className="ch-form-slug-prefix">/org/</span>
                    <input
                      className="ch-form-input ch-form-input-slug"
                      value={settingsForm.slug}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                    />
                  </div>
                </div>
              </div>

              {/* Invite link */}
              <div className="ch-form-field">
                <label className="ch-form-label">Invite Link</label>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
                  Anyone with this link who is logged in can join the organization. The URL slug is not public — users must be logged in to access the workspace.
                </p>
                {orgInvite ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      readOnly
                      value={inviteUrl}
                      className="ch-form-input"
                      style={{ flex: 1, color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "monospace" }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button className="ch-btn-primary" onClick={copyInviteLink} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      {inviteCopied ? "Copied!" : "Copy"}
                    </button>
                    <button className="ch-btn-ghost" onClick={generateInvite} disabled={inviteLoading} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      {inviteLoading ? "…" : "Regenerate"}
                    </button>
                  </div>
                ) : (
                  <button className="ch-btn-ghost" onClick={generateInvite} disabled={inviteLoading}>
                    {inviteLoading ? "Generating…" : "Generate invite link"}
                  </button>
                )}
              </div>

              {settingsError && <p className="ch-form-error">{settingsError}</p>}

              <div className="ch-form-actions">
                <button className="ch-btn-primary" onClick={saveSettings} disabled={settingsSaving}>
                  {settingsSaving ? "Saving…" : "Save Changes"}
                </button>
                <button className="ch-btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New channel modal */}
      {showNewChannel && (
        <div className="modal-overlay" onClick={() => setShowNewChannel(false)}>
          <div className="modal-box modal-box--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Channel — {org.name}</h2>
              <button className="modal-close" onClick={() => setShowNewChannel(false)}>×</button>
            </div>
            <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="ch-form-row">
                <div className="ch-form-field" style={{ flex: 2 }}>
                  <label className="ch-form-label">Name</label>
                  <input
                    className="ch-form-input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: toSlug(e.target.value) }))}
                    placeholder="e.g. team-updates"
                    autoFocus
                  />
                </div>
                <div className="ch-form-field" style={{ flex: 1 }}>
                  <label className="ch-form-label">Slug</label>
                  <div className="ch-form-slug-wrap">
                    <span className="ch-form-slug-prefix">/channels/</span>
                    <input
                      className="ch-form-input ch-form-input-slug"
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                    />
                  </div>
                </div>
              </div>
              <div className="ch-form-field">
                <label className="ch-form-label">Description <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                <input
                  className="ch-form-input"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What's this channel for?"
                />
              </div>
              <div className="ch-form-field">
                <label className="ch-form-label">Posting</label>
                <div className="ch-form-radios">
                  <label className="ch-radio">
                    <input type="radio" checked={!form.locked} onChange={() => setForm((f) => ({ ...f, locked: false }))} />
                    <span>Open — all members can post</span>
                  </label>
                  <label className="ch-radio">
                    <input type="radio" checked={form.locked} onChange={() => setForm((f) => ({ ...f, locked: true }))} />
                    <span>Locked — admins only</span>
                  </label>
                </div>
              </div>
              {formError && <p className="ch-form-error">{formError}</p>}
              <div className="ch-form-actions">
                <button className="ch-btn-primary" onClick={createChannel}>Create Channel</button>
                <button className="ch-btn-ghost" onClick={() => setShowNewChannel(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sign out confirmation */}
      {showSignOut && (
        <div className="modal-overlay" onClick={() => setShowSignOut(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h2 className="modal-title">Sign out?</h2>
              <button className="modal-close" onClick={() => setShowSignOut(false)}>×</button>
            </div>
            <div style={{ padding: "16px 20px 20px", display: "flex", gap: 8 }}>
              <button className="ch-btn-primary" onClick={signOut}>Sign out</button>
              <button className="ch-btn-ghost" onClick={() => setShowSignOut(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
