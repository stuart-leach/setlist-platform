"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type State = "loading" | "ready" | "joining" | "already" | "error" | "invalid";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [state, setState] = useState<State>("loading");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgId, setOrgId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/auth/login?next=/join/${token}`);
        return;
      }

      // Look up invite
      const { data: invite } = await supabase
        .from("organization_invites")
        .select("org_id, organizations(id, name, slug)")
        .eq("token", token)
        .single();

      if (!invite) { setState("invalid"); return; }

      const org = (invite as any).organizations;
      setOrgName(org.name);
      setOrgSlug(org.slug);
      setOrgId(org.id);

      // Check if already a member
      const { data: existing } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("org_id", org.id)
        .eq("user_id", user.id)
        .single();

      if (existing) { setState("already"); return; }

      setState("ready");
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function join() {
    setState("joining");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push(`/auth/login?next=/join/${token}`); return; }

    const { error } = await supabase
      .from("organization_members")
      .insert({ org_id: orgId, user_id: user.id, role: "member" });

    if (error) {
      setErrorMsg(error.message);
      setState("error");
      return;
    }

    router.push(`/org/${orgSlug}`);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MultiTracks" style={{ height: 26, width: "auto", marginBottom: 10 }} />
          <div className="login-tagline">Community</div>
        </div>

        {state === "loading" && (
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, textAlign: "center" }}>Loading…</p>
        )}

        {state === "invalid" && (
          <div className="login-sent-box">
            <div className="login-sent-icon" style={{ fontSize: 28 }}>⚠️</div>
            <div className="login-sent-title">Invalid invite link</div>
            <div className="login-sent-sub">This invite link is not valid or has been revoked.</div>
          </div>
        )}

        {state === "already" && (
          <div className="login-sent-box">
            <div className="login-sent-icon">✓</div>
            <div className="login-sent-title">You&apos;re already a member</div>
            <div className="login-sent-sub">You already have access to <strong>{orgName}</strong>.</div>
            <button className="login-btn" style={{ marginTop: 16 }} onClick={() => router.push(`/org/${orgSlug}`)}>
              Go to {orgName}
            </button>
          </div>
        )}

        {(state === "ready" || state === "joining") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
              You&apos;ve been invited to join the private workspace for <strong style={{ color: "#fff" }}>{orgName}</strong>.
            </p>
            <button className="login-btn" onClick={join} disabled={state === "joining"}>
              {state === "joining" ? "Joining…" : `Join ${orgName}`}
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="login-sent-box">
            <div className="login-sent-icon" style={{ fontSize: 28 }}>⚠️</div>
            <div className="login-sent-title">Something went wrong</div>
            <div className="login-sent-sub">{errorMsg}</div>
          </div>
        )}
      </div>
    </div>
  );
}
