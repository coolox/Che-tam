import { StatusBar } from 'expo-status-bar';
import { Ear, Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, Volume2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, KeyboardChatScrollView, KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BackHandler,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  FAMILY_MEMBERS,
  INITIAL_CHATS,
  INITIAL_MESSAGES,
  THEME_OPTIONS,
  TRAFFIC_MODES,
} from './src/ui/demoData';
import {
  appendOutgoingMessage,
  formatMessageTime,
  getChatPreview,
  getOrderedChats,
  selectTab,
  togglePinnedChat,
} from './src/ui/state';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { radius, spacing, typography, type ThemeColors } from './src/ui/tokens';
import { Chat, Message, TabKey, TrafficModeKey } from './src/ui/types';

type Screen = 'welcome' | 'home' | 'conversation' | 'call';
type CallMode = 'audio' | 'video';
type AudioRoute = 'speaker' | 'earpiece';

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [activeTab, setActiveTab] = useState<TabKey>('chats');
  const [selectedChatId, setSelectedChatId] = useState(INITIAL_CHATS[0].id);
  const [chats, setChats] = useState(INITIAL_CHATS);
  const [messagesByChat, setMessagesByChat] = useState(INITIAL_MESSAGES);
  const [query, setQuery] = useState('');
  const [composer, setComposer] = useState('');
  const [trafficMode, setTrafficMode] = useState<TrafficModeKey>('economy');
  const [expandedWelcome, setExpandedWelcome] = useState(false);
  const [callMode, setCallMode] = useState<CallMode>('audio');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [audioRoute, setAudioRoute] = useState<AudioRoute>('speaker');
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [connectionHints, setConnectionHints] = useState(true);

  const { mode } = useTheme();
  const styles = useStyles();
  const orderedChats = useMemo(() => getOrderedChats(chats, query), [chats, query]);
  const selectedChat = chats.find(chat => chat.id === selectedChatId) ?? chats[0];
  const selectedMessages = messagesByChat[selectedChat.id] ?? [];

  const goBack = () => {
    if (screen === 'call') {
      setScreen('conversation');
      return true;
    }
    if (screen === 'conversation') {
      setScreen('home');
      return true;
    }
    if (screen === 'home' && activeTab !== 'chats') {
      setActiveTab('chats');
      return true;
    }
    return false;
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [screen, activeTab]);

  const enterDemo = () => {
    setActiveTab('chats');
    setScreen('home');
  };

  const openChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setScreen('conversation');
  };

  const sendMessage = () => {
    const result = appendOutgoingMessage(selectedMessages, composer, new Date('2026-09-22T12:30:00.000Z'));
    if (!result.added) {
      return;
    }
    setMessagesByChat(current => ({ ...current, [selectedChat.id]: result.messages }));
    setChats(current =>
      current.map(chat =>
        chat.id === selectedChat.id
          ? { ...chat, lastMessage: result.message.text, time: formatMessageTime(result.message.createdAt), unread: 0 }
          : chat,
      ),
    );
    setComposer('');
  };

  const startCall = (mode: CallMode) => {
    setCallMode(mode);
    setCameraOff(false);
    setCameraFacing('front');
    setScreen('call');
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {screen === 'welcome' ? (
        <WelcomeScreen expanded={expandedWelcome} onDemo={enterDemo} onToggleInfo={() => setExpandedWelcome(value => !value)} />
      ) : null}
      {screen === 'home' ? (
        <HomeScreen
          activeTab={activeTab}
          chats={orderedChats}
          connectionHints={connectionHints}
          query={query}
          trafficMode={trafficMode}
          onOpenChat={openChat}
          onQuery={setQuery}
          onSelectTab={tab => setActiveTab(current => selectTab(current, tab))}
          onSetConnectionHints={setConnectionHints}
          onSetTrafficMode={setTrafficMode}
          onTogglePinned={chatId => setChats(current => togglePinnedChat(current, chatId))}
        />
      ) : null}
      {screen === 'conversation' ? (
        <ConversationScreen
          chat={selectedChat}
          composer={composer}
          messages={selectedMessages}
          onBack={() => setScreen('home')}
          onComposer={setComposer}
          onSend={sendMessage}
          onStartCall={startCall}
        />
      ) : null}
      {screen === 'call' ? (
        <CallScreen
          cameraOff={cameraOff}
          cameraFacing={cameraFacing}
          chat={selectedChat}
          mode={callMode}
          muted={muted}
          audioRoute={audioRoute}
          onEnd={() => setScreen('conversation')}
          onToggleCamera={() => setCameraOff(value => !value)}
          onToggleCameraFacing={() => setCameraFacing(value => (value === 'front' ? 'back' : 'front'))}
          onToggleMuted={() => setMuted(value => !value)}
          onToggleAudioRoute={() => setAudioRoute(value => (value === 'speaker' ? 'earpiece' : 'speaker'))}
        />
      ) : null}
    </View>
  );
}

