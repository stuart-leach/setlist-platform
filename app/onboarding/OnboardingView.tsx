"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

export default function OnboardingView() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  const [joinInput, setJoinInput] = useState("");
  const [joinErr, setJoinErr] = useState("");

  async function createOrg() {
    const trimmed = name.trim();
    if (!trimmed) { setCreateErr("Give your organization a name."); return; }
    const base = toSlug(trimmed);
    if (!base) { setCreateErr("Use letters or numbers in the name."); return; }

    setCreating(true);
    setCreateErr("");
    // Retry slug on collision (unique constraint → Postgres 23505).
    for (let i = 1; i <= 20; i++) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const { data, error } = await supabase.rpc("create_organization", { p_name: trimmed, p_slug: slug });
      if (!error) {
        setCreating(false);
        const created = Array.isArray(data) ? data[0] : data;
        router.push(`/org/${created?.slug ?? slug}`);
        router.refresh();
        return;
      }
      if (!(error.code === "23505" || /duplicate|unique/i.test(error.message))) {
        setCreating(false);
        setCreateErr(error.message);
        return;
      }
    }
    setCreating(false);
    setCreateErr("Could not find an available URL — try a different name.");
  }

  function join() {
    const v = joinInput.trim();
    if (!v) { setJoinErr("Paste your invite link or code."); return; }
    // Accept a full /join/<token> URL or a bare token.
    const m = v.match(/join\/([^/?#\s]+)/);
    const token = m ? m[1] : v;
    router.push(`/join/${token}`);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0a0a0a" }}>
      <div style={{ width: "100%", maxWidth: 760, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ gridColumn: "1 / -1", textAlign: "center", marginBottom: 8 }}>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Welcome</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, margin: 0 }}>Create an organization for your church, or join one you were invited to.</p>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 24, color: "#fff" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>Create an organization</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 16px" }}>You&apos;ll be the owner and can invite your team.</p>
          <input className="ch-form-input" value={name} onChange={(e) => { setName(e.target.value); setCreateErr(""); }} placeholder="e.g. Grace Community Church" style={{ width: "100%", marginBottom: 12 }} autoFocus />
          {createErr && <p style={{ color: "#ff453a", fontSize: 12, margin: "0 0 12px" }}>{createErr}</p>}
          <button onClick={createOrg} disabled={creating} style={{ width: "100%", border: "none", borderRadius: 8, padding: "10px", fontWeight: 600, fontSize: 14, cursor: creating ? "default" : "pointer", background: "#fff", color: "#000", opacity: creating ? 0.6 : 1 }}>
            {creating ? "Creating…" : "Create organization"}
          </button>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 24, color: "#fff" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>Join with an invite</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 16px" }}>Paste the invite link an organization owner shared with you.</p>
          <input className="ch-form-input" value={joinInput} onChange={(e) => { setJoinInput(e.target.value); setJoinErr(""); }} placeholder="https://…/join/abc123" style={{ width: "100%", marginBottom: 12 }} />
          {joinErr && <p style={{ color: "#ff453a", fontSize: 12, margin: "0 0 12px" }}>{joinErr}</p>}
          <button onClick={join} style={{ width: "100%", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "10px", fontWeight: 600, fontSize: 14, cursor: "pointer", background: "transparent", color: "#fff" }}>
            Join organization
          </button>
        </div>
      </div>
    </div>
  );
}
