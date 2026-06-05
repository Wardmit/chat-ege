export interface User {
  id: string;
  username: string;
  role: "user" | "moderator" | "admin" | "owner";
  status: "active" | "muted" | "banned";
  ip_address: string;
  warnCount?: number;
  lastWarnAt?: number;
  lastMessageTime?: number;
}

export interface ClickEvent {
  id: string;
  userId: string;
  roomId: string;
  triggerType: "pinned" | "time" | "interaction";
  timestamp: number;
  sessionId?: string;
}

export interface Interaction {
  id: string;
  message_id: string;
  user_id: string;
  type: "like" | "dislike" | "report";
}

export interface Ban {
  id: string;
  uuid?: string;
  ip?: string;
  reason: string;
  timestamp: string;
}

export interface Room {
  id: string;
  name: string;
  category: string;
  status: "open" | "locked" | "read-only";
  visibility: "public" | "hidden";
  password?: string;
  max_users: number;
  current_users: number;
  parent_id?: string;
  pinnedMessage?: string;
  ctaLink?: string;
  ctaText?: string;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  role?: "user" | "moderator" | "admin" | "owner";
  content: string;
  timestamp: string;
  likes_count: number;
  dislikes_count: number;
  reports_count: number;
  hidden: boolean;
  moderation_status?: "pending" | "ignored" | "removed";
  reactions?: Record<string, "like" | "dislike">;
  formattedText?: string;
  formatRanges?: { start: number; end: number; type: "bold" }[];
  replyTo?: {
    messageId: string;
    text: string;
    username: string;
  };
  links?: {
    url: string;
    type: "image" | "pdf" | "video" | "cloud" | "generic";
  }[];
}

export interface AuditLog {
  id: string;
  action: "delete_message" | "ban_user" | "mute_user" | "unban_user" | "update_room" | "promote_moderator" | "demote_moderator" | "report_created" | "report_ignored";
  operator: string;
  targetId: string;
  details: string;
  timestamp: string;
}

export interface DashboardMetrics {
  activeUsersCount: number;
  messagesTodayCount: number;
  reportedMessagesCount: number;
  reportedMessages: Message[];
}

export interface ExternalLinks {
  egeGames: string;
  escolaEGE: string;
  salaProfessores: string;
  diretrizesComunidade?: string;
  privacidade?: string;
  manualModeracao?: string;
}

export interface ProhibitedWord {
  word: string;
  severity: "block" | "warn";
}

export interface AdminUser {
  username: string;
  hash: string;
  role: "admin" | "moderator";
  createdAt: string;
}
