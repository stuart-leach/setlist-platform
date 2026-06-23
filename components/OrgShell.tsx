"use client";

import { useState } from "react";
import OrgSidebar from "./OrgSidebar";
import type { Channel, Organization, Profile } from "@/lib/supabase/types";

interface Props {
  org: Organization;
  channels: Channel[];
  currentUser: Profile;
  allOrgs: Organization[];
  memberCount: number;
  children: React.ReactNode;
}

export default function OrgShell({ org, channels, currentUser, allOrgs, memberCount, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="community-shell">
      <OrgSidebar
        org={org}
        channels={channels}
        currentUser={currentUser}
        allOrgs={allOrgs}
        memberCount={memberCount}
        collapsed={collapsed}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      />
      <main className="community-main">
        {children}
      </main>
    </div>
  );
}
