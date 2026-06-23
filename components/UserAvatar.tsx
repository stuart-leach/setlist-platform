import Image from "next/image";
import type { Profile } from "@/lib/supabase/types";

interface Props {
  profile: Pick<Profile, "display_name" | "username" | "avatar_url">;
  size?: number;
}

export default function UserAvatar({ profile, size = 32 }: Props) {
  const initials = (profile.display_name ?? profile.username)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (profile.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt={profile.display_name ?? profile.username}
        width={size}
        height={size}
        className="avatar"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      />
    );
  }

  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}
