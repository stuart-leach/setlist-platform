import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // First org the user is a (non-banned) member of.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("joined_at, organizations(slug)")
    .eq("user_id", user.id)
    .eq("is_banned", false)
    .order("joined_at", { ascending: true })
    .limit(1);

  const slug = (memberships?.[0] as any)?.organizations?.slug;
  if (slug) redirect(`/org/${slug}`);
  redirect("/onboarding");
}
