import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  Archive,
  BellOff,
  Camera,
  Check,
  Ear,
  EllipsisVertical,
  Mic,
  MicOff,
  MessageCircle,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Pin,
  Search,
  Settings,
  Trash2,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ImageStyle, LayoutChangeEvent, StyleProp } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BackHandler,
  Animated,
  Image,
  Keyboard,
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
  INITIAL_CALL_LOG,
  THEME_OPTIONS,
  TRAFFIC_MODES,
} from '../ui/demoData';
import {
  clearChatSearchQuery,
  clearChatSelection,
  clearFamilySelection,
  closeChatSearch,
  getCallLogDisplayModel,
  getCallbackCallMode,
  getChatPreview,
  getMissedCallCount,
  getOrderedChats,
  getTotalUnreadCount,
  openChatSearch,
  selectTab,
  startChatSelection,
  startFamilySelection,
  toggleChatSelection,
  toggleFamilySelection,
  updateChatSearchQuery,
} from '../ui/state';
import { ThemeProvider, useTheme } from '../ui/theme';
import { radius, spacing, typography, type ThemeColors } from '../ui/tokens';
import { CallLogEntry, Chat, TabKey, TrafficModeKey } from '../ui/types';
import {
  EMPTY_CHATS_TEXT,
  LOCAL_LOADING_TEXT,
  type LocalDataSnapshot,
} from '../messages/localMessageStore';
import { ConversationScreen } from './screens/ConversationScreen';

type Screen = 'welcome' | 'home' | 'conversation' | 'call';
type CallMode = 'audio' | 'video';
type AudioRoute = 'speaker' | 'earpiece';
type LocalAvatar = { color: string; initials: string };

// React Native resolves bundled image assets through static require calls.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BRAND_MARK = require('../../assets/brand/che-tam-brand-mark.png') as number;
const SELF_AVATAR: LocalAvatar = { color: '#116149', initials: 'АМ' };
export const CALL_UNAVAILABLE_TEXT = 'Звонки появятся позже';
export const HEADER_TO_FIRST_CONTENT_ROW_GAP = spacing.sm;
const PIP_WIDTH = 116;
const PIP_HEIGHT = 148;
const PIP_CONTROLS_GAP = spacing.lg;
const VIDEO_CONTROLS_FALLBACK_HEIGHT = 120;

