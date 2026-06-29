"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Channel, Organization, Profile } from "@/lib/supabase/types";
import UserAvatar from "./UserAvatar";
import NewDmModal from "./NewDmModal";
import UserProfileModal from "./UserProfileModal";
import OrgSwitcher from "./OrgSwitcher";
import { createClient } from "@/lib/supabase/client";

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

interface Props {
  channels: Channel[];
  currentUser: Profile;
  dmPartners: Profile[];
  dmThreadIds: Record<string, string>;
  userCommunityRoles: string[];
  orgs: Organization[];
  roleChannelsEnabled: boolean;
  communityName: string | null;
  logoUrl: string | null;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

function applyOrder(channels: Channel[], order: string[]): Channel[] {
  if (!order.length) return channels;
  const orderMap = new Map(order.map((id, i) => [id, i]));
  return [...channels].sort((a, b) => {
    const ia = orderMap.get(a.id) ?? order.length;
    const ib = orderMap.get(b.id) ?? order.length;
    return ia - ib;
  });
}

export default function ChannelSidebar({ channels, currentUser, dmPartners, dmThreadIds, userCommunityRoles, orgs, roleChannelsEnabled, communityName, logoUrl, collapsed, onCollapse, onExpand }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showNewDm, setShowNewDm] = useState(false);
  const [showNewSetlist, setShowNewSetlist] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState("");
  const [newSetlistError, setNewSetlistError] = useState("");
  const [savingSetlist, setSavingSetlist] = useState(false);
  const [profileModalUser, setProfileModalUser] = useState<Profile | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [localPartners, setLocalPartners] = useState<Profile[]>(dmPartners);
  const [openMenuPartnerId, setOpenMenuPartnerId] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const menuBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  const canModerate = currentUser.role === "admin" || currentUser.role === "moderator";
  const isAdmin = currentUser.role === "admin";
  const isPreview = currentUser.id === "preview-user-id";

