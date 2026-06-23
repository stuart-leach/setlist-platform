"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Appeal {
  id: string;
  content: string;
  status: string;
  created_at: string;
  admin_note: string | null;
}

interface Props {
  userId: string;
  displayName: string;
  existingAppeal: Appeal | null;
}

export default function BannedView({ userId, displayName, existingAppeal }: Props) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const supabase = createClient();

  async function handleSubmit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    await supabase.from("ban_appeals").insert({ user_id: userId, content: content.trim() });
    setSubmitting(false);
    setSubmitted(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  const cardStyle: React.CSSProperties = {
    background: "#1a1b1e",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 40,
    maxWidth: 480,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const mutedText: React.CSSProperties = {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    lineHeight: "1.6",
    margin: 0,
  };

  const heading: React.CSSProperties = {
    color: "#fff",
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  };

  const subheading: React.CSSProperties = {
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
  };

  function renderAppealStatus() {
    if (!existingAppeal) return null;
    const { status, admin_note } = existingAppeal;

    if (status === "pending") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 28 }}>⏳</div>
          <p style={subheading}>Appeal Under Review</p>
          <p style={mutedText}>We&apos;ve received your appeal and will review it shortly.</p>
        </div>
      );
    }

    if (status === "approved") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 28 }}>✅</div>
          <p style={subheading}>Appeal Approved</p>
          <p style={mutedText}>
            Your account has been reinstated. You can now sign in normally.
          </p>
          <button
            onClick={handleSignOut}
            style={{
              marginTop: 4,
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.7)",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Sign out to continue
          </button>
        </div>
      );
    }

    if (status === "rejected") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 28 }}>❌</div>
          <p style={subheading}>Appeal Rejected</p>
          <p style={mutedText}>
            {admin_note ?? "Your appeal was not approved."}
          </p>
        </div>
      );
    }

    return null;
  }

  function renderForm() {
    if (submitted) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 28 }}>✅</div>
          <p style={subheading}>Appeal submitted</p>
          <p style={mutedText}>We&apos;ll review your appeal and get back to you.</p>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ ...mutedText, marginBottom: 2 }}>
          If you believe this was a mistake, you can submit a one-time appeal.
        </p>
        <textarea
          rows={4}
          maxLength={1000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Explain why you believe this suspension should be lifted…"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#fff",
            fontSize: 14,
            padding: "10px 12px",
            resize: "vertical",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: "1.5",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...mutedText, fontSize: 12 }}>{content.length} / 1000</span>
          <button
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
            style={{
              background: submitting || !content.trim() ? "rgba(255,255,255,0.08)" : "#5865f2",
              color: submitting || !content.trim() ? "rgba(255,255,255,0.35)" : "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting || !content.trim() ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {submitting ? "Submitting…" : "Submit Appeal"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#111113",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={cardStyle}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>🚫</div>
        <h1 style={heading}>Your account has been suspended</h1>
        <p style={mutedText}>
          Hi {displayName}, your account has been removed from the community due to a violation of
          our community guidelines.
        </p>

        {existingAppeal ? renderAppealStatus() : renderForm()}

        <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.35)",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
