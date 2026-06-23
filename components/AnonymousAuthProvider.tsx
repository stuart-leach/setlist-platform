"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ROLES = [
  { value: "worship_leader",      label: "Worship Leader" },
  { value: "band_member",         label: "Band Member" },
  { value: "vocalist",            label: "Vocalist" },
  { value: "music_director",      label: "Music Director" },
  { value: "production_director", label: "Production Director" },
];

export default function AnonymousAuthProvider({
  userId,
  displayName,
  hasRoles,
  children,
}: {
  userId: string;
  displayName: string | null;
  hasRoles: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();

  // Show the welcome modal if the user has no community roles yet,
  // or if they somehow have no display name (e.g. SSO with incomplete profile).
  const [showPrompt, setShowPrompt] = useState(false);
  const [name, setName] = useState(displayName ?? "");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasRoles || !displayName) {
      setShowPrompt(true);
    }
  }, [hasRoles, displayName]);

  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || selectedRoles.length === 0) return;
    setSaving(true);

    const username = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "_") || `user_${userId.slice(0, 8)}`;
    await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: trimmed, username }, { onConflict: "id" });

    await supabase
      .from("community_roles")
      .insert(selectedRoles.map((role) => ({ user_id: userId, role })));

    setSaving(false);
    setShowPrompt(false);
    router.refresh();
  }

  const canSubmit = name.trim().length > 0 && selectedRoles.length > 0 && !saving;

  return (
    <>
      {children}
      {showPrompt && (
        <div className="name-prompt-overlay">
          <div className="name-prompt-card">
            <div className="name-prompt-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="MultiTracks" style={{ height: 22, width: "auto", opacity: 0.9 }} />
            </div>

            <form onSubmit={handleSubmit}>
              {!displayName && (
                <>
                  <div className="name-prompt-section">
                    <div className="name-prompt-title">Welcome to the community!</div>
                    <div className="name-prompt-sub">What should we call you? This is how your name will appear in messages and DMs.</div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="name-prompt-input"
                      autoFocus
                      maxLength={40}
                    />
                  </div>
                  <div className="name-prompt-divider" />
                </>
              )}

              <div className="name-prompt-section">
                {displayName ? (
                  <>
                    <div className="name-prompt-title">Welcome, {displayName}!</div>
                    <div className="name-prompt-sub">Select your role to unlock your role-specific channels. Choose all that apply.</div>
                  </>
                ) : (
                  <>
                    <div className="name-prompt-title">What's your role?</div>
                    <div className="name-prompt-sub">Select all that apply — this unlocks your role-specific channels.</div>
                  </>
                )}
                <div className="name-prompt-roles">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      className={`name-prompt-role-pill${selectedRoles.includes(r.value) ? " active" : ""}`}
                      onClick={() => toggleRole(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={!canSubmit} className="name-prompt-btn">
                {saving ? "Saving…" : "Enter Community"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
