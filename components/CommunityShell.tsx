"use client";

import { useState } from "react";
import ChannelSidebar from "./ChannelSidebar";
import AdminTestBar from "./AdminTestBar";
import type { Channel, Organization, Profile } from "@/lib/supabase/types";

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
  basePath?: string;
  adminPath?: string;
  profilePath?: string;
  orgId?: string | null;
  canManage?: boolean;
  showAdminLink?: boolean;
  orgRoles?: { key: string; label: string }[];
  children: React.ReactNode;
}

export default function CommunityShell({ channels, currentUser, dmPartners, dmThreadIds, userCommunityRoles, orgs, roleChannelsEnabled, communityName, logoUrl, basePath, adminPath, profilePath, orgId, canManage, showAdminLink, orgRoles, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="community-shell">
      <ChannelSidebar
        channels={channels}
        currentUser={currentUser}
        dmPartners={dmPartners}
        dmThreadIds={dmThreadIds}
        userCommunityRoles={userCommunityRoles}
        orgs={orgs}
        roleChannelsEnabled={roleChannelsEnabled}
        communityName={communityName}
        logoUrl={logoUrl}
        basePath={basePath}
        adminPath={adminPath}
        profilePath={profilePath}
        orgId={orgId}
        canManage={canManage}
        showAdminLink={showAdminLink}
        orgRoles={orgRoles}
        collapsed={collapsed}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      />
      <main className="community-main">
        {children}
      </main>
      {currentUser.id === "preview-user-id" && <AdminTestBar />}
    </div>
  );
}
