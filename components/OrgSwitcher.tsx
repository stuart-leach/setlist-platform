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
      {orgs.length > 0 && (
        <Link href="/channels/general" className={`org-pill${!inOrg ? " active" : ""}`}>
          <span className="org-pill-dot" />
          Community
        </Link>
      )}
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
    </div>
  );
}
