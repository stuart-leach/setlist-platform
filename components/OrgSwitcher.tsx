"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Organization } from "@/lib/supabase/types";

interface Props {
  orgs: Organization[];
}

export default function OrgSwitcher({ orgs }: Props) {
  const pathname = usePathname();

  if (orgs.length === 0) return null;

  const inOrg = pathname.startsWith("/org/");
  const activeSlug = inOrg ? pathname.split("/")[2] : null;

  return (
    <div className="org-switcher">
      {orgs.map((org) => (
        <Link
          key={org.id}
          href={`/org/${org.slug}`}
          className={`org-pill${activeSlug === org.slug ? " active" : ""}`}
        >
          <span className="org-pill-initial">{org.name[0].toUpperCase()}</span>
          {org.name}
        </Link>
      ))}
      <Link href="/onboarding" className="org-pill org-pill-add" title="New organization" aria-label="New organization">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        New
      </Link>
    </div>
  );
}
