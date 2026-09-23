export type TabKey = 'chats' | 'calls' | 'family' | 'settings';

export type TrafficModeKey = 'full' | 'economy' | 'minimal';

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
  sender: 'me' | 'relative';
  text: string;
  createdAt: string;
  delivered: boolean;
};

export type TrafficMode = {
  key: TrafficModeKey;
  label: string;
  description: string;
};