  // ── Unread tracking ─────────────────────────────────────────────────────────
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map()); // slug → count
  const [dmUnreadCounts, setDmUnreadCounts] = useState<Map<string, number>>(new Map()); // partnerId → count
  const currentSlugRef = useRef<string | null>(null);
  const channelIdToSlugRef = useRef<Map<string, string>>(new Map());
  const threadToPartnerRef = useRef<Map<string, string>>(new Map()); // threadId → partnerId
  const currentSlug = pathname.startsWith("/channels/")
    ? (pathname.split("/channels/")[1]?.split("?")[0] ?? null)
    : null;
  const currentDmPartnerId = pathname.startsWith("/dm/")
    ? (pathname.split("/dm/")[1]?.split("?")[0] ?? null)
    : null;

  // Admin alert count (flagged messages + pending appeals)
  const [adminAlertCount, setAdminAlertCount] = useState(0);

  async function refreshAdminCount() {
    if (!isAdmin || isPreview) return;
    const [flagsRes, appealsRes] = await Promise.all([
      supabase.from("message_flags").select("*", { count: "exact", head: true }),
      supabase.from("ban_appeals").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setAdminAlertCount((flagsRes.count ?? 0) + (appealsRes.count ?? 0));
  }

  useEffect(() => {
    refreshAdminCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isPreview]);

  // Re-fetch count whenever AdminHub dismisses/resolves an item
  useEffect(() => {
    window.addEventListener("admin-count-change", refreshAdminCount);
    return () => window.removeEventListener("admin-count-change", refreshAdminCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isPreview]);

  // ── Channel ordering ────────────────────────────────────────────────────────
  // Treat a missing channel_type (pre-migration data) as "general", and exclude
  // "system" channels (e.g. #rules) from every sidebar section.
  const typeOf = (ch: Channel) => ch.channel_type ?? (ch.required_role?.length ? "role" : "general");
  const rawGeneral = channels.filter((ch) => typeOf(ch) === "general");
  const rawSetlist = channels.filter((ch) => typeOf(ch) === "setlist");
  const rawRole = channels.filter(
    (ch) => typeOf(ch) === "role" && ch.required_role?.length && ch.required_role.some((r) => userCommunityRoles.includes(r))
  );

  const [orderedGeneral, setOrderedGeneral] = useState<Channel[]>(rawGeneral);
  const [orderedRole, setOrderedRole] = useState<Channel[]>(rawRole);
  // Synced setlists sort by service date (soonest first); manual ones (no date)
  // fall to the bottom, newest-created first. No manual reordering.
  const setlists = [...rawSetlist].sort((a, b) => {
    const da = a.mt_setlist_date, db = b.mt_setlist_date;
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
  const canManageSetlists = canModerate && !isPreview;
  const [savedOrder, setSavedOrder] = useState<{ general_order: string[]; role_order: string[] }>({
    general_order: [],
    role_order: [],
  });

  // Load saved order on mount
  useEffect(() => {
    if (isPreview) return;
    supabase
      .from("user_channel_order")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const saved = {
          general_order: data.general_order ?? [],
          role_order: data.role_order ?? [],
        };
        setSavedOrder(saved);
        if (saved.general_order.length > 0) setOrderedGeneral(applyOrder(rawGeneral, saved.general_order));
        if (saved.role_order.length > 0) setOrderedRole(applyOrder(rawRole, saved.role_order));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // Keep ordered lists in sync when channels prop changes (new channel added, etc.)
  useEffect(() => {
    setOrderedGeneral((prev) => {
      const prevIds = new Set(prev.map((c) => c.id));
      const newChannels = rawGeneral.filter((c) => !prevIds.has(c.id));
      return [...prev.filter((c) => rawGeneral.some((r) => r.id === c.id)), ...newChannels];
    });
    setOrderedRole((prev) => {
      const prevIds = new Set(prev.map((c) => c.id));
      const newChannels = rawRole.filter((c) => !prevIds.has(c.id));
      return [...prev.filter((c) => rawRole.some((r) => r.id === c.id)), ...newChannels];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, userCommunityRoles]);

  // Keep channel ID→slug lookup in sync for realtime handler
  useEffect(() => {
    const map = new Map<string, string>();
    [...orderedGeneral, ...setlists, ...orderedRole].forEach((ch) => map.set(ch.id, ch.slug));
    channelIdToSlugRef.current = map;
  }, [orderedGeneral, orderedRole, channels]);

  // Keep current-slug ref in sync (used inside closure)
  useEffect(() => { currentSlugRef.current = currentSlug; }, [currentSlug]);

  // Keep thread→partner lookup in sync
  useEffect(() => {
    const map = new Map<string, string>();
    Object.entries(dmThreadIds).forEach(([partnerId, threadId]) => map.set(threadId, partnerId));
    threadToPartnerRef.current = map;
  }, [dmThreadIds]);

  // Clear channel unread when navigating to it
  useEffect(() => {
    if (!currentSlug) return;
    setUnreadCounts((prev) => {
      if (!prev.has(currentSlug)) return prev;
      const next = new Map(prev);
      next.delete(currentSlug);
      return next;
    });
  }, [currentSlug]);

  // Clear DM unread when navigating to it
  useEffect(() => {
    if (!currentDmPartnerId) return;
    setDmUnreadCounts((prev) => {
      if (!prev.has(currentDmPartnerId)) return prev;
      const next = new Map(prev);
      next.delete(currentDmPartnerId);
      return next;
    });
  }, [currentDmPartnerId]);

  // Subscribe to channel messages — increment count when not viewing that channel
  useEffect(() => {
    if (isPreview) return;
    const sub = supabase
      .channel("sidebar-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as { channel_id: string; user_id: string };
          if (msg.user_id === currentUser.id) return;
          const slug = channelIdToSlugRef.current.get(msg.channel_id);
          if (!slug || slug === currentSlugRef.current) return;
          setUnreadCounts((prev) => {
            const next = new Map(prev);
            next.set(slug, (next.get(slug) ?? 0) + 1);
            return next;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, currentUser.id]);

  // Subscribe to DM messages — increment count when not viewing that thread
  useEffect(() => {
    if (isPreview) return;
    const sub = supabase
      .channel("sidebar-dm-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        (payload) => {
          const msg = payload.new as { thread_id: string; sender_id: string };
          if (msg.sender_id === currentUser.id) return;
          const partnerId = threadToPartnerRef.current.get(msg.thread_id);
          if (!partnerId || partnerId === currentDmPartnerId) return;
          setDmUnreadCounts((prev) => {
            const next = new Map(prev);
            next.set(partnerId, (next.get(partnerId) ?? 0) + 1);
            return next;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, currentUser.id]);

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{ type: "general" | "role"; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ type: "general" | "role"; index: number } | null>(null);

  function performDrop(type: "general" | "role", dropIndex: number) {
    if (!dragging || dragging.type !== type) return;
    const list = [...(type === "general" ? orderedGeneral : orderedRole)];
    const [moved] = list.splice(dragging.index, 1);
    list.splice(dropIndex, 0, moved);
    if (type === "general") setOrderedGeneral(list);
    else setOrderedRole(list);
    setDragging(null);
    setDragOver(null);
    if (!isPreview) {
      const newSaved = {
        ...savedOrder,
        [type === "general" ? "general_order" : "role_order"]: list.map((ch) => ch.id),
      };
      setSavedOrder(newSaved);
      supabase.from("user_channel_order").upsert(
        { user_id: currentUser.id, ...newSaved, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    }
  }

  useEffect(() => { setLocalPartners(dmPartners); }, [dmPartners]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const inBtn = Object.values(menuBtnRefs.current).some((b) => b?.contains(e.target as Node));
      const inDropdown = menuDropdownRef.current?.contains(e.target as Node);
      if (!inBtn && !inDropdown) setOpenMenuPartnerId(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useLayoutEffect(() => {
    if (!openMenuPartnerId) return;
    const btn = menuBtnRefs.current[openMenuPartnerId];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow > 280) {
      setMenuStyle({ top: rect.bottom + 4, left: rect.left });
    } else {
      setMenuStyle({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
    }
  }, [openMenuPartnerId]);

  async function handleDeleteThread(partnerId: string) {
    setOpenMenuPartnerId(null);
    const threadId = dmThreadIds[partnerId];
    if (!threadId) return;
    setLocalPartners((prev) => prev.filter((p) => p.id !== partnerId));
    await supabase.from("dm_threads").delete().eq("id", threadId);
    if (pathname === `/dm/${partnerId}`) router.push("/channels/general");
  }

  async function handleMute(partnerId: string, ms: number) {
    setOpenMenuPartnerId(null);
    await supabase.from("profiles").update({ muted_until: new Date(Date.now() + ms).toISOString() }).eq("id", partnerId);
  }

  async function handleBan(partnerId: string) {
    setOpenMenuPartnerId(null);
    await supabase.from("profiles").update({ is_banned: true }).eq("id", partnerId);
  }

  async function handleSetRole(partnerId: string, role: string) {
    setOpenMenuPartnerId(null);
    await supabase.from("profiles").update({ role }).eq("id", partnerId);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  async function saveNewSetlist() {
    const name = newSetlistName.trim();
    if (!name) { setNewSetlistError("Setlist name is required."); return; }
    const baseSlug = toSlug(name);
    if (!baseSlug) { setNewSetlistError("Please use letters or numbers in the name."); return; }
    // Keep setlist slugs from colliding with each other / existing channels.
    const existing = new Set(channels.map((c) => c.slug));
    let slug = baseSlug;
    for (let i = 2; existing.has(slug); i++) slug = `${baseSlug}-${i}`;

    setSavingSetlist(true);
    const { data, error } = await supabase.from("channels").insert({
      name,
      slug,
      channel_type: "setlist",
      required_role: null,
      locked: false,
    }).select().single();
    setSavingSetlist(false);

    if (error) { setNewSetlistError(error.message); return; }

    setShowNewSetlist(false);
    setNewSetlistName("");
    setNewSetlistError("");
    router.refresh();
    if (data) router.push(`/channels/${slug}`);
  }

  // ── Mini-rail (collapsed) ────────────────────────────────────────────────────
  const dmActive = pathname.startsWith("/dm/");
  const roleActive = orderedRole.some((ch) => pathname === `/channels/${ch.slug}`);
  const channelActive = orderedGeneral.some((ch) => pathname === `/channels/${ch.slug}`);
  const setlistActive = setlists.some((ch) => pathname === `/channels/${ch.slug}`);
  const showRoleChannels = roleChannelsEnabled && orderedRole.length > 0;
  const totalUnreadGeneral = orderedGeneral.reduce((sum, ch) => sum + (unreadCounts.get(ch.slug) ?? 0), 0);
  const totalUnreadSetlist = setlists.reduce((sum, ch) => sum + (unreadCounts.get(ch.slug) ?? 0), 0);
  const totalUnreadRole = orderedRole.reduce((sum, ch) => sum + (unreadCounts.get(ch.slug) ?? 0), 0);
  const totalUnreadDm = localPartners.reduce((sum, p) => sum + (dmUnreadCounts.get(p.id) ?? 0), 0);

  if (collapsed) {
    return (
      <>
        <aside className="sidebar sidebar-mini">
          <div className="mini-top">
            <button className="mini-expand-btn" onClick={onExpand} title="Expand sidebar" aria-label="Expand sidebar">
              <img
                src={logoUrl ?? "/Logo-Mark.png"}
                alt=""
                className="mini-logo-mark"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute("hidden"); }}
              />
              <span className="mini-logo-fallback" hidden>{communityName?.[0]?.toUpperCase() ?? "MT"}</span>
            </button>
          </div>

          <nav className="mini-nav">
            <div className="mini-nav-wrap">
              <Link href="/channels/general" className={`mini-nav-item${channelActive ? " active" : ""}`}>
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M8 2L6 18M14 2L12 18M3 7.5H18M3 12.5H18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  </svg>
                  {totalUnreadGeneral > 0 && (
                    <span className="mini-unread-badge">{totalUnreadGeneral > 99 ? "99+" : totalUnreadGeneral}</span>
                  )}
                </span>
                <span className="mini-nav-label">General</span>
              </Link>
              <div className="mini-flyout">
                <p className="mini-flyout-heading">General</p>
                {orderedGeneral.map((ch) => {
                  const count = unreadCounts.get(ch.slug) ?? 0;
                  return (
                    <Link key={ch.id} href={`/channels/${ch.slug}`} className={`mini-flyout-item${pathname === `/channels/${ch.slug}` ? " active" : ""}`}>
                      <span className="mini-flyout-hash">#</span>{ch.name}
                      {count > 0 && <span className="mini-flyout-unread-badge">{count > 99 ? "99+" : count}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className={`mini-nav-wrap${setlists.length === 0 ? " mini-nav-wrap--dim" : ""}`}>
              <div className={`mini-nav-item${setlistActive ? " active" : ""}`}>
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M6 4H17M6 9H17M6 14H13M3 4.5V3.5M3 9.5V8.5M3 14.5V13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  </svg>
                  {totalUnreadSetlist > 0 && (
                    <span className="mini-unread-badge">{totalUnreadSetlist > 99 ? "99+" : totalUnreadSetlist}</span>
                  )}
                </span>
                <span className="mini-nav-label">Setlists</span>
              </div>
              {setlists.length > 0 && (
                <div className="mini-flyout">
                  <p className="mini-flyout-heading">Setlists</p>
                  {setlists.map((ch) => {
                    const count = unreadCounts.get(ch.slug) ?? 0;
                    return (
                      <Link key={ch.id} href={`/channels/${ch.slug}`} className={`mini-flyout-item${pathname === `/channels/${ch.slug}` ? " active" : ""}`}>
                        <span className="mini-flyout-hash">#</span>{ch.name}
                        {count > 0 && <span className="mini-flyout-unread-badge">{count > 99 ? "99+" : count}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {showRoleChannels && (
              <div className="mini-nav-wrap">
                <div className={`mini-nav-item${roleActive ? " active" : ""}`}>
                  <span style={{ position: "relative", display: "inline-flex" }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 2L12.1 7.5H18L13.4 10.8L15.1 16.5L10 13.2L4.9 16.5L6.6 10.8L2 7.5H7.9L10 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"/>
                    </svg>
                    {totalUnreadRole > 0 && (
                      <span className="mini-unread-badge">{totalUnreadRole > 99 ? "99+" : totalUnreadRole}</span>
                    )}
                  </span>
                  <span className="mini-nav-label">Role Chats</span>
                </div>
                <div className="mini-flyout">
                  <p className="mini-flyout-heading">Role Channels</p>
                  {orderedRole.map((ch) => {
                    const count = unreadCounts.get(ch.slug) ?? 0;
                    return (
                      <Link key={ch.id} href={`/channels/${ch.slug}`} className={`mini-flyout-item${pathname === `/channels/${ch.slug}` ? " active" : ""}`}>
                        <span className="mini-flyout-hash">#</span>{ch.name}
                        {count > 0 && <span className="mini-flyout-unread-badge">{count > 99 ? "99+" : count}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mini-nav-wrap">
              <Link href="/dm" className={`mini-nav-item${dmActive ? " active" : ""}`}>
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M2 4C2 3.45 2.45 3 3 3H17C17.55 3 18 3.45 18 4V13C18 13.55 17.55 14 17 14H7L2 18V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
                  </svg>
                  {totalUnreadDm > 0 && (
                    <span className="mini-unread-badge">{totalUnreadDm > 99 ? "99+" : totalUnreadDm}</span>
                  )}
                </span>
                <span className="mini-nav-label">Messages</span>
              </Link>
            </div>
          </nav>

          {/* Admin — pinned to the bottom just above the avatar, mirrors full sidebar */}
          {isAdmin && (
            <div className="mini-admin-bottom">
              <Link
                href="/admin"
                className={`mini-nav-item mini-nav-item--admin${pathname === "/admin" ? " active" : ""}`}
                title="Admin Hub"
                aria-label="Admin Hub"
              >
                <span style={{ position: "relative", display: "flex" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {adminAlertCount > 0 && (
                    <span className="admin-alert-badge">
                      {adminAlertCount > 9 ? "9+" : adminAlertCount}
                    </span>
                  )}
                </span>
                <span className="mini-nav-label">Admin</span>
              </Link>
            </div>
          )}

          <div className="mini-footer">
            <Link href="/profile" className="mini-avatar-btn" title="Your profile" aria-label="Your profile">
              <UserAvatar profile={currentUser} size={28} />
            </Link>
          </div>
        </aside>

        {showNewDm && (
          <NewDmModal currentUserId={currentUser.id} onClose={() => setShowNewDm(false)} />
        )}
      </>
    );
  }

  // ── Full sidebar (expanded) ──────────────────────────────────────────────────
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          {logoUrl ? (
            <img src={logoUrl} alt={communityName ?? "Community logo"} className="sidebar-logo-img sidebar-logo-img--custom" />
          ) : (
            <img src="/logo.png" alt="MultiTracks" className="sidebar-logo-img" />
          )}
          {communityName && <span className="sidebar-community-name">{communityName}</span>}
          <OrgSwitcher orgs={orgs} />
          <button className="sidebar-collapse-btn" onClick={onCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-row">
            <span className="sidebar-section-label">General</span>
          </div>
          {orderedGeneral.map((ch, index) => {
            const active = pathname === `/channels/${ch.slug}`;
            const isDragging = dragging?.type === "general" && dragging.index === index;
            const isDragOver = dragOver?.type === "general" && dragOver.index === index;
            return (
              <div
                key={ch.id}
                draggable
                onDragStart={() => setDragging({ type: "general", index })}
                onDragOver={(e) => { e.preventDefault(); setDragOver({ type: "general", index }); }}
                onDrop={() => performDrop("general", index)}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
                className={`sidebar-drag-row${isDragging ? " dragging" : ""}${isDragOver ? " drag-over" : ""}`}
              >
                <Link href={`/channels/${ch.slug}`} className={`sidebar-item${active ? " active" : ""}`}>
                  {ch.locked ? (
                    <svg className="sidebar-lock" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="7" width="10" height="7" rx="1.5"/>
                      <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
                    </svg>
                  ) : (
                    <span className="sidebar-hash">#</span>
                  )}
                  {ch.name}
                  {(unreadCounts.get(ch.slug) ?? 0) > 0 && (
                    <span className="channel-unread-badge">
                      {Math.min(unreadCounts.get(ch.slug)!, 99)}
                    </span>
                  )}
                </Link>
                <span className="sidebar-drag-handle" title="Drag to reorder">
                  <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                    <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                    <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
                    <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
                  </svg>
                </span>
              </div>
            );
          })}

          <div className="sidebar-separator" />
          <div className="sidebar-section-row">
            <span className="sidebar-section-label">Setlists</span>
            {canManageSetlists && (
              <button
                className="sidebar-new-dm-btn"
                onClick={() => { setNewSetlistName(""); setNewSetlistError(""); setShowNewSetlist(true); }}
                title="New setlist"
                aria-label="New setlist"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
          {setlists.map((ch) => {
            const active = pathname === `/channels/${ch.slug}`;
            return (
              <Link key={ch.id} href={`/channels/${ch.slug}`} className={`sidebar-item${active ? " active" : ""}`}>
                <span className="sidebar-hash">#</span>
                {ch.name}
                {(unreadCounts.get(ch.slug) ?? 0) > 0 && (
                  <span className="channel-unread-badge">{Math.min(unreadCounts.get(ch.slug)!, 99)}</span>
                )}
              </Link>
            );
          })}
          {setlists.length === 0 && (
            <p className="sidebar-empty-hint">
              {canManageSetlists ? "No setlists yet — tap + to create one." : "No setlists yet."}
            </p>
          )}

          {showRoleChannels && (
            <>
              <div className="sidebar-separator" />
              <p className="sidebar-section-label">Role Channels</p>
              {orderedRole.map((ch, index) => {
                const active = pathname === `/channels/${ch.slug}`;
                const isDragging = dragging?.type === "role" && dragging.index === index;
                const isDragOver = dragOver?.type === "role" && dragOver.index === index;
                return (
                  <div
                    key={ch.id}
                    draggable
                    onDragStart={() => setDragging({ type: "role", index })}
                    onDragOver={(e) => { e.preventDefault(); setDragOver({ type: "role", index }); }}
                    onDrop={() => performDrop("role", index)}
                    onDragEnd={() => { setDragging(null); setDragOver(null); }}
                    className={`sidebar-drag-row${isDragging ? " dragging" : ""}${isDragOver ? " drag-over" : ""}`}
                  >
                    <Link href={`/channels/${ch.slug}`} className={`sidebar-item${active ? " active" : ""}`}>
                      <span className="sidebar-hash">#</span>
                      {ch.name}
                      {(unreadCounts.get(ch.slug) ?? 0) > 0 && (
                        <span className="channel-unread-badge">
                          {Math.min(unreadCounts.get(ch.slug)!, 99)}
                        </span>
                      )}
                    </Link>
                    <span className="sidebar-drag-handle" title="Drag to reorder">
                      <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                        <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                        <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
                        <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
                      </svg>
                    </span>
                  </div>
                );
              })}
            </>
          )}

          <div className="sidebar-separator" />

          <div className="sidebar-section-row">
            <Link href="/dm" className="sidebar-section-label-inline sidebar-section-label-link">Direct Messages</Link>
            {!isPreview && (
              <button className="sidebar-new-dm-btn" onClick={() => setShowNewDm(true)} title="New direct message" aria-label="New direct message">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {localPartners.map((partner) => {
            const active = pathname === `/dm/${partner.id}`;
            const menuOpen = openMenuPartnerId === partner.id;
            const dmCount = dmUnreadCounts.get(partner.id) ?? 0;
            return (
              <div key={partner.id} className={`sidebar-dm-row${menuOpen ? " menu-open" : ""}`}>
                <Link href={`/dm/${partner.id}`} className={`sidebar-dm-item${active ? " active" : ""}`}>
                  <UserAvatar profile={partner} size={18} />
                  <span>{partner.display_name ?? partner.username}</span>
                  {dmCount > 0 && (
                    <span className="channel-unread-badge" style={{ marginLeft: "auto", marginRight: 0 }}>
                      {dmCount > 99 ? "99+" : dmCount}
                    </span>
                  )}
                </Link>
                <button
                  ref={(el) => { menuBtnRefs.current[partner.id] = el; }}
                  className="sidebar-dm-menu-btn"
                  onClick={(e) => { e.preventDefault(); setOpenMenuPartnerId(menuOpen ? null : partner.id); }}
                  title="More options"
                  aria-label="More options"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/>
                  </svg>
                </button>
              </div>
            );
          })}

          {dmPartners.length === 0 && !isPreview && (
            <p style={{ fontSize: 12, color: "var(--fg-muted)", padding: "4px 10px", margin: 0 }}>
              No messages yet
            </p>
          )}
        </nav>

        {/* Admin link — only visible to admins, sits just above the footer */}
        {isAdmin && (
          <Link
            href="/admin"
            className={`sidebar-admin-link${pathname === "/admin" ? " active" : ""}`}
          >
            <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1.5L2 4v4c0 3.31 2.58 6.41 6 7 3.42-.59 6-3.69 6-7V4L8 1.5Z"/>
              </svg>
              {adminAlertCount > 0 && (
                <span className="admin-alert-badge">
                  {adminAlertCount > 9 ? "9+" : adminAlertCount}
                </span>
              )}
            </span>
            Admin Hub
          </Link>
        )}

        <div className="sidebar-footer">
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none" }}>
            <UserAvatar profile={currentUser} size={26} />
            <div style={{ minWidth: 0 }}>
              <p className="sidebar-footer-name">{currentUser.display_name ?? currentUser.username}</p>
              {(currentUser as { job_title?: string | null }).job_title && (
                <p style={{ fontSize: 11, color: "var(--fg-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(currentUser as { job_title?: string | null }).job_title}
                </p>
              )}
            </div>
          </Link>
          <button className="sidebar-signout" onClick={() => setShowSignOutConfirm(true)} title="Sign out" aria-label="Sign out">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3C2.45 2 2 2.45 2 3V13C2 13.55 2.45 14 3 14H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M11 5L14 8L11 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 8H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </aside>

      {showSignOutConfirm && (
        <div className="modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
          <div className="modal-box signout-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Sign Out</h2>
              <button className="modal-close" onClick={() => setShowSignOutConfirm(false)}>×</button>
            </div>
            <div className="signout-confirm-body">
              <p className="signout-confirm-text">Are you sure you want to sign out?</p>
              <div className="signout-confirm-actions">
                <button className="signout-cancel-btn" onClick={() => setShowSignOutConfirm(false)}>Cancel</button>
                <button className="signout-confirm-btn" onClick={signOut}>Sign Out</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewDm && (
        <NewDmModal currentUserId={currentUser.id} onClose={() => setShowNewDm(false)} />
      )}

      {showNewSetlist && (
        <div className="modal-overlay" onClick={() => setShowNewSetlist(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">New Setlist</h2>
              <button className="modal-close" onClick={() => setShowNewSetlist(false)}>×</button>
            </div>
            <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
                Creates a chat for a setlist. You can rename or remove it later.
              </p>
              <div className="ch-form-field">
                <label className="ch-form-label">Setlist Name</label>
                <input
                  className="ch-form-input"
                  value={newSetlistName}
                  onChange={(e) => { setNewSetlistName(e.target.value); setNewSetlistError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !savingSetlist) saveNewSetlist(); }}
                  placeholder="e.g. Sunday AM — June 29"
                  autoFocus
                />
              </div>
              {newSetlistError && <p className="ch-form-error">{newSetlistError}</p>}
              <div className="ch-form-actions">
                <button className="ch-btn-primary" onClick={saveNewSetlist} disabled={savingSetlist}>
                  {savingSetlist ? "Creating…" : "Create Setlist"}
                </button>
                <button className="ch-btn-ghost" onClick={() => setShowNewSetlist(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {profileModalUser && (
        <UserProfileModal
          user={profileModalUser}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
          onClose={() => setProfileModalUser(null)}
          onUpdate={(updates) => setProfileModalUser((prev) => prev ? { ...prev, ...updates } : null)}
        />
      )}

      {openMenuPartnerId && typeof document !== "undefined" && createPortal(
        <div ref={menuDropdownRef} className="mod-dropdown" style={{ position: "fixed", zIndex: 1000, minWidth: 200, ...menuStyle }}>
          {(() => {
            const partner = localPartners.find((p) => p.id === openMenuPartnerId)!;
            const name = partner?.display_name ?? partner?.username ?? "User";
            return (
              <>
                <button className="mod-dropdown-item danger" onClick={() => handleDeleteThread(openMenuPartnerId)}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 4H14M5 4V2.5C5 2.22 5.22 2 5.5 2H10.5C10.78 2 11 2.22 11 2.5V4M6 7V12M10 7V12M3 4L4 14H12L13 4H3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Delete conversation
                </button>
                {canModerate && (
                  <>
                    <div className="mod-dropdown-separator" />
                    <span className="mod-dropdown-label">Mute {name}</span>
                    <button className="mod-dropdown-item" onClick={() => handleMute(openMenuPartnerId, 60 * 60 * 1000)}>Mute 1 hour</button>
                    <button className="mod-dropdown-item" onClick={() => handleMute(openMenuPartnerId, 24 * 60 * 60 * 1000)}>Mute 24 hours</button>
                    <button className="mod-dropdown-item" onClick={() => handleMute(openMenuPartnerId, 7 * 24 * 60 * 60 * 1000)}>Mute 7 days</button>
                    <div className="mod-dropdown-separator" />
                    <button className="mod-dropdown-item danger" onClick={() => handleBan(openMenuPartnerId)}>Ban user</button>
                    {isAdmin && (
                      <>
                        <div className="mod-dropdown-separator" />
                        <span className="mod-dropdown-label">Set role</span>
                        <button className="mod-dropdown-item" onClick={() => handleSetRole(openMenuPartnerId, "admin")}>Make Admin</button>
                        <button className="mod-dropdown-item" onClick={() => handleSetRole(openMenuPartnerId, "moderator")}>Make Moderator</button>
                        <button className="mod-dropdown-item" onClick={() => handleSetRole(openMenuPartnerId, "member")}>Remove role</button>
                      </>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>,
        document.body
      )}
    </>
  );
}
