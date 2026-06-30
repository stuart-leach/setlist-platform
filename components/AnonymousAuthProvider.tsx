"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AnonymousAuthProvider({
  userId,
  displayName,
  children,
}: {
  userId: string;
  displayName: string | null;
  hasRoles?: boolean; // accepted for compatibility; roles are now per-org
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();

  // Only prompt to capture a display name (e.g. SSO with an incomplete profile).
  // Roles are managed per-organization in the profile / org Admin Hub.
  const [showPrompt, setShowPrompt] = useState(false);
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!displayName) setShowPrompt(true);
  }, [displayName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);

    const username = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "_") || `user_${userId.slice(0, 8)}`;
    await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: trimmed, username }, { onConflict: "id" });

    setSaving(false);
    setShowPrompt(false);
    router.refresh();
  }

  const canSubmit = name.trim().length > 0 && !saving;

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
              <div className="name-prompt-section">
                <div className="name-prompt-title">Welcome!</div>
                <div className="name-prompt-sub">What should we call you? This is how your name appears in messages and DMs.</div>
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

              <button type="submit" disabled={!canSubmit} className="name-prompt-btn">
                {saving ? "Saving…" : "Continue"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
