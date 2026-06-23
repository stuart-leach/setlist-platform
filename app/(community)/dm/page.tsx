import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Profile } from "@/lib/supabase/types";
import UserAvatar from "@/components/UserAvatar";
import DmPageClient from "./DmPageClient";

export default async function DmLandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let partners: Profile[] = [];

  if (user) {
    const { data: threads } = await supabase
      .from("dm_threads")
      .select(`
        participant_a,
        participant_b,
        participant_a_profile:profiles!dm_threads_participant_a_fkey(*),
        participant_b_profile:profiles!dm_threads_participant_b_fkey(*)
      `)
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(30);

    partners = (threads ?? []).map((thread: any) => {
      // If I am participant_a, my partner is participant_b, and vice-versa
      const isA = thread.participant_a === user.id;
      return isA ? thread.participant_b_profile : thread.participant_a_profile;
    }).filter(Boolean) as Profile[];
  }

  return (
    <div className="dm-landing">
      <div className="dm-landing-header">
        <h1 className="dm-landing-title">Direct Messages</h1>
        {user && <DmPageClient currentUserId={user.id} />}
      </div>

      <div className="dm-landing-list">
        {partners.length === 0 ? (
          <div className="dm-landing-empty">
            <p>No conversations yet.</p>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 6 }}>
              Start one by clicking New Message above.
            </p>
          </div>
        ) : (
          partners.map((partner) => (
            <Link key={partner.id} href={`/dm/${partner.id}`} className="dm-landing-row">
              <UserAvatar profile={partner} size={40} />
              <div className="dm-landing-info">
                <p className="dm-landing-name">{partner.display_name ?? partner.username}</p>
                {partner.job_title && (
                  <p className="dm-landing-preview">{partner.job_title}</p>
                )}
              </div>
              <svg className="dm-landing-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
