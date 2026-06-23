"use client";

import { useEffect, useRef, useState } from "react";

const ROLES = [
  { value: "admin",     label: "Admin",      color: "#e87070" },
  { value: "moderator", label: "Moderator",  color: "#7aabf7" },
  { value: "member",    label: "Member",     color: "#888888" },
];

const LS_KEY = "preview-role-override";

export default function AdminTestBar() {
  const [role, setRole] = useState("admin");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) setRole(stored);
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function switchRole(newRole: string) {
    setRole(newRole);
    setOpen(false);
    localStorage.setItem(LS_KEY, newRole);
    window.dispatchEvent(new CustomEvent("preview-role-change", { detail: newRole }));
  }

  const current = ROLES.find(r => r.value === role) ?? ROLES[0];

  return (
    <div className="admin-test-bar" ref={wrapRef}>
      {open && (
        <div className="admin-test-menu">
          <p className="admin-test-menu-label">Test as role</p>
          {ROLES.map(r => (
            <button
              key={r.value}
              className={`admin-test-menu-item${r.value === role ? " active" : ""}`}
              style={{ "--role-color": r.color } as React.CSSProperties}
              onClick={() => switchRole(r.value)}
            >
              <span className="admin-test-dot" />
              {r.label}
              {r.value === role && <span className="admin-test-check">✓</span>}
            </button>
          ))}
        </div>
      )}
      <button
        className="admin-test-pill"
        style={{ "--role-color": current.color } as React.CSSProperties}
        onClick={() => setOpen(o => !o)}
        title="Switch test role"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5L2 4V8.5C2 11.54 4.69 13.94 8 14.5C11.31 13.94 14 11.54 14 8.5V4L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
        <span>Preview: <strong>{current.label}</strong></span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6 }}>
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
