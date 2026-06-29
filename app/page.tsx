import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // RLS returns only orgs the user belongs to (or all, for a platform admin).
  const { data: orgs } = await supabase
    .from("organizations")
    .select("slug")
    .order("created_at", { ascending: true })
    .limit(1);

  if (orgs && orgs.length > 0) redirect(`/org/${orgs[0].slug}`);
  redirect("/onboarding");
}
