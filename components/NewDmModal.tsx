"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "./UserAvatar";
import type { Profile } from "@/lib/supabase/types";

interface Props {
  currentUserId: string;
  onClose: () => void;
}

export default function NewDmModal({ currentUserId, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", currentUserId)
        .or(`username.ilike.%${val.trim()}%,display_name.ilike.%${val.trim()}%`)
        .limit(12);
      setResults((data as Profile[]) ?? []);
      setLoading(false);
    }, 280);
  }

  async function startDm(partner: Profile) {
    setStarting(partner.id);
    const a = currentUserId < partner.id ? currentUserId : partner.id;
    const b = currentUserId < partner.id ? partner.id : currentUserId;

    const { data: existing } = await supabase
      .from("dm_threads")
      .select("id")
      .eq("participant_a", a)
      .eq("participant_b", b)
      .maybeSingle();

    if (existing) {
      onClose();
      router.push(`/dm/${partner.id}`);
      return;
    }

    const { error } = await supabase
      .from("dm_threads")
      .insert({ participant_a: a, participant_b: b });

    setStarting(null);
    if (!error) {
      onClose();
      router.push(`/dm/${partner.id}`);
      router.refresh();
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Direct Message</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-search-wrap">
          <input
            ref={inputRef}
            className="modal-search-input"
            placeholder="Search by name or username…"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>

        <div className="modal-results">
          {loading && <p className="modal-state">Searching…</p>}
          {!loading && query && results.length === 0 && (
            <p className="modal-state">No users found for &ldquo;{query}&rdquo;</p>
          )}
          {!loading && !query && (
            <p className="modal-state">Search for a person to message</p>
          )}
          {results.map((user) => (
            <button
              key={user.id}
              className="modal-user-btn"
              onClick={() => startDm(user)}
              disabled={starting === user.id}
            >
              <UserAvatar profile={user} size={30} />
              <div>
                <p className="modal-user-name">
                  {user.display_name ?? user.username}
                  {starting === user.id && " …"}
                </p>
                <p className="modal-user-handle">@{user.username}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
