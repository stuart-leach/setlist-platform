"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "./UserAvatar";
import type { MessageWithProfile } from "@/lib/supabase/types";

type Tab = "messages" | "links" | "images";

const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/g;

function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(URL_REGEX)).map((m) => m[0]);
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part
  );
}

interface Props {
  channelId: string;
  channelName: string;
}

export default function ChannelSearch({ channelId, channelName }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("messages");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageWithProfile[]>([]);
  const [links, setLinks] = useState<MessageWithProfile[]>([]);
  const [images, setImages] = useState<MessageWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [linksLoading, setLinksLoading] = useState(false);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();

  useEffect(() => { setMounted(true); }, []);

  // Focus input and pre-load links + images when modal opens
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 60);

    setLinksLoading(true);
    setImagesLoading(true);

    supabase
      .from("messages")
      .select("*, profiles(*)")
      .eq("channel_id", channelId)
      .ilike("content", "%http%")
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setLinks(((data as MessageWithProfile[]) ?? []).filter((m) => extractUrls(m.content).length > 0));
        setLinksLoading(false);
      });

    supabase
      .from("messages")
      .select("*, profiles(*)")
      .eq("channel_id", channelId)
      .not("attachment_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setImages((data as MessageWithProfile[]) ?? []);
        setImagesLoading(false);
      });
  }, [open, channelId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function closeModal() {
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function jumpTo(messageId: string) {
    closeModal();
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("msg-highlight");
        setTimeout(() => el.classList.remove("msg-highlight"), 1500);
      }
    }, 120);
  }

  function handleSearch(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const term = val.trim();

      // Run content search and user search in parallel
      const [{ data: byContent }, { data: byUser }] = await Promise.all([
        supabase
          .from("messages")
          .select("*, profiles(*)")
          .eq("channel_id", channelId)
          .ilike("content", `%${term}%`)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("messages")
          .select("*, profiles!inner(*)")
          .eq("channel_id", channelId)
          .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`, { referencedTable: "profiles" })
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

      // Merge and deduplicate, content matches first
      const seen = new Set<string>();
      const merged: MessageWithProfile[] = [];
      for (const m of [...((byContent as MessageWithProfile[]) ?? []), ...((byUser as MessageWithProfile[]) ?? [])]) {
        if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
      }
      setResults(merged);
      setLoading(false);
    }, 280);
  }

  const modal = open ? (
    <div className="search-overlay" onClick={closeModal}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="search-modal-header">
          <div className="search-modal-tabs">
            <button className={`search-tab${tab === "messages" ? " active" : ""}`} onClick={() => setTab("messages")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h12v8H5l-3 3V3Z"/>
              </svg>
              Messages
            </button>
            <button className={`search-tab${tab === "links" ? " active" : ""}`} onClick={() => setTab("links")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L7.5 3.5"/>
                <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1"/>
              </svg>
              Links
            </button>
            <button className={`search-tab${tab === "images" ? " active" : ""}`} onClick={() => setTab("images")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
                <circle cx="5.5" cy="6" r="1.2"/>
                <path d="M1.5 11l3.5-3.5L8 11l2.5-2.5L14.5 13"/>
              </svg>
              Images
            </button>
          </div>
          <button className="search-modal-close" onClick={closeModal} aria-label="Close search">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Messages tab */}
        {tab === "messages" && (
          <>
            <div className="search-modal-input-wrap">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M13 13L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                ref={inputRef}
                className="search-modal-input"
                placeholder={`Search messages or @username in #${channelName}…`}
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {query && (
                <button className="search-clear-btn" onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="search-modal-results">
              {loading && <p className="search-state-msg">Searching…</p>}
              {!loading && !query && (
                <div className="search-empty-state">
                  <p className="search-empty-hint">Search by message content or by a member's name</p>
                </div>
              )}
              {!loading && query && results.length === 0 && (
                <p className="search-state-msg">No results for &ldquo;{query}&rdquo;</p>
              )}
              {!loading && results.map((msg) => (
                <button key={msg.id} className="search-result-row" onClick={() => jumpTo(msg.id)}>
                  <UserAvatar profile={msg.profiles} size={28} />
                  <div className="search-result-body">
                    <div className="search-result-meta">
                      <span className="search-result-author">{msg.profiles?.display_name ?? msg.profiles?.username}</span>
                      <span className="search-result-time">{formatTime(msg.created_at)}</span>
                    </div>
                    <p className="search-result-content">{highlight(msg.content, query)}</p>
                  </div>
                  <svg className="search-result-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 2L9 6L3 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Links tab */}
        {tab === "links" && (
          <div className="search-modal-results">
            {linksLoading && <p className="search-state-msg">Loading links…</p>}
            {!linksLoading && links.length === 0 && (
              <p className="search-state-msg">No links have been shared in this channel yet.</p>
            )}
            {!linksLoading && links.map((msg) => {
              const urls = extractUrls(msg.content);
              return urls.map((url, i) => (
                <div key={`${msg.id}-${i}`} className="search-link-row">
                  <div className="search-link-favicon">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${hostname(url)}&sz=32`}
                      alt=""
                      width={16}
                      height={16}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                  <div className="search-link-body">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="search-link-url" onClick={(e) => e.stopPropagation()}>
                      {hostname(url)}
                    </a>
                    <p className="search-link-full">{url.length > 70 ? url.slice(0, 70) + "…" : url}</p>
                    <p className="search-link-meta">
                      {msg.profiles?.display_name ?? msg.profiles?.username} · {formatTime(msg.created_at)}
                    </p>
                  </div>
                  <button className="search-jump-btn" onClick={() => jumpTo(msg.id)} title="Jump to message">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3 2L9 6L3 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              ));
            })}
          </div>
        )}

        {/* Images tab */}
        {tab === "images" && (
          <div className="search-modal-results">
            {imagesLoading && <p className="search-state-msg">Loading images…</p>}
            {!imagesLoading && images.length === 0 && (
              <p className="search-state-msg">No images have been shared in this channel yet.</p>
            )}
            {!imagesLoading && images.length > 0 && (
              <div className="search-images-grid">
                {images.map((msg) => (
                  <button key={msg.id} className="search-image-cell" onClick={() => jumpTo(msg.id)} title="Jump to message">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={msg.attachment_url!} alt="" className="search-image-thumb" />
                    <div className="search-image-overlay">
                      <span className="search-image-author">{msg.profiles?.display_name ?? msg.profiles?.username}</span>
                      <span className="search-image-time">{formatTime(msg.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        className="header-icon-btn"
        aria-label="Search channel"
        onClick={() => setOpen(true)}
        title={`Search #${channelName}`}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M13 13L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      {mounted && modal && createPortal(modal, document.body)}
    </>
  );
}
