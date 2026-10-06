export type TabKey = 'chats' | 'calls' | 'family' | 'settings';

export type TrafficModeKey = 'full' | 'economy' | 'minimal';

export type ThemePreference = 'system' | 'light' | 'dark';

export type Chat = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  lastMessage: string;
  time: string;
  unread: number;
  trafficLabel: string;
  pinned: boolean;
};

export type Message = {
  id: string;
  chatId: string;
  clientMessageId?: string;
  sender: 'me' | 'relative' | 'event';
  text: string;
  createdAt: string;
  delivered: boolean;
  deliveryState?: 'queued' | 'sent' | 'not_sent';
  kind?: 'text' | 'call';
  callStatus?: 'completed' | 'missed';
  read?: boolean;
  replyTo?: {
    messageId: string | null;
    senderName: string;
    preview: string;
  };
};

export type CallLogDirection = 'incoming' | 'outgoing' | 'missed';

export type CallLogCallbackType = 'audio' | 'video';

export type CallLogEntry = {
  id: string;
  chatId: string;
  name: string;
  initials: string;
  avatarColor: string;
  direction: CallLogDirection;
  occurredAt: string;
  callbackType: CallLogCallbackType;
};

export type TrafficMode = {
  key: TrafficModeKey;
  label: string;
  description: string;
};

export type ThemeOption = {
  key: ThemePreference;
  label: string;
};
