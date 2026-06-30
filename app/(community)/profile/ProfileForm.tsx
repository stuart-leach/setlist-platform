"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/UserAvatar";
import AvatarCropModal from "@/components/AvatarCropModal";
import type { Profile } from "@/lib/supabase/types";

interface OrgRoleData {
  orgId: string;
  orgName: string;
  roles: { key: string; label: string }[];
  assigned: string[];
}

interface Props {
  profile: Profile;
  isPreview: boolean;
  orgRoleData: OrgRoleData[];
  authEmail: string | null;
}

export default function ProfileForm({ profile, isPreview, orgRoleData, authEmail }: Props) {
  const router = useRouter();
  // assignments per org: orgId -> role keys the user holds
  const [orgAssignments, setOrgAssignments] = useState<Record<string, string[]>>(
    () => Object.fromEntries(orgRoleData.map((o) => [o.orgId, o.assigned]))
  );
  const [form, setForm] = useState({
    display_name: profile.display_name ?? "",
    username: profile.username ?? "",
    job_title: profile.job_title ?? "",
    location: profile.location ?? "",
    bio: profile.bio ?? "",
    avatar_url: profile.avatar_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // ── Password change state ────────────────────────────────────────────────────
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (pwNew.length < 6) { setPwError("Password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError("Passwords don't match."); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    setPwSaving(false);
    if (error) {
      setPwError(error.message);
    } else {
      setPwSaved(true);
      setPwNew("");
      setPwConfirm("");
      setTimeout(() => setPwSaved(false), 3000);
    }
  }

  function set(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setSaved(false);
    setError("");
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected after cancel
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCropDone(blob: Blob) {
    setCropSrc(null);
    const objectUrl = URL.createObjectURL(blob);
    setAvatarPreview(objectUrl);

    if (isPreview) return;

    const path = `${profile.id}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

    if (uploadError) {
      setError("Avatar upload failed: " + uploadError.message);
      return;
    }

    // Bust the CDN cache by appending a timestamp query param
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    set("avatar_url", `${urlData.publicUrl}?t=${Date.now()}`);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (isPreview) return;

    setSaving(true);
    setError("");

    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name || null,
        username: form.username,
        job_title: form.job_title || null,
        location: form.location || null,
        bio: form.bio || null,
        avatar_url: form.avatar_url || null,
      })
      .eq("id", profile.id);

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Refresh the server component tree so sidebar role channels update immediately
      router.refresh();
    }
  }

  async function toggleOrgRole(orgId: string, roleKey: string) {
    const current = orgAssignments[orgId] ?? [];
    const hasRole = current.includes(roleKey);
    setOrgAssignments((prev) => ({
      ...prev,
      [orgId]: hasRole ? current.filter((k) => k !== roleKey) : [...current, roleKey],
    }));
    if (isPreview) return;
    if (hasRole) {
      await supabase.from("org_member_roles").delete().eq("org_id", orgId).eq("user_id", profile.id).eq("role_key", roleKey);
    } else {
      await supabase.from("org_member_roles").insert({ org_id: orgId, user_id: profile.id, role_key: roleKey });
    }
    router.refresh();
  }

  const displayProfile = {
    ...profile,
    display_name: form.display_name || profile.username,
    username: form.username,
    avatar_url: avatarPreview,
  };

  return (
    <>
    {cropSrc && (
      <AvatarCropModal
        imageSrc={cropSrc}
        onCancel={() => setCropSrc(null)}
        onCrop={handleCropDone}
      />
    )}
    <form onSubmit={handleSave} className="profile-form">
      {/* Avatar section */}
      <div className="profile-avatar-section">
        <div className="profile-avatar-wrap">
          <UserAvatar profile={displayProfile} size={80} />
          <button
            type="button"
            className="profile-avatar-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Change photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>
        <div className="profile-avatar-info">
          <p className="profile-name-preview">
            {form.display_name || form.username || "Your Name"}
          </p>
          {form.job_title && (
            <p className="profile-title-preview">{form.job_title}</p>
          )}
          {form.location && (
            <p className="profile-location-preview">📍 {form.location}</p>
          )}
        </div>
      </div>

      <div className="profile-divider" />

      {/* Fields */}
      <div className="profile-fields">
        <div className="profile-row">
          <div className="profile-field">
            <label className="profile-label">Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              placeholder="Your full name"
              className="profile-input"
              maxLength={60}
            />
          </div>
          <div className="profile-field">
            <label className="profile-label">Username</label>
            <div className="profile-input-prefix-wrap">
              <span className="profile-input-prefix">@</span>
              <input
                type="text"
                value={form.username}
                onChange={(e) => set("username", e.target.value.replace(/[^a-z0-9_]/g, "").toLowerCase())}
                placeholder="username"
                className="profile-input profile-input-prefixed"
                maxLength={30}
                required
              />
            </div>
          </div>
        </div>

        <div className="profile-row">
          <div className="profile-field">
            <label className="profile-label">Job Title</label>
            <input
              type="text"
              value={form.job_title}
              onChange={(e) => set("job_title", e.target.value)}
              placeholder="e.g. Worship Leader, Sound Engineer"
              className="profile-input"
              maxLength={80}
            />
          </div>
          <div className="profile-field">
            <label className="profile-label">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Nashville, TN"
              className="profile-input"
              maxLength={80}
            />
          </div>
        </div>

        <div className="profile-field profile-field-full">
          <label className="profile-label">Bio</label>
          <textarea
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            placeholder="Tell the community a bit about yourself…"
            className="profile-input profile-textarea"
            rows={4}
            maxLength={300}
          />
          <p className="profile-char-count">{form.bio.length} / 300</p>
        </div>
      </div>

      {orgRoleData.length > 0 && (
        <>
          <div className="profile-divider" />
          <div className="profile-fields">
            <div className="profile-field profile-field-full">
              <label className="profile-label">Your Roles</label>
              <p className="profile-roles-hint">Select the roles that apply to you in each organization — each role unlocks its dedicated channels. These are the same roles your admins manage.</p>
              {orgRoleData.map((org) => (
                <div key={org.orgId} style={{ marginTop: 14 }}>
                  {orgRoleData.length > 1 && (
                    <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", margin: "0 0 6px" }}>{org.orgName}</p>
                  )}
                  {org.roles.length === 0 ? (
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>No roles defined yet in {org.orgName}.</p>
                  ) : (
                    <div className="profile-roles-grid">
                      {org.roles.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`profile-role-pill${(orgAssignments[org.orgId] ?? []).includes(opt.key) ? " active" : ""}`}
                          onClick={() => toggleOrgRole(org.orgId, opt.key)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="profile-divider" />

      {/* Account & Security */}
      <div className="profile-section-heading">Account &amp; Security</div>
      <div className="profile-fields">
        {authEmail && (
          <div className="profile-field profile-field-full">
            <label className="profile-label">Email address</label>
            <div className="profile-email-display">{authEmail}</div>
          </div>
        )}

        <div className="profile-field profile-field-full">
          <label className="profile-label">Change password</label>
          <div className="profile-password-row">
            <input
              type="password"
              value={pwNew}
              onChange={(e) => { setPwNew(e.target.value); setPwError(""); setPwSaved(false); }}
              placeholder="New password"
              className="profile-input"
              minLength={6}
              disabled={isPreview}
            />
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => { setPwConfirm(e.target.value); setPwError(""); setPwSaved(false); }}
              placeholder="Confirm new password"
              className="profile-input"
              minLength={6}
              disabled={isPreview}
            />
            <button
              type="button"
              onClick={handlePasswordChange}
              disabled={pwSaving || isPreview || !pwNew}
              className="profile-pw-btn"
            >
              {pwSaving ? "Saving…" : "Update password"}
            </button>
          </div>
          {pwError && <p className="profile-pw-error">{pwError}</p>}
          {pwSaved && <p className="profile-pw-saved">✓ Password updated</p>}
        </div>
      </div>

      {error && <p className="profile-error">{error}</p>}

      <div className="profile-footer">
        {saved && <span className="profile-saved">✓ Saved</span>}
        <button
          type="submit"
          disabled={saving || isPreview}
          className="profile-save-btn"
          title={isPreview ? "Sign in to save" : undefined}
        >
          {saving ? "Saving…" : isPreview ? "Sign in to save" : "Save changes"}
        </button>
      </div>
    </form>
    </>
  );
}
