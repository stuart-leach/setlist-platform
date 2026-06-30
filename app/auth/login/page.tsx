"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Tab = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("signin");
  // Where to go after auth (e.g. back to an invite link), read from ?next=.
  const [next, setNext] = useState("/");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setNext(p.get("next") || "/");
    if (p.get("tab") === "signup") setTab("signup");
  }, []);

  // ── Sign in ──────────────────────────────────────────────────────────────────
  const [siEmail,    setSiEmail]    = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siError,    setSiError]    = useState("");
  const [siLoading,  setSiLoading]  = useState(false);
  const [showForgot,    setShowForgot]    = useState(false);
  const [forgotSent,    setForgotSent]    = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleForgotPassword() {
    if (!siEmail) return;
    setForgotLoading(true);
    await supabase.auth.resetPasswordForEmail(siEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setForgotLoading(false);
    setForgotSent(true);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSiError("");
    setSiLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword });
    setSiLoading(false);
    if (error) {
      setSiError(
        error.message.toLowerCase().includes("invalid")
          ? "Incorrect email or password. Please try again."
          : error.message
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  // ── Sign up ──────────────────────────────────────────────────────────────────
  const [suName,     setSuName]     = useState("");
  const [suEmail,    setSuEmail]    = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suError,    setSuError]    = useState("");
  const [suLoading,  setSuLoading]  = useState(false);
  const [suDone,     setSuDone]     = useState(false);
  const [emailInUse, setEmailInUse] = useState(false);
  const [resetSent,  setResetSent]  = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleResetPassword() {
    setResetLoading(true);
    await supabase.auth.resetPasswordForEmail(suEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setResetLoading(false);
    setResetSent(true);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setSuError("");
    setEmailInUse(false);
    setResetSent(false);
    setSuLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: suEmail,
      password: suPassword,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setSuLoading(false);
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already in use") || msg.includes("email address is already")) {
        setEmailInUse(true);
      } else {
        setSuError(error.message);
      }
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      const username = suName.trim().toLowerCase().replace(/[^a-z0-9]/g, "_") || `user_${userId.slice(0, 8)}`;
      await supabase.from("profiles").upsert(
        { id: userId, display_name: suName.trim(), username },
        { onConflict: "id" }
      );
    }

    setSuLoading(false);

    // If Supabase returns a session immediately (email confirmation OFF), go straight in —
    // the welcome modal in AnonymousAuthProvider will prompt for role selection.
    // Otherwise show the "check your email" screen.
    if (data.session) {
      router.push(next);
      router.refresh();
    } else {
      setSuDone(true);
    }
  }

  const suCanSubmit = suName.trim().length > 0 && suEmail.length > 0 && suPassword.length >= 6 && !suLoading;

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MultiTracks" style={{ height: 26, width: "auto", marginBottom: 10 }} />
          <div className="login-tagline">Community</div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="login-tabs">
          <button type="button" className={`login-tab${tab === "signin" ? " active" : ""}`} onClick={() => setTab("signin")}>
            Sign In
          </button>
          <button type="button" className={`login-tab${tab === "signup" ? " active" : ""}`} onClick={() => setTab("signup")}>
            Create Account
          </button>
        </div>

        {/* ── Sign In form ── */}
        {tab === "signin" && (
          <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="login-label">Email</label>
              <input type="email" value={siEmail} onChange={(e) => { setSiEmail(e.target.value); setForgotSent(false); }}
                required placeholder="you@example.com" className="login-input" autoFocus />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label className="login-label">Password</label>
                <button
                  type="button"
                  className="login-forgot-link"
                  onClick={() => { setShowForgot((v) => !v); setForgotSent(false); }}
                >
                  Forgot password?
                </button>
              </div>
              <input type="password" value={siPassword} onChange={(e) => setSiPassword(e.target.value)}
                required placeholder="••••••••" className="login-input" />
            </div>
            {siError && <p className="login-error">{siError}</p>}
            <button type="submit" disabled={siLoading} className="login-btn">
              {siLoading ? "Signing in…" : "Sign In"}
            </button>
            {showForgot && (
              <div className="login-email-in-use">
                {forgotSent ? (
                  <p className="login-reset-sent">✓ Reset link sent — check your inbox.</p>
                ) : (
                  <>
                    <p className="login-email-in-use-msg">
                      {siEmail
                        ? <>We&apos;ll send a reset link to <strong>{siEmail}</strong>.</>
                        : "Enter your email above, then click Send."}
                    </p>
                    <button
                      type="button"
                      className="login-reset-btn"
                      onClick={handleForgotPassword}
                      disabled={!siEmail || forgotLoading}
                    >
                      {forgotLoading ? "Sending…" : "Send Reset Email"}
                    </button>
                  </>
                )}
              </div>
            )}
          </form>
        )}

        {/* ── Sign Up form ── */}
        {tab === "signup" && (
          suDone ? (
            <div className="login-sent-box">
              <div className="login-sent-icon">📬</div>
              <div className="login-sent-title">Check your email</div>
              <div className="login-sent-sub">
                We sent a confirmation link to <strong>{suEmail}</strong>.
                Click it to activate your account and sign in.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="login-label">Display Name</label>
                <input type="text" value={suName} onChange={(e) => setSuName(e.target.value)}
                  required placeholder="How you'll appear in the community"
                  className="login-input" autoFocus maxLength={40} />
              </div>
              <div>
                <label className="login-label">Email</label>
                <input type="email" value={suEmail} onChange={(e) => { setSuEmail(e.target.value); setEmailInUse(false); setResetSent(false); }}
                  required placeholder="you@example.com" className="login-input" />
              </div>
              <div>
                <label className="login-label">Password</label>
                <input type="password" value={suPassword} onChange={(e) => setSuPassword(e.target.value)}
                  required placeholder="At least 6 characters" minLength={6} className="login-input" />
              </div>

              {suError && <p className="login-error">{suError}</p>}

              {emailInUse && (
                <div className="login-email-in-use">
                  <p className="login-email-in-use-msg">
                    <strong>{suEmail}</strong> is already registered.
                    {" "}Switch to Sign In, or reset your password below.
                  </p>
                  {resetSent ? (
                    <p className="login-reset-sent">✓ Reset link sent — check your inbox.</p>
                  ) : (
                    <button
                      type="button"
                      className="login-reset-btn"
                      onClick={handleResetPassword}
                      disabled={resetLoading}
                    >
                      {resetLoading ? "Sending…" : "Send password reset email"}
                    </button>
                  )}
                </div>
              )}

              <button type="submit" disabled={!suCanSubmit} className="login-btn">
                {suLoading ? "Creating account…" : "Create Account"}
              </button>
            </form>
          )
        )}

        <div className="login-footer">
          Already have a product account?{" "}
          <a href="/auth/sso">Sign in with SSO</a>
        </div>
      </div>
    </div>
  );
}