function WelcomeScreen({
  expanded,
  onDemo,
  onToggleInfo,
}: {
  expanded: boolean;
  onDemo: () => void;
  onToggleInfo: () => void;
}) {
  const styles = useStyles();
  return (
    <ScrollView contentContainerStyle={styles.welcome}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>Ч</Text>
      </View>
      <Text style={styles.heroTitle}>Чё-Там</Text>
      <Text style={styles.heroText}>Тёплое место для семейных разговоров, сообщений и звонков на слабой связи.</Text>
      <Pressable accessibilityRole="button" onPress={onDemo} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Посмотреть демо</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onToggleInfo} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Как это работает</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>Только локальный preview</Text>
          <Text style={styles.bodyText}>
            Здесь нет аккаунта, сервера, камеры или микрофона. Демо показывает будущий пользовательский путь: семейные чаты,
            локальную отправку текста, макеты звонков и настройки расхода трафика.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function HomeScreen({
  activeTab,
  chats,
  connectionHints,
  query,
  trafficMode,
  onOpenChat,
  onQuery,
  onSelectTab,
  onSetConnectionHints,
  onSetTrafficMode,
  onTogglePinned,
}: {
  activeTab: TabKey;
  chats: Chat[];
  connectionHints: boolean;
  query: string;
  trafficMode: TrafficModeKey;
  onOpenChat: (chatId: string) => void;
  onQuery: (value: string) => void;
  onSelectTab: (tab: TabKey) => void;
  onSetConnectionHints: (value: boolean) => void;
  onSetTrafficMode: (value: TrafficModeKey) => void;
  onTogglePinned: (chatId: string) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.appShell}>
      <Header subtitle={activeTab === 'chats' ? 'Семейные разговоры' : undefined} />
      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'chats' ? (
          <ChatList chats={chats} query={query} onOpenChat={onOpenChat} onQuery={onQuery} onTogglePinned={onTogglePinned} />
        ) : null}
        {activeTab === 'calls' ? <CallsTab /> : null}
        {activeTab === 'family' ? <FamilyTab /> : null}
        {activeTab === 'settings' ? (
          <SettingsTab
            connectionHints={connectionHints}
            trafficMode={trafficMode}
            onSetConnectionHints={onSetConnectionHints}
            onSetTrafficMode={onSetTrafficMode}
          />
        ) : null}
      </ScrollView>
      <BottomTabs activeTab={activeTab} onSelect={onSelectTab} />
    </View>
  );
}

function Header({ subtitle }: { subtitle?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>Чё-Там</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.statusPill}>
        <Text style={styles.statusPillText}>offline demo</Text>
      </View>
    </View>
  );
}

