export type MessagingConversationType =
  | "dm"
  | "group"
  | "channel"
  | "record"
  | "customer"
  | "vendor"
  | "hr_private"
  | "payroll_restricted"
  | "accountant_client"
  | "advisor_engagement";

export type MessagingVisibility =
  | "internal"
  | "restricted_management"
  | "hr_private"
  | "customer"
  | "vendor"
  | "accountant"
  | "advisor";

export type MessagingInboxFilter =
  | "inbox"
  | "dm"
  | "groups"
  | "mentions"
  | "unread"
  | "starred"
  | "files"
  | "archived"
  | "transactions"
  | "search";

export type MessagingConversation = {
  id: string;
  company_id: string;
  conversation_type: MessagingConversationType;
  visibility: MessagingVisibility;
  title: string | null;
  description: string | null;
  dm_pair_key: string | null;
  channel_epoch: number;
  is_archived: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  unread: boolean;
  unread_count: number;
  is_starred: boolean;
  member_archived: boolean;
  muted_until: string | null;
};

export type MessagingMessage = {
  id: string;
  company_id: string;
  conversation_id: string;
  seq: number;
  author_user_id: string | null;
  author_kind: string;
  body: string;
  body_format: string;
  reply_to_message_id: string | null;
  idempotency_key: string;
  is_edited: boolean;
  is_redacted: boolean;
  is_pinned: boolean;
  created_at: string;
  edited_at: string | null;
  author_name?: string;
  /** Present when the current user has starred this message (optional enrichment). */
  is_starred?: boolean;
};

export type MessagingParticipant = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
};

export type MessagingSettings = {
  company_id: string;
  enabled: boolean;
  allow_internal: boolean;
  allow_employee: boolean;
  allow_customer: boolean;
  allow_vendor: boolean;
  allow_accountant: boolean;
  allow_advisor: boolean;
  allow_group_create: boolean;
  allow_external_invite: boolean;
  allow_file_share: boolean;
  allow_ai_assist: boolean;
  allow_voice_video: boolean;
  max_attachment_bytes: number;
  retention_days: number | null;
};