type PreviewAppShellProps = {
  isLocalTestModeEnabled?: boolean;
  snapshot: LocalDataSnapshot;
  onClearUnread: (chatId: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onRetryMessage: (clientMessageId: string) => Promise<{ retried: boolean }>;
  onSendMessage: (chatId: string, draft: string) => Promise<{ sent: boolean; clientMessageId: string | null }>;
};

export function resolveFamilyCallChatId(chats: Chat[], memberName: string): string | null {
  return chats.find(chat => chat.name === memberName)?.id ?? null;
}

export function resolveCallLogChatId(chats: Chat[], entry: CallLogEntry): string | null {
  return chats.some(chat => chat.id === entry.chatId) ? entry.chatId : null;
}

export type CallActionResolution =
  | { type: 'open'; chatId: string; mode: CallMode }
  | { type: 'fallback'; text: typeof CALL_UNAVAILABLE_TEXT };

export function resolveFamilyCallAction(chats: Chat[], memberName: string, mode: CallMode): CallActionResolution {
  const chatId = resolveFamilyCallChatId(chats, memberName);
  return chatId ? { type: 'open', chatId, mode } : { type: 'fallback', text: CALL_UNAVAILABLE_TEXT };
}

export function resolveCallLogAction(chats: Chat[], entry: CallLogEntry): CallActionResolution {
  const chatId = resolveCallLogChatId(chats, entry);
  return chatId ? { type: 'open', chatId, mode: getCallbackCallMode(entry.callbackType) } : { type: 'fallback', text: CALL_UNAVAILABLE_TEXT };
}

export function getSettingsAvatarModel(): LocalAvatar {
  return SELF_AVATAR;
}

export function getHeaderToFirstContentRowGap(tab: TabKey): number {
  void tab;
  return HEADER_TO_FIRST_CONTENT_ROW_GAP;
}

export default function PreviewAppShell(props: PreviewAppShellProps) {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ThemeProvider>
          <ThemedApp {...props} />
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp({ isLocalTestModeEnabled = false, snapshot, onClearUnread, onRetry, onRetryMessage, onSendMessage }: PreviewAppShellProps) {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [activeTab, setActiveTab] = useState<TabKey>('chats');
  const [selectedChatId, setSelectedChatId] = useState('');
  const [chatSearch, setChatSearch] = useState({ active: false, query: '' });
  const [composer, setComposer] = useState('');
  const [trafficMode, setTrafficMode] = useState<TrafficModeKey>('economy');
  const [expandedWelcome, setExpandedWelcome] = useState(false);
  const [callMode, setCallMode] = useState<CallMode>('audio');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [audioRoute, setAudioRoute] = useState<AudioRoute>('speaker');
  const [, setCameraFacing] = useState<'front' | 'back'>('front');
  const [connectionHints, setConnectionHints] = useState(true);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);
  const [callFallbackText, setCallFallbackText] = useState<string | null>(null);

  const { mode } = useTheme();
  const styles = useStyles();
  const chats = snapshot.chats;
  const messagesByChat = snapshot.messagesByChat;
  const orderedChats = useMemo(() => getOrderedChats(chats, chatSearch.query, messagesByChat), [chats, chatSearch.query, messagesByChat]);
  const selectedChat = chats.find(chat => chat.id === selectedChatId) ?? chats[0];
  const selectedMessages = selectedChat ? messagesByChat[selectedChat.id] ?? [] : [];
  const callLog = INITIAL_CALL_LOG;

  const goBack = () => {
    if (selectedChatIds.length > 0) {
      setSelectedChatIds(clearChatSelection().selectedIds);
      return true;
    }
    if (selectedFamilyIds.length > 0) {
      setSelectedFamilyIds(clearFamilySelection().selectedIds);
      return true;
    }
    if (screen === 'home' && activeTab === 'chats' && chatSearch.active) {
      Keyboard.dismiss();
      setChatSearch(closeChatSearch());
      return true;
    }
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
  }, [screen, activeTab, selectedChatIds.length, selectedFamilyIds.length, chatSearch.active]);

  useEffect(() => {
    if (selectedChatId && !chats.some(chat => chat.id === selectedChatId)) {
      setSelectedChatId(chats[0]?.id ?? '');
      if (screen === 'conversation' || screen === 'call') setScreen('home');
    }
  }, [chats, screen, selectedChatId]);

  const enterDemo = () => {
    setActiveTab('chats');
    setScreen('home');
  };

  const openChat = async (chatId: string) => {
    await onClearUnread(chatId);
    setSelectedChatId(chatId);
    setScreen('conversation');
  };

  const startSelectingChat = (chatId: string) => {
    setSelectedChatIds(startChatSelection(chatId).selectedIds);
  };

  const toggleSelectedChat = (chatId: string) => {
    setSelectedChatIds(current => toggleChatSelection(current, chatId).selectedIds);
  };

  const cancelChatSelection = () => {
    setSelectedChatIds(clearChatSelection().selectedIds);
  };

  const startSelectingFamilyMember = (memberId: string) => {
    setSelectedFamilyIds(startFamilySelection(memberId).selectedIds);
  };

  const toggleSelectedFamilyMember = (memberId: string) => {
    setSelectedFamilyIds(current => toggleFamilySelection(current, memberId).selectedIds);
  };

  const cancelFamilySelection = () => {
    setSelectedFamilyIds(clearFamilySelection().selectedIds);
  };

  const startChatSearch = () => {
    if (selectedChatIds.length > 0) {
      return;
    }
    setChatSearch(current => openChatSearch(current));
  };

  const updateChatSearch = (value: string) => {
    setChatSearch(current => updateChatSearchQuery(current, value));
  };

  const clearChatSearch = () => {
    setChatSearch(current => clearChatSearchQuery(current));
  };

  const cancelChatSearch = () => {
    Keyboard.dismiss();
    setChatSearch(closeChatSearch());
  };

  const selectHomeTab = (tab: TabKey) => {
    if (tab !== 'chats' && chatSearch.active) {
      Keyboard.dismiss();
      setChatSearch(closeChatSearch());
    }
    if (tab !== 'chats' && selectedChatIds.length > 0) {
      setSelectedChatIds(clearChatSelection().selectedIds);
    }
    if (tab !== 'family' && selectedFamilyIds.length > 0) {
      setSelectedFamilyIds(clearFamilySelection().selectedIds);
    }
    setActiveTab(current => selectTab(current, tab));
  };

  const startCall = (mode: CallMode) => {
    setCallMode(mode);
    setCameraOff(false);
    setCameraFacing('front');
    setScreen('call');
  };

  const sendMessage = async () => {
    if (!selectedChat) return;
    const result = await onSendMessage(selectedChat.id, composer);
    if (result.sent) setComposer('');
  };

  const startCallFromLog = (entry: CallLogEntry) => {
    const action = resolveCallLogAction(chats, entry);
    if (action.type === 'fallback') {
      setCallFallbackText(action.text);
      return;
    }
    setCallFallbackText(null);
    setSelectedChatId(action.chatId);
    startCall(action.mode);
  };

  const startFamilyCall = (memberName: string, mode: CallMode) => {
    const action = resolveFamilyCallAction(chats, memberName, mode);
    if (action.type === 'fallback') {
      setCallFallbackText(action.text);
      return;
    }
    setCallFallbackText(null);
    setSelectedChatId(action.chatId);
    startCall(action.mode);
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
          dataErrorText={snapshot.errorText}
          dataStatus={snapshot.status}
          callLog={callLog}
          callFallbackText={callFallbackText}
          connectionHints={connectionHints}
          isLocalTestModeEnabled={isLocalTestModeEnabled}
          query={chatSearch.query}
          searchActive={chatSearch.active}
          selectedChatIds={selectedChatIds}
          selectedFamilyIds={selectedFamilyIds}
          trafficMode={trafficMode}
          onCancelChatSelection={cancelChatSelection}
          onCancelFamilySelection={cancelFamilySelection}
          onCancelSearch={cancelChatSearch}
          onClearSearch={clearChatSearch}
          onOpenChat={openChat}
          onRetryLocalData={() => void onRetry()}
          onOpenSearch={startChatSearch}
          onQuery={updateChatSearch}
          onSelectTab={selectHomeTab}
          onSetConnectionHints={setConnectionHints}
          onSetTrafficMode={setTrafficMode}
          onStartSelectingChat={startSelectingChat}
          onStartSelectingFamilyMember={startSelectingFamilyMember}
          onStartCallFromLog={startCallFromLog}
          onStartFamilyCall={startFamilyCall}
          onToggleSelectedChat={toggleSelectedChat}
          onToggleSelectedFamilyMember={toggleSelectedFamilyMember}
        />
      ) : null}
      {screen === 'conversation' && selectedChat ? (
        <ConversationScreen
          chat={selectedChat}
          composer={composer}
          dataErrorText={snapshot.errorText}
          dataStatus={snapshot.status}
          messages={selectedMessages}
          onBack={() => setScreen('home')}
          onComposer={setComposer}
          onRetryMessage={(clientMessageId) => void onRetryMessage(clientMessageId)}
          onSendMessage={sendMessage}
          onStartCall={startCall}
          onRetryLocalData={() => void onRetry()}
        />
      ) : null}
      {screen === 'call' && selectedChat ? (
        <CallScreen
          cameraOff={cameraOff}
          chat={selectedChat}
          mode={callMode}
          muted={muted}
          selfAvatar={SELF_AVATAR}
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
      <BrandMark style={styles.brandMarkHero} />
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
            Здесь нет аккаунта, сервера, камеры или микрофона. Демо показывает семейные чаты,
            локальные сообщения, макеты звонков и настройки расхода трафика.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function HomeScreen({
  activeTab,
  chats,
  dataErrorText,
  dataStatus,
  callLog,
  callFallbackText,
  connectionHints,
  isLocalTestModeEnabled,
  query,
  searchActive,
  selectedChatIds,
  selectedFamilyIds,
  trafficMode,
  onCancelChatSelection,
  onCancelFamilySelection,
  onCancelSearch,
  onClearSearch,
  onOpenChat,
  onRetryLocalData,
  onOpenSearch,
  onQuery,
  onSelectTab,
  onSetConnectionHints,
  onSetTrafficMode,
  onStartSelectingChat,
  onStartSelectingFamilyMember,
  onStartCallFromLog,
  onStartFamilyCall,
  onToggleSelectedChat,
  onToggleSelectedFamilyMember,
}: {
  activeTab: TabKey;
  chats: Chat[];
  dataErrorText: string | null;
  dataStatus: LocalDataSnapshot['status'];
  callLog: CallLogEntry[];
  callFallbackText: string | null;
  connectionHints: boolean;
  isLocalTestModeEnabled: boolean;
  query: string;
  searchActive: boolean;
  selectedChatIds: string[];
  selectedFamilyIds: string[];
  trafficMode: TrafficModeKey;
  onCancelChatSelection: () => void;
  onCancelFamilySelection: () => void;
  onCancelSearch: () => void;
  onClearSearch: () => void;
  onOpenChat: (chatId: string) => void;
  onRetryLocalData: () => void;
  onOpenSearch: () => void;
  onQuery: (value: string) => void;
  onSelectTab: (tab: TabKey) => void;
  onSetConnectionHints: (value: boolean) => void;
  onSetTrafficMode: (value: TrafficModeKey) => void;
  onStartSelectingChat: (chatId: string) => void;
  onStartSelectingFamilyMember: (memberId: string) => void;
  onStartCallFromLog: (entry: CallLogEntry) => void;
  onStartFamilyCall: (memberName: string, mode: CallMode) => void;
  onToggleSelectedChat: (chatId: string) => void;
  onToggleSelectedFamilyMember: (memberId: string) => void;
}) {
  const styles = useStyles();
  const chatSelectionMode = activeTab === 'chats' && selectedChatIds.length > 0;
  const familySelectionMode = activeTab === 'family' && selectedFamilyIds.length > 0;
  return (
    <View style={styles.appShell}>
      {chatSelectionMode ? (
        <SelectionHeader count={selectedChatIds.length} onCancel={onCancelChatSelection} />
      ) : familySelectionMode ? (
        <SelectionHeader count={selectedFamilyIds.length} onCancel={onCancelFamilySelection} />
      ) : activeTab === 'chats' ? (
        <ChatsHeader
          query={query}
          searchActive={searchActive}
          onCancelSearch={onCancelSearch}
          onClearSearch={onClearSearch}
          onOpenSearch={onOpenSearch}
          onQuery={onQuery}
        />
      ) : (
        <TopLevelHeader subtitle={getTabSubtitle(activeTab)} onSearch={() => undefined} />
      )}
      <ScrollView contentContainerStyle={styles.content}>
        {callFallbackText && (activeTab === 'calls' || activeTab === 'family') ? (
          <Text accessibilityLiveRegion="polite" style={styles.fallbackText}>{callFallbackText}</Text>
        ) : null}
        {activeTab === 'chats' ? (
          <LocalChatsPanel
            chats={chats}
            errorText={dataErrorText}
            status={dataStatus}
            selectedChatIds={selectedChatIds}
            onOpenChat={onOpenChat}
            onRetry={onRetryLocalData}
            onStartSelectingChat={onStartSelectingChat}
            onToggleSelectedChat={onToggleSelectedChat}
          />
        ) : null}
        {activeTab === 'calls' ? <CallsTab callLog={callLog} onStartCall={onStartCallFromLog} /> : null}
        {activeTab === 'family' ? (
          <FamilyTab
            selectedFamilyIds={selectedFamilyIds}
            onStartCall={onStartFamilyCall}
            onStartSelectingFamilyMember={onStartSelectingFamilyMember}
            onToggleSelectedFamilyMember={onToggleSelectedFamilyMember}
          />
        ) : null}
        {activeTab === 'settings' ? (
          <SettingsTab
            connectionHints={connectionHints}
            isLocalTestModeEnabled={isLocalTestModeEnabled}
            trafficMode={trafficMode}
            onSetConnectionHints={onSetConnectionHints}
            onSetTrafficMode={onSetTrafficMode}
          />
        ) : null}
      </ScrollView>
      <BottomTabs activeTab={activeTab} chats={chats} callLog={callLog} onSelect={onSelectTab} />
    </View>
  );
}

function getTabSubtitle(tab: TabKey): string {
  if (tab === 'calls') {
    return 'Звонки';
  }
  if (tab === 'family') {
    return 'Семья';
  }
  return 'Настройки';
}

function TopLevelHeader({ subtitle, onSearch }: { subtitle: string; onSearch: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.topHeader}>
      <View style={styles.topHeaderBrand}>
        <BrandMark style={styles.brandMarkHeader} />
        <View style={styles.topHeaderText}>
          <Text style={styles.topHeaderTitle}>Чё-Там</Text>
          <Text style={styles.topHeaderSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <HeaderIconButton accessibilityLabel="Поиск" icon={<Search color={colors.accent} size={24} />} onPress={onSearch} />
    </View>
  );
}

function ChatsHeader({
  query,
  searchActive,
  onCancelSearch,
  onClearSearch,
  onOpenSearch,
  onQuery,
}: {
  query: string;
  searchActive: boolean;
  onCancelSearch: () => void;
  onClearSearch: () => void;
  onOpenSearch: () => void;
  onQuery: (value: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const progress = useRef(new Animated.Value(searchActive ? 1 : 0)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.timing(progress, {
      duration: 180,
      toValue: searchActive ? 1 : 0,
      useNativeDriver: true,
    }).start();
    if (searchActive) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [progress, searchActive]);

  const normalOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const searchOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const normalTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const searchTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <View style={styles.chatsHeader}>
      <Animated.View
        pointerEvents={searchActive ? 'none' : 'auto'}
        style={[styles.headerLayer, { opacity: normalOpacity, transform: [{ translateY: normalTranslate }] }]}
      >
        <View style={styles.topHeaderBrand}>
          <BrandMark style={styles.brandMarkHeader} />
          <View style={styles.topHeaderText}>
            <Text style={styles.topHeaderTitle}>Чё-Там</Text>
            <Text style={styles.topHeaderSubtitle}>Семейные разговоры</Text>
          </View>
        </View>
        <HeaderIconButton accessibilityLabel="Открыть поиск" icon={<Search color={colors.accent} size={24} />} onPress={onOpenSearch} />
      </Animated.View>
      <Animated.View
        pointerEvents={searchActive ? 'auto' : 'none'}
        style={[styles.headerLayer, { opacity: searchOpacity, transform: [{ translateY: searchTranslate }] }]}
      >
        <HeaderIconButton accessibilityLabel="Закрыть поиск" icon={<ArrowLeft color={colors.accent} size={24} />} onPress={onCancelSearch} />
        <TextInput
          accessibilityLabel="Поиск по семье и сообщениям"
          autoFocus={searchActive}
          onChangeText={onQuery}
          placeholder="Поиск по семье и сообщениям"
          placeholderTextColor={colors.textMuted}
          ref={inputRef}
          returnKeyType="search"
          style={styles.headerSearchInput}
          value={query}
        />
        <HeaderIconButton accessibilityLabel="Очистить поиск" icon={<X color={colors.accent} size={24} />} onPress={onClearSearch} />
      </Animated.View>
    </View>
  );
}

function SelectionHeader({ count, onCancel }: { count: number; onCancel: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const actions: { label: string; icon: ReactNode }[] = [
    { label: 'Закрепить выбранные', icon: <Pin color={colors.accent} size={22} /> },
    { label: 'Удалить выбранные', icon: <Trash2 color={colors.accent} size={22} /> },
    { label: 'Без уведомлений', icon: <BellOff color={colors.accent} size={22} /> },
    { label: 'Архивировать выбранные', icon: <Archive color={colors.accent} size={22} /> },
    { label: 'Ещё', icon: <EllipsisVertical color={colors.accent} size={22} /> },
  ];
  return (
    <View style={styles.selectionHeader}>
      <HeaderIconButton accessibilityLabel="Отменить выделение" icon={<ArrowLeft color={colors.accent} size={24} />} onPress={onCancel} />
      <Text accessibilityLiveRegion="polite" style={styles.selectionCount}>
        {count}
      </Text>
      <View style={styles.selectionActions}>
        {actions.map(action => (
          <HeaderIconButton accessibilityLabel={action.label} icon={action.icon} key={action.label} onPress={() => undefined} />
        ))}
      </View>
    </View>
  );
}

function BrandMark({ style }: { style: StyleProp<ImageStyle> }) {
  return <Image accessibilityIgnoresInvertColors source={BRAND_MARK} style={style} />;
}

function AboutBrand() {
  const styles = useStyles();
  return (
    <View style={styles.aboutBrand}>
      <BrandMark style={styles.brandMarkAbout} />
      <View style={styles.aboutBrandText}>
        <Text style={styles.infoTitle}>О приложении</Text>
        <Text style={styles.bodyText}>Чё-Там - семейный мессенджер для сообщений и звонков на слабой связи.</Text>
      </View>
    </View>
  );
}

function LocalChatsPanel({
  chats,
  errorText,
  status,
  selectedChatIds,
  onOpenChat,
  onRetry,
  onStartSelectingChat,
  onToggleSelectedChat,
}: {
  chats: Chat[];
  errorText: string | null;
  status: LocalDataSnapshot['status'];
  selectedChatIds: string[];
  onOpenChat: (chatId: string) => void;
  onRetry: () => void;
  onStartSelectingChat: (chatId: string) => void;
  onToggleSelectedChat: (chatId: string) => void;
}) {
  const styles = useStyles();
  if (status === 'loading') return <View style={styles.emptyState}><Text style={styles.emptyTitle}>{LOCAL_LOADING_TEXT}</Text></View>;
  if (status === 'error') return <View style={styles.emptyState}><Text style={styles.emptyTitle}>{errorText}</Text><Pressable accessibilityLabel="Повторить открытие локальных данных" accessibilityRole="button" onPress={onRetry} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Попробовать ещё раз</Text></Pressable></View>;
  if (!chats.length) return <View style={styles.emptyState}><Text style={styles.emptyTitle}>{EMPTY_CHATS_TEXT}</Text></View>;
  return <ChatList chats={chats} selectedChatIds={selectedChatIds} onOpenChat={onOpenChat} onStartSelectingChat={onStartSelectingChat} onToggleSelectedChat={onToggleSelectedChat} />;
}

function ChatList({
  chats,
  selectedChatIds,
  onOpenChat,
  onStartSelectingChat,
  onToggleSelectedChat,
}: {
  chats: Chat[];
  selectedChatIds: string[];
  onOpenChat: (chatId: string) => void;
  onStartSelectingChat: (chatId: string) => void;
  onToggleSelectedChat: (chatId: string) => void;
}) {
  const styles = useStyles();
  const selectionMode = selectedChatIds.length > 0;
  const handlePress = (chatId: string) => {
    if (selectionMode) {
      onToggleSelectedChat(chatId);
      return;
    }
    onOpenChat(chatId);
  };
  return (
    <View style={styles.chatList}>
      {chats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Ничего не найдено</Text>
          <Text style={styles.bodyText}>Попробуйте другое имя или слово из последнего сообщения.</Text>
        </View>
      ) : null}
      {chats.map(chat => (
        <ChatListRow
          chat={chat}
          selected={selectedChatIds.includes(chat.id)}
          selectionMode={selectionMode}
          key={chat.id}
          onLongPress={() => (selectionMode ? handlePress(chat.id) : onStartSelectingChat(chat.id))}
          onPress={() => handlePress(chat.id)}
        />
      ))}
    </View>
  );
}

function ChatListRow({
  chat,
  selected,
  selectionMode,
  onLongPress,
  onPress,
}: {
  chat: Chat;
  selected: boolean;
  selectionMode: boolean;
  onLongPress: () => void;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const selectedProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(selectedProgress, {
      duration: 130,
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [selected, selectedProgress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={{ color: colors.accentSoft, borderless: false }}
      delayLongPress={220}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
    >
      <Animated.View pointerEvents="none" style={[styles.chatSelectionFill, { opacity: selectedProgress }]} />
      <View style={styles.chatAvatarWrap}>
        <View style={[styles.avatar, { backgroundColor: chat.avatarColor }]}>
          <Text style={styles.avatarText}>{chat.initials}</Text>
        </View>
        {selected || selectionMode ? (
          <Animated.View
            style={[
              styles.selectedCheck,
              {
                opacity: selectedProgress,
                transform: [{ scale: selectedProgress.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }],
              },
            ]}
          >
            <Check color={colors.surface} size={14} strokeWidth={3} />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.chatMain}>
        <View style={styles.rowBetween}>
          <Text numberOfLines={1} style={styles.chatName}>
            {chat.name}
          </Text>
          <Text style={styles.chatTime}>{chat.time}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.chatPreview}>
            {getChatPreview(chat)}
          </Text>
          {chat.unread > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{chat.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function HeaderIconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={styles.headerIconButton}>
      {icon}
    </Pressable>
  );
}

function CallScreen({
  audioRoute,
  cameraOff,
  chat,
  mode,
  muted,
  selfAvatar,
  onEnd,
  onToggleAudioRoute,
  onToggleCamera,
  onToggleCameraFacing,
  onToggleMuted,
}: {
  audioRoute: AudioRoute;
  cameraOff: boolean;
  chat: Chat;
  mode: CallMode;
  muted: boolean;
  selfAvatar: LocalAvatar;
  onEnd: () => void;
  onToggleAudioRoute: () => void;
  onToggleCamera: () => void;
  onToggleCameraFacing: () => void;
  onToggleMuted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const styles = useStyles();
  const [callPhase, setCallPhase] = useState<'calling' | 'connecting' | 'connected'>('calling');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoControlsHeight, setVideoControlsHeight] = useState(VIDEO_CONTROLS_FALLBACK_HEIGHT);
  const [pip, setPip] = useState(() => ({ x: dimensions.width - 132, y: insets.top + 84 }));
  const dragStart = useRef(pip);
  const movedDuringGesture = useRef(false);

  useEffect(() => {
    setCallPhase('calling');
    setElapsedSeconds(0);
    setControlsVisible(true);
    setPip({ x: dimensions.width - 132, y: insets.top + 84 });
    const timers =
      mode === 'audio'
        ? [setTimeout(() => setCallPhase('connecting'), 1100), setTimeout(() => setCallPhase('connected'), 2400)]
        : [setTimeout(() => setCallPhase('connected'), 1800)];
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [chat.id, dimensions.width, insets.top, mode]);

  useEffect(() => {
    if (callPhase !== 'connected') {
      return undefined;
    }
    const timer = setInterval(() => setElapsedSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [callPhase]);

  const pipBounds = {
    maxX: Math.max(spacing.md, dimensions.width - PIP_WIDTH - spacing.md),
    maxY: Math.max(
      insets.top + spacing.md,
      dimensions.height - insets.bottom - spacing.lg - videoControlsHeight - PIP_CONTROLS_GAP - PIP_HEIGHT,
    ),
    minX: spacing.md,
    minY: insets.top + spacing.md,
  };
  useEffect(() => {
    setPip(current => {
      const next = {
        x: Math.min(Math.max(current.x, pipBounds.minX), pipBounds.maxX),
        y: Math.min(Math.max(current.y, pipBounds.minY), pipBounds.maxY),
      };
      return next.x === current.x && next.y === current.y ? current : next;
    });
  }, [pipBounds.maxX, pipBounds.maxY, pipBounds.minX, pipBounds.minY]);
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
  const statusText = callPhase === 'connected' ? elapsed : callPhase === 'connecting' ? 'Соединение...' : 'Вызов...';
  const toggleControls = () => {
    if (movedDuringGesture.current) {
      movedDuringGesture.current = false;
      return;
    }
    setControlsVisible(value => !value);
  };
  const handleVideoControlsLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== videoControlsHeight) {
      setVideoControlsHeight(nextHeight);
    }
  };

  if (mode === 'audio') {
    return (
      <View style={styles.audioCallScreen}>
        <CallBackdrop avatarColor={chat.avatarColor} initials={chat.initials} />
        <View style={styles.audioCallIdentity}>
          <View style={[styles.callAvatar, { backgroundColor: chat.avatarColor }]}>
            <Text style={styles.callAvatarText}>{chat.initials}</Text>
          </View>
          <Text numberOfLines={1} style={styles.callName}>
            {chat.name}
          </Text>
          <Text style={styles.callQuality}>{statusText}</Text>
        </View>
        <View style={styles.audioControlsPanel}>
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
      </View>
    );
  }

  return (
    <View style={styles.videoCallScreen}>
      <Pressable onPress={toggleControls} style={StyleSheet.absoluteFill}>
        <MockVideoSurface
          avatarColor={chat.avatarColor}
          connected={callPhase === 'connected'}
          initials={chat.initials}
        />
      </Pressable>
      {controlsVisible ? (
        <View pointerEvents="none" style={styles.videoTopOverlay}>
          <Text numberOfLines={1} style={styles.videoCallName}>
            {chat.name}
          </Text>
          <Text style={styles.videoCallStatus}>{callPhase === 'connected' ? elapsed : 'Вызов...'}</Text>
        </View>
      ) : null}
      {callPhase === 'connected' ? (
        <View {...panResponder.panHandlers} style={[styles.pipVideo, { left: pip.x, top: pip.y }]}>
          <SelfPreview avatar={selfAvatar} cameraOff={cameraOff} />
        </View>
      ) : null}
      {controlsVisible ? (
        <View onLayout={handleVideoControlsLayout} style={styles.floatingControls}>
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
  avatarColor,
  connected,
  initials,
}: {
  avatarColor: string;
  connected: boolean;
  initials: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.mockVideoSurface, { backgroundColor: avatarColor }]}>
      <View style={connected ? styles.remoteVideoWash : styles.remoteAvatarBlur}>
        <Text style={connected ? styles.remoteVideoInitials : styles.remoteAvatarInitials}>{initials}</Text>
      </View>
      <View style={connected ? styles.remoteVideoGlow : styles.remoteWaitingShade} />
    </View>
  );
}

function SelfPreview({ avatar, cameraOff }: { avatar: LocalAvatar; cameraOff: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (cameraOff) {
    return (
      <View style={[styles.selfPreviewSurface, { backgroundColor: colors.accent }]}>
        <Text style={styles.selfPreviewAvatar}>{avatar.initials}</Text>
        <VideoOff color="#ffffff" size={24} strokeWidth={2.5} />
      </View>
    );
  }
  return (
    <View style={[styles.selfPreviewSurface, { backgroundColor: colors.accent }]}>
      <View style={styles.selfPreviewGlow} />
      <Camera color="#ffffff" size={26} strokeWidth={2.4} />
    </View>
  );
}

function CallBackdrop({ avatarColor, initials }: { avatarColor: string; initials: string }) {
  const styles = useStyles();
  return (
    <View pointerEvents="none" style={[styles.callBackdrop, { backgroundColor: avatarColor }]}>
      <Text style={styles.callBackdropInitials}>{initials}</Text>
      <View style={styles.callBackdropShade} />
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

function CallsTab({
  callLog,
  onStartCall,
}: {
  callLog: CallLogEntry[];
  onStartCall: (entry: CallLogEntry) => void;
}) {
  const styles = useStyles();
  const display = getCallLogDisplayModel(callLog);
  return (
    <View style={styles.fullWidthList}>
      {display.empty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{display.emptyText}</Text>
        </View>
      ) : (
        display.rows.map(entry => <CallLogRow entry={entry} key={entry.id} onStartCall={onStartCall} />)
      )}
    </View>
  );
}

function CallLogRow({ entry, onStartCall }: { entry: CallLogEntry; onStartCall: (entry: CallLogEntry) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isMissed = entry.direction === 'missed';
  const directionColor = isMissed ? colors.danger : colors.accent;
  const directionIcon =
    entry.direction === 'incoming' ? (
      <PhoneIncoming color={directionColor} size={17} />
    ) : entry.direction === 'outgoing' ? (
      <PhoneOutgoing color={directionColor} size={17} />
    ) : (
      <PhoneMissed color={directionColor} size={17} />
    );
  const callbackIcon =
    entry.callbackType === 'video' ? <Video color={colors.accent} size={22} /> : <Phone color={colors.accent} size={22} />;
  const callbackLabel = entry.callbackType === 'video' ? `Перезвонить ${entry.name} по видео` : `Перезвонить ${entry.name} голосом`;
  const directionLabel =
    entry.direction === 'incoming' ? 'Входящий' : entry.direction === 'outgoing' ? 'Исходящий' : 'Пропущенный';
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: colors.accentSoft, borderless: false }}
      onPress={() => undefined}
      style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
    >
      <View style={styles.chatAvatarWrap}>
        <View style={[styles.avatar, { backgroundColor: entry.avatarColor }]}>
          <Text style={styles.avatarText}>{entry.initials}</Text>
        </View>
      </View>
      <View style={styles.callLogMain}>
        <Text numberOfLines={1} style={styles.chatName}>
          {entry.name}
        </Text>
        <View style={styles.callLogMeta}>
          {directionIcon}
          <Text numberOfLines={1} style={[styles.chatPreview, isMissed && styles.callLogMissedText]}>
            {directionLabel} · {formatCallLogTime(entry.occurredAt)}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={callbackLabel}
        accessibilityRole="button"
        onPress={() => onStartCall(entry)}
        style={({ pressed }) => [styles.callLogAction, pressed && styles.pressed]}
      >
        {callbackIcon}
      </Pressable>
    </Pressable>
  );
}

function formatCallLogTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function FamilyTab({
  selectedFamilyIds,
  onStartCall,
  onStartSelectingFamilyMember,
  onToggleSelectedFamilyMember,
}: {
  selectedFamilyIds: string[];
  onStartCall: (memberName: string, mode: CallMode) => void;
  onStartSelectingFamilyMember: (memberId: string) => void;
  onToggleSelectedFamilyMember: (memberId: string) => void;
}) {
  const styles = useStyles();
  const selectionMode = selectedFamilyIds.length > 0;
  return (
    <View style={styles.fullWidthList}>
      {FAMILY_MEMBERS.map(member => (
        <FamilyRow
          key={member.name}
          member={member}
          selected={selectedFamilyIds.includes(member.name)}
          selectionMode={selectionMode}
          onStartCall={onStartCall}
          onLongPress={() => (selectionMode ? onToggleSelectedFamilyMember(member.name) : onStartSelectingFamilyMember(member.name))}
          onPress={() => (selectionMode ? onToggleSelectedFamilyMember(member.name) : undefined)}
        />
      ))}
    </View>
  );
}

function FamilyRow({
  member,
  selected,
  selectionMode,
  onLongPress,
  onPress,
  onStartCall,
}: {
  member: (typeof FAMILY_MEMBERS)[number];
  selected: boolean;
  selectionMode: boolean;
  onLongPress: () => void;
  onPress: () => void;
  onStartCall: (memberName: string, mode: CallMode) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const selectedProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(selectedProgress, {
      duration: 130,
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [selected, selectedProgress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={{ color: colors.accentSoft, borderless: false }}
      delayLongPress={220}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.chatRow, member.name === 'Айгуль М.' && styles.familySelfRow, pressed && styles.chatRowPressed]}
    >
      <Animated.View pointerEvents="none" style={[styles.chatSelectionFill, { opacity: selectedProgress }]} />
      <View style={styles.chatAvatarWrap}>
        <View style={[styles.avatar, { backgroundColor: member.color }]}>
          <Text style={styles.avatarText}>{member.initials}</Text>
        </View>
        {selected || selectionMode ? (
          <Animated.View
            style={[
              styles.selectedCheck,
              {
                opacity: selectedProgress,
                transform: [{ scale: selectedProgress.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }],
              },
            ]}
          >
            <Check color={colors.surface} size={14} strokeWidth={3} />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.chatMain}>
        <Text numberOfLines={1} style={styles.chatName}>
          {member.name}
        </Text>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.chatPreview}>
          {member.role}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`Позвонить ${member.name} голосом`}
        accessibilityRole="button"
        disabled={selectionMode}
        onPress={() => onStartCall(member.name, 'audio')}
        style={({ pressed }) => [styles.callLogAction, pressed && styles.pressed, selectionMode && styles.disabledAction]}
      >
        <Phone color={selectionMode ? colors.textMuted : colors.accent} size={22} />
      </Pressable>
      <Pressable
        accessibilityLabel={`Позвонить ${member.name} по видео`}
        accessibilityRole="button"
        disabled={selectionMode}
        onPress={() => onStartCall(member.name, 'video')}
        style={({ pressed }) => [styles.callLogAction, pressed && styles.pressed, selectionMode && styles.disabledAction]}
      >
        <Video color={selectionMode ? colors.textMuted : colors.accent} size={22} />
      </Pressable>
    </Pressable>
  );
}

function SettingsTab({
  connectionHints,
  isLocalTestModeEnabled,
  trafficMode,
  onSetConnectionHints,
  onSetTrafficMode,
}: {
  connectionHints: boolean;
  isLocalTestModeEnabled: boolean;
  trafficMode: TrafficModeKey;
  onSetConnectionHints: (value: boolean) => void;
  onSetTrafficMode: (value: TrafficModeKey) => void;
}) {
  const { colors, preference, setPreference } = useTheme();
  const styles = useStyles();
  const selectedMode = TRAFFIC_MODES.find(mode => mode.key === trafficMode) ?? TRAFFIC_MODES[1];
  return (
    <View style={styles.stack}>
      <View style={styles.profilePanel}>
        <View style={[styles.avatar, { backgroundColor: SELF_AVATAR.color }]}>
          <Text style={styles.avatarText}>{SELF_AVATAR.initials}</Text>
        </View>
        <View>
          <Text style={styles.chatName}>Айгуль М.</Text>
          <Text style={styles.chatPreview}>Демо-профиль, без аккаунта</Text>
        </View>
      </View>
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Профиль трафика</Text>
        {isLocalTestModeEnabled ? <Text accessibilityLabel="Тестовая сборка" style={styles.bodyText}>Тестовая сборка</Text> : null}
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
      <View style={styles.infoPanel}>
        <AboutBrand />
      </View>
    </View>
  );
}

function BottomTabs({
  activeTab,
  chats,
  callLog,
  onSelect,
}: {
  activeTab: TabKey;
  chats: Chat[];
  callLog: CallLogEntry[];
  onSelect: (tab: TabKey) => void;
}) {
  const styles = useStyles();
  const tabs: { key: TabKey; label: string; accessibilityLabel: string; icon: typeof MessageCircle; badge?: number }[] = [
    { key: 'chats', label: 'Чаты', accessibilityLabel: 'Чаты', icon: MessageCircle, badge: getTotalUnreadCount(chats) },
    { key: 'calls', label: 'Звонки', accessibilityLabel: 'Звонки', icon: Phone, badge: getMissedCallCount(callLog) },
    { key: 'family', label: 'Семья', accessibilityLabel: 'Семья', icon: Users },
    { key: 'settings', label: 'Настройки', accessibilityLabel: 'Настройки', icon: Settings },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map(tab => {
        return (
          <BottomTabButton
            badge={tab.badge ?? 0}
            Icon={tab.icon}
            key={tab.key}
            label={tab.label}
            accessibilityLabel={tab.accessibilityLabel}
            onPress={() => onSelect(tab.key)}
            selected={activeTab === tab.key}
          />
        );
      })}
    </View>
  );
}

function BottomTabButton({
  Icon,
  accessibilityLabel,
  badge,
  label,
  onPress,
  selected,
}: {
  Icon: typeof MessageCircle;
  accessibilityLabel: string;
  badge: number;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const selectedProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(selectedProgress, {
      duration: 170,
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [selected, selectedProgress]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.tabButton}
    >
      <View style={styles.tabIconSlot}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabActiveCapsule,
            {
              opacity: selectedProgress,
              transform: [{ scaleX: selectedProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }],
            },
          ]}
        />
        <Icon color={selected ? colors.accentDark : colors.textMuted} size={24} strokeWidth={2.4} />
        {badge > 0 ? (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tabText, selected && styles.tabTextActive]}>{label}</Text>
    </Pressable>
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
  brandMarkHero: { height: 104, width: 104 },
  heroTitle: { color: colors.text, fontSize: 42, fontWeight: '800' },
  heroText: { color: colors.textSecondary, fontSize: typography.lg, lineHeight: 25 },
  topHeader: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flexDirection: 'row',
    height: insets.top + 64,
    justifyContent: 'space-between',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingBottom: 0,
    paddingTop: insets.top,
  },
  topHeaderBrand: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12, minWidth: 0 },
  topHeaderText: { flex: 1, minWidth: 0 },
  brandMarkHeader: { height: 48, width: 48 },
  topHeaderTitle: { color: colors.accentDark, fontSize: 25, fontWeight: '800' },
  topHeaderSubtitle: { color: colors.textMuted, fontSize: typography.sm, marginTop: 2 },
  headerSubtitle: { color: colors.textMuted, fontSize: typography.sm, marginTop: 2 },
  chatsHeader: {
    backgroundColor: colors.background,
    height: insets.top + 64,
    paddingTop: insets.top,
  },
  headerLayer: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    minHeight: 64,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    position: 'absolute',
    right: 0,
    top: insets.top,
  },
  headerSearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.md,
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  selectionHeader: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: insets.top + spacing.md,
  },
  selectionCount: { color: colors.text, flex: 1, fontSize: 22, fontWeight: '800' },
  selectionActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0 },
  content: { padding: spacing.md, paddingTop: HEADER_TO_FIRST_CONTENT_ROW_GAP, paddingBottom: spacing.xl, gap: spacing.md },
  stack: { gap: spacing.md },
  chatList: { marginHorizontal: -spacing.md },
  fullWidthList: { marginHorizontal: -spacing.md },
  chatRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chatRowPressed: { backgroundColor: 'rgba(17,97,73,0.10)' },
  chatSelectionFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.72 },
  chatAvatarWrap: { height: 52, width: 52 },
  avatar: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarText: { color: colors.surface, fontSize: typography.md, fontWeight: '800' },
  selectedCheck: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 2,
    bottom: -1,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 22,
  },
  avatarSmall: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarSmallText: { color: colors.surface, fontSize: typography.sm, fontWeight: '800' },
  chatMain: { flex: 1, gap: 4, minWidth: 0 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  chatName: { color: colors.text, flexShrink: 1, fontSize: typography.md, fontWeight: '700' },
  chatTime: { color: colors.textMuted, flexShrink: 0, fontSize: typography.xs },
  chatPreview: { color: colors.textSecondary, flex: 1, fontSize: typography.sm, minWidth: 0 },
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
  fallbackText: { color: colors.danger, fontSize: typography.sm, fontWeight: '800' },
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
  aboutBrand: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  aboutBrandText: { flex: 1, gap: 4 },
  brandMarkAbout: { height: 56, width: 56 },
  infoTitle: { color: colors.text, fontSize: typography.md, fontWeight: '800' },
  bodyText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 21 },
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
  headerIconButton: { alignItems: 'center', borderRadius: radius.full, height: 48, justifyContent: 'center', width: 48 },
  conversationTitle: { flex: 1, minWidth: 0 },
  connectionBanner: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700' },
  messageArea: { backgroundColor: colors.background, flex: 1 },
  messageList: { flex: 1 },
  messages: { flexGrow: 1, gap: spacing.sm, justifyContent: 'flex-start', padding: spacing.md, paddingBottom: 92 },
  chatPattern: {
    bottom: 0,
    left: 0,
    opacity: 0.26,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  patternDot: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    height: 9,
    position: 'absolute',
    width: 9,
  },
  patternDotOne: { left: '18%', top: '20%' },
  patternDotTwo: { right: '14%', top: '62%' },
  patternRing: {
    borderColor: colors.accentSoft,
    borderRadius: radius.full,
    borderWidth: 2,
    height: 28,
    position: 'absolute',
    width: 28,
  },
  patternRingOne: { right: '24%', top: '34%' },
  patternRingTwo: { left: '12%', top: '72%' },
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
  messageBubble: { borderRadius: 16, maxWidth: '82%', minWidth: 74, paddingHorizontal: spacing.sm, paddingBottom: 5, paddingTop: 7 },
  incomingBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  incomingBubbleTail: { borderTopLeftRadius: 4 },
  outgoingBubble: { alignSelf: 'flex-end', backgroundColor: colors.outgoing, borderTopRightRadius: 4 },
  messageText: { color: colors.text, fontSize: typography.md, lineHeight: 22 },
  messageMetaRow: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 2, marginTop: 3 },
  messageMeta: { color: colors.textMuted, fontSize: typography.xs },
  callEventBubble: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    maxWidth: '88%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  missedCallEventBubble: { borderColor: 'rgba(185, 28, 28, 0.24)' },
  callEventText: { color: colors.textSecondary, flexShrink: 1, fontSize: typography.xs, fontWeight: '700' },
  missedCallEventText: { color: colors.danger },
  callEventTime: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: -1 },
  composerOverlay: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 7,
    paddingBottom: insets.bottom + 7,
    paddingHorizontal: 7,
    paddingTop: 7,
  },
  composerCapsule: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  composerIconButton: { alignItems: 'center', borderRadius: radius.full, height: 40, justifyContent: 'center', width: 38 },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.md,
    lineHeight: 21,
    maxHeight: 126, // Six 21dp lines before the input scrolls internally.
    minHeight: 40,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === 'android' ? 8 : 10,
    paddingBottom: Platform.OS === 'android' ? 7 : 9,
  },
  composerAction: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radius.full, height: 48, justifyContent: 'center', width: 48 },
  composerActionIcon: { position: 'absolute' },
  localOnlyComposerNote: { color: colors.textMuted, fontSize: 11, paddingBottom: 4, paddingHorizontal: spacing.md, textAlign: 'center' },
  audioCallScreen: {
    alignItems: 'center',
    backgroundColor: colors.callBackground,
    flex: 1,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingBottom: insets.bottom + spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: insets.top + spacing.xl,
  },
  callBackdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.95,
  },
  callBackdropInitials: { color: colors.surface, fontSize: 168, fontWeight: '900', opacity: 0.13 },
  callBackdropShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5,14,11,0.68)',
  },
  audioCallIdentity: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    maxWidth: '100%',
    zIndex: 1,
  },
  callLabel: { color: colors.callMuted, fontSize: typography.sm, fontWeight: '700' },
  callAvatar: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.full,
    borderWidth: 1,
    height: 112,
    justifyContent: 'center',
    width: 112,
  },
  callAvatarText: { color: colors.surface, fontSize: 38, fontWeight: '900' },
  callName: { color: colors.surface, fontSize: 30, fontWeight: '800', maxWidth: '100%', textAlign: 'center' },
  callQuality: { color: colors.callMuted, fontSize: typography.md, textAlign: 'center' },
  audioControlsPanel: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(8,19,15,0.64)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 30,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    zIndex: 1,
  },
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
  remoteVideoGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  remoteVideoWash: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
  },
  remoteVideoInitials: { color: colors.surface, fontSize: 220, fontWeight: '900', opacity: 0.08 },
  remoteAvatarBlur: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1.18 }],
  },
  remoteAvatarInitials: { color: colors.surface, fontSize: 176, fontWeight: '900', opacity: 0.24 },
  remoteWaitingShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5,14,11,0.42)',
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
    borderRadius: 16,
    elevation: 8,
    height: PIP_HEIGHT,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    width: PIP_WIDTH,
  },
  selfPreviewSurface: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selfPreviewAvatar: { color: colors.surface, fontSize: 28, fontWeight: '900' },
  selfPreviewGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.10)',
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
  callLogMain: { flex: 1, gap: 6, minWidth: 0 },
  callLogMeta: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  callLogMissedText: { color: colors.danger },
  callLogAction: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 48,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    width: 48,
  },
  disabledAction: { opacity: 0.5 },
  familySelfRow: { marginBottom: spacing.xs },
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
    minHeight: 72,
    paddingBottom: insets.bottom + 6,
    paddingTop: 6,
  },
  tabButton: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center', minHeight: 56 },
  tabIconSlot: { alignItems: 'center', height: 32, justifyContent: 'center', width: 64 },
  tabActiveCapsule: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tabText: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '800' },
  tabTextActive: { color: colors.accentDark },
  tabBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: 14,
    top: -2,
  },
  tabBadgeText: { color: colors.surface, fontSize: 10, fontWeight: '900' },
});