function ChatList({
  chats,
  query,
  onOpenChat,
  onQuery,
  onTogglePinned,
}: {
  chats: Chat[];
  query: string;
  onOpenChat: (chatId: string) => void;
  onQuery: (value: string) => void;
  onTogglePinned: (chatId: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <TextInput
        accessibilityLabel="Поиск по чатам"
        onChangeText={onQuery}
        placeholder="Поиск по семье и сообщениям"
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        value={query}
      />
      {chats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Ничего не найдено</Text>
          <Text style={styles.bodyText}>Попробуйте другое имя или слово из последнего сообщения.</Text>
        </View>
      ) : null}
      {chats.map(chat => (
        <Pressable
          accessibilityRole="button"
          key={chat.id}
          onLongPress={() => onTogglePinned(chat.id)}
          onPress={() => onOpenChat(chat.id)}
          style={({ pressed }) => [styles.chatRow, pressed && styles.pressed]}
        >
          <View style={[styles.avatar, { backgroundColor: chat.avatarColor }]}>
            <Text style={styles.avatarText}>{chat.initials}</Text>
          </View>
          <View style={styles.chatMain}>
            <View style={styles.rowBetween}>
              <Text numberOfLines={1} style={styles.chatName}>
                {chat.pinned ? '★ ' : ''}
                {chat.name}
              </Text>
              <Text style={styles.chatTime}>{chat.time}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text numberOfLines={1} style={styles.chatPreview}>
                {getChatPreview(chat)}
              </Text>
              {chat.unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{chat.unread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.trafficLabel}>{chat.trafficLabel}</Text>
          </View>
        </Pressable>
      ))}
      <Text style={styles.hintText}>Долгое нажатие закрепляет чат наверху списка.</Text>
    </View>
  );
}

function ConversationScreen({
  chat,
  composer,
  messages,
  onBack,
  onComposer,
  onSend,
  onStartCall,
}: {
  chat: Chat;
  composer: string;
  messages: Message[];
  onBack: () => void;
  onComposer: (value: string) => void;
  onSend: () => void;
  onStartCall: (mode: CallMode) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <KeyboardAvoidingView automaticOffset behavior={Platform.OS === 'android' ? 'height' : 'padding'} style={styles.appShell}>
      <View style={styles.conversationHeader}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.iconButton}>
          <Text style={styles.iconButtonText}>‹</Text>
        </Pressable>
        <View style={[styles.avatarSmall, { backgroundColor: chat.avatarColor }]}>
          <Text style={styles.avatarSmallText}>{chat.initials}</Text>
        </View>
        <View style={styles.conversationTitle}>
          <Text numberOfLines={1} style={styles.chatName}>
            {chat.name}
          </Text>
          <Text style={styles.headerSubtitle}>локальный демо-чат</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => onStartCall('audio')} style={styles.headerAction}>
          <Text style={styles.headerActionText}>Аудио</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onStartCall('video')} style={styles.headerAction}>
          <Text style={styles.headerActionText}>Видео</Text>
        </Pressable>
      </View>
      <KeyboardChatScrollView
        contentContainerStyle={styles.messages}
        keyboardLiftBehavior="whenAtEnd"
        offset={insets.bottom}
      >
        <Text style={styles.dateDivider}>Сегодня</Text>
        {messages.map(message => (
          <View key={message.id} style={[styles.messageBubble, message.sender === 'me' ? styles.outgoingBubble : styles.incomingBubble]}>
            <Text style={styles.messageText}>{message.text}</Text>
            <Text style={styles.messageMeta}>
              {formatMessageTime(message.createdAt)} {message.sender === 'me' ? '✓✓' : ''}
            </Text>
          </View>
        ))}
      </KeyboardChatScrollView>
      <View style={styles.composer}>
        <Pressable accessibilityRole="button" style={styles.attachButton}>
          <Text style={styles.attachText}>＋</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="Текст сообщения"
          multiline
          onChangeText={onComposer}
          placeholder="Сообщение"
          placeholderTextColor={colors.textMuted}
          style={styles.composerInput}
          value={composer}
        />
        <Pressable accessibilityRole="button" onPress={onSend} style={styles.sendButton}>
          <Text style={styles.sendButtonText}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function CallScreen({
  audioRoute,
  cameraOff,
  cameraFacing,
  chat,
  mode,
  muted,
  onEnd,
  onToggleAudioRoute,
  onToggleCamera,
  onToggleCameraFacing,
  onToggleMuted,
}: {
  audioRoute: AudioRoute;
  cameraOff: boolean;
  cameraFacing: 'front' | 'back';
  chat: Chat;
  mode: CallMode;
  muted: boolean;
  onEnd: () => void;
  onToggleAudioRoute: () => void;
  onToggleCamera: () => void;
  onToggleCameraFacing: () => void;
  onToggleMuted: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const styles = useStyles();
  const [connected, setConnected] = useState(mode === 'audio');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pip, setPip] = useState(() => ({ x: dimensions.width - 132, y: insets.top + 84 }));
  const dragStart = useRef(pip);
  const movedDuringGesture = useRef(false);

  useEffect(() => {
    setConnected(mode === 'audio');
    setElapsedSeconds(0);
    setControlsVisible(true);
    setPip({ x: dimensions.width - 132, y: insets.top + 84 });
    if (mode === 'audio') {
      return undefined;
    }
    const timer = setTimeout(() => setConnected(true), 1800);
    return () => clearTimeout(timer);
  }, [chat.id, dimensions.width, insets.top, mode]);

  useEffect(() => {
    if (!connected) {
      return undefined;
    }
    const timer = setInterval(() => setElapsedSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [connected]);

  const pipBounds = {
    maxX: Math.max(spacing.md, dimensions.width - 116 - spacing.md),
    maxY: Math.max(insets.top + spacing.md, dimensions.height - insets.bottom - 164),
    minX: spacing.md,
    minY: insets.top + spacing.md,
  };
  const clampPip = (x: number, y: number) => ({
    x: Math.min(Math.max(x, pipBounds.minX), pipBounds.maxX),
    y: Math.min(Math.max(y, pipBounds.minY), pipBounds.maxY),
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          dragStart.current = pip;
          movedDuringGesture.current = false;
        },
        onPanResponderMove: (_, gesture) => {
          movedDuringGesture.current = true;
          setPip(clampPip(dragStart.current.x + gesture.dx, dragStart.current.y + gesture.dy));
        },
      }),
    [pip, pipBounds.maxX, pipBounds.maxY, pipBounds.minX, pipBounds.minY],
  );

  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const toggleControls = () => {
    if (movedDuringGesture.current) {
      movedDuringGesture.current = false;
      return;
    }
    setControlsVisible(value => !value);
  };

  if (mode === 'audio') {
    return (
      <View style={styles.audioCallScreen}>
        <Text style={styles.callLabel}>Исходящий аудиозвонок</Text>
        <View style={[styles.callAvatar, { backgroundColor: chat.avatarColor }]}>
          <Text style={styles.callAvatarText}>{chat.initials}</Text>
        </View>
        <Text style={styles.callName}>{chat.name}</Text>
        <Text style={styles.callQuality}>{connected ? elapsed : 'Вызов...'}</Text>
        <CallControls
          audioRoute={audioRoute}
          cameraOff={cameraOff}
          mode={mode}
          muted={muted}
          onEnd={onEnd}
          onToggleAudioRoute={onToggleAudioRoute}
          onToggleCamera={onToggleCamera}
          onToggleCameraFacing={onToggleCameraFacing}
          onToggleMuted={onToggleMuted}
        />
      </View>
    );
  }

  return (
    <View style={styles.videoCallScreen}>
      <Pressable onPress={toggleControls} style={StyleSheet.absoluteFill}>
        <MockVideoSurface
          cameraFacing={connected ? 'back' : cameraFacing}
          cameraOff={connected ? false : cameraOff}
          color={connected ? chat.avatarColor : colors.accent}
          label={connected ? chat.name : 'Вы'}
        />
      </Pressable>
      {controlsVisible ? (
        <View pointerEvents="none" style={styles.videoTopOverlay}>
          <Text numberOfLines={1} style={styles.videoCallName}>
            {chat.name}
          </Text>
          <Text style={styles.videoCallStatus}>{connected ? elapsed : 'Вызов...'}</Text>
        </View>
      ) : null}
      {connected ? (
        <View {...panResponder.panHandlers} style={[styles.pipVideo, { left: pip.x, top: pip.y }]}>
          <MockVideoSurface cameraFacing={cameraFacing} cameraOff={cameraOff} color={colors.accent} label="Вы" compact />
        </View>
      ) : null}
      {controlsVisible ? (
        <View style={styles.floatingControls}>
          <CallControls
            audioRoute={audioRoute}
            cameraOff={cameraOff}
            mode={mode}
            muted={muted}
            onEnd={onEnd}
            onToggleAudioRoute={onToggleAudioRoute}
            onToggleCamera={onToggleCamera}
            onToggleCameraFacing={onToggleCameraFacing}
            onToggleMuted={onToggleMuted}
          />
        </View>
      ) : null}
    </View>
  );
}

