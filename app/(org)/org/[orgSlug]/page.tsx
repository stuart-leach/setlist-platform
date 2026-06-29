import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgRootPage({ params }: Props) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  // Redirect to the first channel alphabetically
  const { data: firstChannel } = await supabase
    .from("channels")
    .select("slug")
    .eq("org_id", org.id)
    .order("name")
    .limit(1)
    .single();

  if (firstChannel) {
    redirect(`/org/${orgSlug}/channels/${firstChannel.slug}`);
  }

  // No channels yet — stay on this page and show an empty state
  // (OrgShell / OrgSidebar already renders, children here is the empty state)
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
      No channels yet. An admin can create the first one.
    </div>
  );
}
