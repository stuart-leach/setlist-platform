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
  children: React.ReactNode;
}

export default function CommunityShell({ channels, currentUser, dmPartners, dmThreadIds, userCommunityRoles, orgs, roleChannelsEnabled, communityName, logoUrl, children }: Props) {
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
