/** Pure application-domain models. They intentionally have no platform or transport dependencies. */

export type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type Chat = {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  memberIds: string[];
  createdAt: string;
  lastMessageAt: string | null;
};

export type MessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'system'; text: string };

export type Message = {
  /** Server-stable message identity. */
  id: string;
  /** Client-generated identity retained across an outbox retry. */
  clientMessageId: string;
  chatId: string;
  senderId: string;
  content: MessageContent;
  createdAt: string;
};

export type MessageReceipt = {
  messageId: string;
  profileId: string;
  state: 'sent' | 'delivered' | 'read';
  receivedAt: string;
};

export type Endpoint = {
  id: string;
  hostname: string;
  region: 'normal' | 'restricted';
  priority: number;
  active: boolean;
};

/** A local model only; it does not assert that a transport exists or connected. */
export type ConnectionState =
  | { kind: 'offline' }
  | { kind: 'connecting' }
  | { kind: 'online' }
  | { kind: 'degraded'; reason: 'network' | 'endpoint' | 'unknown' }
  | { kind: 'retrying'; attempt: number; nextRetryAt: string };

export type OutboxStatus = 'queued' | 'sending' | 'retrying' | 'failed';

export type OutboxItem = {
  id: string;
  messageId: string;
  clientMessageId: string;
  status: OutboxStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
};

/** Fields whose combination determines whether an outbox item can be retried. */
export type OutboxItemState = Pick<OutboxItem, 'status' | 'attemptCount' | 'nextAttemptAt'>;