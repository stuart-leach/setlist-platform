export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          intercom_id: string | null;
          bio: string | null;
          location: string | null;
          job_title: string | null;
          created_at: string;
          role: string;
          is_banned: boolean;
          muted_until: string | null;
          admin_note: string | null;
          mt_account_link: string | null;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          intercom_id?: string | null;
          bio?: string | null;
          location?: string | null;
          job_title?: string | null;
          created_at?: string;
          role?: string;
          is_banned?: boolean;
          muted_until?: string | null;
          admin_note?: string | null;
          mt_account_link?: string | null;
        };
        Update: {
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          intercom_id?: string | null;
          bio?: string | null;
          location?: string | null;
          job_title?: string | null;
          role?: string;
          is_banned?: boolean;
          muted_until?: string | null;
          admin_note?: string | null;
          mt_account_link?: string | null;
        };
      };
      channels: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          created_at: string;
          required_role: string[] | null;
          pinned_message_id: string | null;
          locked: boolean;
          org_id: string | null;
          channel_type: string;
          mt_setlist_id: number | null;
          mt_setlist_date: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          created_at?: string;
          required_role?: string[] | null;
          pinned_message_id?: string | null;
          locked?: boolean;
          org_id?: string | null;
          channel_type?: string;
          mt_setlist_id?: number | null;
          mt_setlist_date?: string | null;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          required_role?: string[] | null;
          pinned_message_id?: string | null;
          locked?: boolean;
          org_id?: string | null;
          channel_type?: string;
          mt_setlist_id?: number | null;
          mt_setlist_date?: string | null;
        };
      };
      community_settings: {
        Row: { id: boolean; role_channels_enabled: boolean; setlists_last_synced_at: string | null; community_name: string | null; logo_url: string | null; updated_at: string; };
        Insert: { id?: boolean; role_channels_enabled?: boolean; setlists_last_synced_at?: string | null; community_name?: string | null; logo_url?: string | null; updated_at?: string; };
        Update: { role_channels_enabled?: boolean; setlists_last_synced_at?: string | null; community_name?: string | null; logo_url?: string | null; updated_at?: string; };
      };
      community_roles: {
        Row: { id: string; user_id: string; role: string; created_at: string; };
        Insert: { id?: string; user_id: string; role: string; created_at?: string; };
        Update: Record<string, never>;
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          content: string;
          attachment_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          user_id: string;
          content: string;
          attachment_url?: string | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          attachment_url?: string | null;
        };
      };
      dm_threads: {
        Row: {
          id: string;
          participant_a: string;
          participant_b: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          participant_a: string;
          participant_b: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      dm_messages: {
        Row: {
          id: string;
          thread_id: string;
          sender_id: string;
          content: string;
          attachment_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          sender_id: string;
          content: string;
          attachment_url?: string | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          attachment_url?: string | null;
        };
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      message_replies: {
        Row: {
          id: string;
          parent_id: string;
          user_id: string;
          content: string;
          attachment_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          user_id: string;
          content: string;
          attachment_url?: string | null;
          created_at?: string;
        };
        Update: {
          content?: string;
        };
      };
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Channel = Database["public"]["Tables"]["channels"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type DmThread = Database["public"]["Tables"]["dm_threads"]["Row"];
export type DmMessage = Database["public"]["Tables"]["dm_messages"]["Row"];
export type MessageReaction = Database["public"]["Tables"]["message_reactions"]["Row"];
export type MessageReply = Database["public"]["Tables"]["message_replies"]["Row"];
export type MessageReplyWithProfile = MessageReply & { profiles: Profile };
export type CommunityRole = Database["public"]["Tables"]["community_roles"]["Row"];
export type CommunitySettings = Database["public"]["Tables"]["community_settings"]["Row"];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
}

export interface OrgInvite {
  id: string;
  org_id: string;
  token: string;
  created_by: string | null;
  created_at: string;
}

export interface DmMessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface BanAppeal {
  id: string;
  user_id: string;
  content: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
}

export interface MessageFlag {
  id: string;
  message_id: string;
  flagged_by: string;
  reason: string | null;
  created_at: string;
}

export type MessageWithProfile = Message & {
  profiles: Profile;
  message_reactions?: MessageReaction[];
  message_replies?: Array<{ id: string }>;
  optimistic?: boolean;
};
export type DmMessageWithProfile = DmMessage & { profiles: Profile; optimistic?: boolean };
