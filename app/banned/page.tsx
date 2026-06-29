import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BannedView from "./BannedView";

export default async function BannedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.is_banned) redirect("/");

  const { data: appeal } = await supabase
    .from("ban_appeals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <BannedView
      userId={user.id}
      displayName={profile.display_name ?? profile.username}
      existingAppeal={appeal}
    />
  );
}