function MockVideoSurface({
  cameraFacing,
  cameraOff,
  color,
  compact = false,
  label,
}: {
  cameraFacing: 'front' | 'back';
  cameraOff: boolean;
  color: string;
  compact?: boolean;
  label: string;
}) {
  const styles = useStyles();
  if (cameraOff) {
    return (
      <View style={styles.videoOffSurface}>
        <VideoOff color="#ffffff" size={compact ? 22 : 34} strokeWidth={2.4} />
      </View>
    );
  }
  return (
    <View style={[styles.mockVideoSurface, { backgroundColor: color }]}>
      <View style={styles.mockVideoGlow} />
      <Text numberOfLines={1} style={compact ? styles.mockVideoCompactText : styles.mockVideoText}>
        {label}
      </Text>
      <Text style={compact ? styles.mockVideoCompactMeta : styles.mockVideoMeta}>{cameraFacing === 'front' ? 'front' : 'back'}</Text>
    </View>
  );
}

function CallControls({
  audioRoute,
  cameraOff,
  mode,
  muted,
  onEnd,
  onToggleAudioRoute,
  onToggleCamera,
  onToggleCameraFacing,
  onToggleMuted,
}: {
  audioRoute: AudioRoute;
  cameraOff: boolean;
  mode: CallMode;
  muted: boolean;
  onEnd: () => void;
  onToggleAudioRoute: () => void;
  onToggleCamera: () => void;
  onToggleCameraFacing: () => void;
  onToggleMuted: () => void;
}) {
  const styles = useStyles();
  const iconColor = '#ffffff';
  const disabledIconColor = '#10231c';
  return (
    <View style={styles.callControls}>
      <IconCallButton
        accessibilityLabel={muted ? 'Включить микрофон' : 'Выключить микрофон'}
        active={!muted}
        icon={muted ? <MicOff color={disabledIconColor} size={26} /> : <Mic color={iconColor} size={26} />}
        onPress={onToggleMuted}
      />
      {mode === 'video' ? (
        <IconCallButton
          accessibilityLabel={cameraOff ? 'Включить камеру' : 'Выключить камеру'}
          active={!cameraOff}
          icon={cameraOff ? <VideoOff color={disabledIconColor} size={26} /> : <Video color={iconColor} size={26} />}
          onPress={onToggleCamera}
        />
      ) : null}
      <IconCallButton
        accessibilityLabel={audioRoute === 'speaker' ? 'Переключить на разговорный динамик' : 'Включить громкую связь'}
        active
        icon={audioRoute === 'speaker' ? <Volume2 color={iconColor} size={26} /> : <Ear color={iconColor} size={26} />}
        onPress={onToggleAudioRoute}
      />
      {mode === 'video' ? (
        <IconCallButton
          accessibilityLabel="Сменить камеру"
          active
          icon={<SwitchCamera color={iconColor} size={26} />}
          onPress={onToggleCameraFacing}
        />
      ) : null}
      <IconCallButton accessibilityLabel="Завершить звонок" danger icon={<PhoneOff color={iconColor} size={26} />} onPress={onEnd} />
    </View>
  );
}

function IconCallButton({
  accessibilityLabel,
  active = true,
  danger = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  active?: boolean;
  danger?: boolean;
  icon: ReactNode;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.callIconButton, !active && styles.callIconButtonOff, danger && styles.callIconButtonDanger]}
    >
      {icon}
    </Pressable>
  );
}

function CallsTab() {
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <Text style={styles.sectionTitle}>Звонки</Text>
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Последний демо-звонок</Text>
        <Text style={styles.bodyText}>Мама и папа · видео 240p · 12 минут · примерно 48 МБ.</Text>
      </View>
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Лестница соединения</Text>
        <Text style={styles.bodyText}>Прямое соединение, домашний узел, зарубежный ретранслятор, затем аудио или видеосообщение.</Text>
      </View>
    </View>
  );
}

function FamilyTab() {
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <Text style={styles.sectionTitle}>Семья</Text>
      {FAMILY_MEMBERS.map(member => (
        <View key={member.name} style={styles.familyRow}>
          <View style={[styles.avatarSmall, { backgroundColor: member.color }]}>
            <Text style={styles.avatarSmallText}>{member.initials}</Text>
          </View>
          <View>
            <Text style={styles.chatName}>{member.name}</Text>
            <Text style={styles.chatPreview}>{member.role}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SettingsTab({
  connectionHints,
  trafficMode,
  onSetConnectionHints,
  onSetTrafficMode,
}: {
  connectionHints: boolean;
  trafficMode: TrafficModeKey;
  onSetConnectionHints: (value: boolean) => void;
  onSetTrafficMode: (value: TrafficModeKey) => void;
}) {
  const { colors, preference, setPreference } = useTheme();
  const styles = useStyles();
  const selectedMode = TRAFFIC_MODES.find(mode => mode.key === trafficMode) ?? TRAFFIC_MODES[1];
  return (
    <View style={styles.stack}>
      <Text style={styles.sectionTitle}>Настройки</Text>
      <View style={styles.profilePanel}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>АМ</Text>
        </View>
        <View>
          <Text style={styles.chatName}>Айгуль М.</Text>
          <Text style={styles.chatPreview}>Демо-профиль, без аккаунта</Text>
        </View>
      </View>
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Профиль трафика</Text>
        <View style={styles.segmented}>
          {TRAFFIC_MODES.map(mode => (
            <Pressable
              accessibilityRole="button"
              key={mode.key}
              onPress={() => onSetTrafficMode(mode.key)}
              style={[styles.segment, trafficMode === mode.key && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, trafficMode === mode.key && styles.segmentTextActive]}>{mode.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.bodyText}>{selectedMode.description}</Text>
      </View>
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Тема</Text>
        <View style={styles.segmented}>
          {THEME_OPTIONS.map(option => (
            <Pressable
              accessibilityRole="button"
              key={option.key}
              onPress={() => setPreference(option.key)}
              style={[styles.segment, preference === option.key && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, preference === option.key && styles.segmentTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Расход за месяц</Text>
        <Text style={styles.usageNumber}>184 МБ</Text>
        <Text style={styles.bodyText}>Демо-оценка: сообщения 12 МБ, звонки 172 МБ.</Text>
      </View>
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Соединение</Text>
        <Text style={styles.bodyText}>Сейчас показан макет: прямое соединение доступно, запасной ретранслятор готов.</Text>
        <View style={styles.switchRow}>
          <Text style={styles.bodyText}>Показывать подсказки качества</Text>
          <Switch
            onValueChange={onSetConnectionHints}
            thumbColor={connectionHints ? colors.accent : colors.surface}
            trackColor={{ false: colors.border, true: colors.accentSoft }}
            value={connectionHints}
          />
        </View>
      </View>
    </View>
  );
}

function BottomTabs({ activeTab, onSelect }: { activeTab: TabKey; onSelect: (tab: TabKey) => void }) {
  const styles = useStyles();
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'chats', label: 'Чаты' },
    { key: 'calls', label: 'Звонки' },
    { key: 'family', label: 'Семья' },
    { key: 'settings', label: 'Настройки' },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map(tab => (
        <Pressable accessibilityRole="tab" key={tab.key} onPress={() => onSelect(tab.key)} style={styles.tabButton}>
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          {activeTab === tab.key ? <View style={styles.tabIndicator} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

function useStyles() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return useMemo(() => createStyles(colors, insets), [colors, insets]);
}

const createStyles = (colors: ThemeColors, insets: { top: number; bottom: number }) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  appShell: { flex: 1, backgroundColor: colors.background },
  welcome: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingTop: insets.top + spacing.xl, gap: spacing.md },
  brandMark: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  brandMarkText: { color: colors.surface, fontSize: 34, fontWeight: '800' },
  heroTitle: { color: colors.text, fontSize: 42, fontWeight: '800' },
  heroText: { color: colors.textSecondary, fontSize: typography.lg, lineHeight: 25 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: insets.top + spacing.md,
  },
  headerTitle: { color: colors.accentDark, fontSize: 28, fontWeight: '800' },
  headerSubtitle: { color: colors.textMuted, fontSize: typography.sm, marginTop: 2 },
  statusPill: { backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  statusPillText: { color: colors.accentDark, fontSize: typography.xs, fontWeight: '700' },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  stack: { gap: spacing.md },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  chatRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    padding: spacing.md,
  },
  pressed: { opacity: 0.72 },
  avatar: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarText: { color: colors.surface, fontSize: typography.md, fontWeight: '800' },
  avatarSmall: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarSmallText: { color: colors.surface, fontSize: typography.sm, fontWeight: '800' },
  chatMain: { flex: 1, gap: 4 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  chatName: { color: colors.text, flexShrink: 1, fontSize: typography.md, fontWeight: '700' },
  chatTime: { color: colors.textMuted, fontSize: typography.xs },
  chatPreview: { color: colors.textSecondary, flexShrink: 1, fontSize: typography.sm },
  trafficLabel: { color: colors.accent, fontSize: typography.xs, fontWeight: '700' },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadText: { color: colors.surface, fontSize: typography.xs, fontWeight: '800' },
  hintText: { color: colors.textMuted, fontSize: typography.sm },
  emptyState: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: typography.lg, fontWeight: '800' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: { color: colors.surface, fontSize: typography.md, fontWeight: '800' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: { color: colors.accent, fontSize: typography.md, fontWeight: '800' },
  infoPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  infoTitle: { color: colors.text, fontSize: typography.md, fontWeight: '800' },
  bodyText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 21 },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
  conversationHeader: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: insets.top + spacing.sm,
  },
  iconButton: { alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
  iconButtonText: { color: colors.accent, fontSize: 32, fontWeight: '700' },
  conversationTitle: { flex: 1 },
  headerAction: { alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  headerActionText: { color: colors.accent, fontSize: typography.sm, fontWeight: '800' },
  messages: { flexGrow: 1, gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.xl },
  dateDivider: {
    alignSelf: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    color: colors.accentDark,
    fontSize: typography.xs,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  messageBubble: { borderRadius: radius.lg, maxWidth: '82%', padding: spacing.sm },
  incomingBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderTopLeftRadius: 4 },
  outgoingBubble: { alignSelf: 'flex-end', backgroundColor: colors.outgoing, borderTopRightRadius: 4 },
  messageText: { color: colors.text, fontSize: typography.md, lineHeight: 22 },
  messageMeta: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: typography.xs, marginTop: 4 },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: insets.bottom + spacing.sm,
    paddingTop: spacing.sm,
  },
  attachButton: { alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
  attachText: { color: colors.textMuted, fontSize: 28 },
  composerInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: typography.md,
    maxHeight: 112,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
  sendButtonText: { color: colors.surface, fontSize: 22, fontWeight: '800' },
  audioCallScreen: {
    alignItems: 'center',
    backgroundColor: colors.callBackground,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  callLabel: { color: colors.callMuted, fontSize: typography.sm, fontWeight: '700' },
  callAvatar: { alignItems: 'center', borderRadius: radius.full, height: 112, justifyContent: 'center', width: 112 },
  callAvatarText: { color: colors.surface, fontSize: 38, fontWeight: '900' },
  callName: { color: colors.surface, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  callQuality: { color: colors.callMuted, fontSize: typography.md, textAlign: 'center' },
  videoCallScreen: {
    backgroundColor: colors.callBackground,
    flex: 1,
  },
  mockVideoSurface: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mockVideoGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    transform: [{ rotate: '-18deg' }, { scale: 1.4 }],
  },
  mockVideoText: { color: colors.surface, fontSize: 34, fontWeight: '900', textAlign: 'center' },
  mockVideoMeta: { color: colors.surface, fontSize: typography.sm, fontWeight: '800', marginTop: spacing.sm, opacity: 0.74 },
  mockVideoCompactText: { color: colors.surface, fontSize: typography.md, fontWeight: '900', textAlign: 'center' },
  mockVideoCompactMeta: { color: colors.surface, fontSize: 10, fontWeight: '800', marginTop: 2, opacity: 0.74 },
  videoOffSurface: {
    alignItems: 'center',
    backgroundColor: colors.videoSurface,
    flex: 1,
    justifyContent: 'center',
  },
  videoTopOverlay: {
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    top: insets.top + spacing.md,
  },
  videoCallName: { color: colors.surface, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  videoCallStatus: { color: colors.surface, fontSize: typography.md, fontWeight: '800', marginTop: 4, opacity: 0.85, textAlign: 'center' },
  pipVideo: {
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: radius.md,
    borderWidth: 2,
    height: 148,
    overflow: 'hidden',
    position: 'absolute',
    width: 116,
  },
  floatingControls: {
    bottom: insets.bottom + spacing.lg,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  callControls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  callIconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,35,28,0.72)',
    borderRadius: radius.full,
    height: 56,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    width: 56,
  },
  callIconButtonOff: { backgroundColor: '#ffffff' },
  callIconButtonDanger: {
    backgroundColor: colors.danger,
  },
  familyRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  profilePanel: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  segmented: { backgroundColor: colors.background, borderRadius: radius.md, flexDirection: 'row', padding: 4 },
  segment: { alignItems: 'center', borderRadius: radius.sm, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 6 },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '800' },
  segmentTextActive: { color: colors.surface },
  usageNumber: { color: colors.accentDark, fontSize: 34, fontWeight: '900' },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  tabs: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingBottom: insets.bottom + 4,
  },
  tabButton: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 56 },
  tabText: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '800' },
  tabTextActive: { color: colors.accent },
  tabIndicator: { backgroundColor: colors.accent, borderRadius: radius.full, height: 4, marginTop: 5, width: 24 },
});
