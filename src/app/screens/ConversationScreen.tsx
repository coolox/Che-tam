import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  EllipsisVertical,
  Mic,
  Paperclip,
  Phone,
  PhoneMissed,
  SendHorizontal,
  Smile,
  Video,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectionStatus, type NetworkAvailabilitySource } from '../../hooks/useConnectionStatus';
import {
  CONVERSATION_KEYBOARD_AVOIDING_PROPS,
  reduceConversationScrollIntent,
  type ConversationScrollIntentEvent,
  type ConversationScrollIntentState,
} from './conversationKeyboard';
import {
  EMPTY_CONVERSATION_TEXT,
  LOCAL_LOADING_TEXT,
  type LocalDataErrorDiagnostic,
  type LocalDataSnapshot,
} from '../../messages/localMessageStore';
import {
  formatMessageTime,
  getComposerState,
  getConversationDateItems,
  getMessagePresentation,
  type ConversationDateItem,
} from '../../ui/state';
import { useTheme } from '../../ui/theme';
import { radius, spacing, typography, type ThemeColors } from '../../ui/tokens';
import type { Chat, Message } from '../../ui/types';

type CallMode = 'audio' | 'video';

type ConversationScreenProps = {
  chat: Chat;
  connectionStatusSource?: NetworkAvailabilitySource;
  composer: string;
  dataErrorDiagnostic: LocalDataErrorDiagnostic | null;
  dataErrorText: string | null;
  dataStatus: LocalDataSnapshot['status'];
  isLocalTestModeEnabled: boolean;
  messages: Message[];
  onBack: () => void;
  onComposer: (value: string) => void;
  onSendMessage: () => void;
  onStartCall: (mode: CallMode) => void;
  onRetryLocalData: () => void;
  onRetryMessage: (clientMessageId: string) => void;
};

export function ConversationScreen({
  chat,
  connectionStatusSource,
  composer,
  dataErrorDiagnostic,
  dataErrorText,
  dataStatus,
  isLocalTestModeEnabled,
  messages,
  onBack,
  onComposer,
  onSendMessage,
  onStartCall,
  onRetryLocalData,
  onRetryMessage,
}: ConversationScreenProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const connection = useConnectionStatus(connectionStatusSource);
  const conversationItems = useMemo(() => getConversationDateItems(messages), [messages]);
  const reversedConversationItems = useMemo(() => [...conversationItems].reverse(), [conversationItems]);
  const composerState = getComposerState(composer);
  const actionTransition = useRef(new Animated.Value(composerState.action === 'send' ? 1 : 0)).current;
  const listRef = useRef<FlatList<ConversationDateItem>>(null);
  const latestMessage = messages.at(-1) ?? null;
  const scrollIntentState = useRef<ConversationScrollIntentState>({
    isAtLatest: true,
    latestMessageId: latestMessage?.id ?? null,
  });

  const requestScrollToLatest = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ animated, offset: 0 });
  }, []);

  const applyScrollIntent = useCallback((event: ConversationScrollIntentEvent, animated = true) => {
    const result = reduceConversationScrollIntent(scrollIntentState.current, event);
    scrollIntentState.current = result.state;
    if (result.scrollToLatest) {
      requestScrollToLatest(animated);
    }
  }, [requestScrollToLatest]);

  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    applyScrollIntent({ type: 'scrolled', offsetY: event.nativeEvent.contentOffset.y });
  }, [applyScrollIntent]);

  useEffect(() => {
    Animated.timing(actionTransition, {
      duration: 160,
      toValue: composerState.action === 'send' ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [actionTransition, composerState.action]);

  useEffect(() => {
    applyScrollIntent({ type: 'enter' }, false);
  }, [applyScrollIntent]);

  useEffect(() => {
    applyScrollIntent({
      type: 'messagesChanged',
      latestMessageId: latestMessage?.id ?? null,
      latestMessageSender: latestMessage?.sender ?? null,
    });
  }, [applyScrollIntent, latestMessage?.id, latestMessage?.sender]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      applyScrollIntent({ type: 'keyboardOpened' });
    });

    return () => subscription.remove();
  }, [applyScrollIntent]);

  return (
    <KeyboardAvoidingView {...CONVERSATION_KEYBOARD_AVOIDING_PROPS} style={styles.appShell}>
      <View style={styles.conversationHeader}>
        <HeaderIconButton accessibilityLabel="Назад" icon={<ArrowLeft color={colors.accent} size={24} />} onPress={onBack} />
        <View style={[styles.avatarSmall, { backgroundColor: chat.avatarColor }]}>
          <Text style={styles.avatarSmallText}>{chat.initials}</Text>
        </View>
        <View style={styles.conversationTitle}>
          <Text numberOfLines={1} style={styles.chatName}>
            {chat.name}
          </Text>
          <Text
            accessibilityLabel={connection.accessibilityLabel}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
            numberOfLines={1}
            style={[styles.connectionBanner, connection.status === 'online' && styles.connectionBannerOnline]}
          >
            {connection.text}
          </Text>
        </View>
        <HeaderIconButton accessibilityLabel="Аудиозвонок" icon={<Phone color={colors.accent} size={22} />} onPress={() => onStartCall('audio')} />
        <HeaderIconButton accessibilityLabel="Видеозвонок" icon={<Video color={colors.accent} size={22} />} onPress={() => onStartCall('video')} />
        <HeaderIconButton accessibilityLabel="Меню чата" icon={<EllipsisVertical color={colors.accent} size={22} />} onPress={() => undefined} />
      </View>
      <View style={styles.messageArea}>
        <View pointerEvents="none" style={styles.chatPattern}>
          <View style={[styles.patternDot, styles.patternDotOne]} />
          <View style={[styles.patternDot, styles.patternDotTwo]} />
          <View style={[styles.patternRing, styles.patternRingOne]} />
          <View style={[styles.patternRing, styles.patternRingTwo]} />
        </View>
        <FlatList
          contentContainerStyle={styles.messages}
          data={reversedConversationItems}
          inverted
          keyboardShouldPersistTaps="handled"
          keyExtractor={item => item.key}
          ListFooterComponent={
            dataStatus === 'loading' ? <Text style={styles.dateDivider}>{LOCAL_LOADING_TEXT}</Text>
              : dataStatus === 'error' ? <View style={styles.emptyState}><Text style={styles.emptyTitle}>{dataErrorText}</Text><LocalDataErrorDiagnosticText diagnostic={dataErrorDiagnostic} enabled={isLocalTestModeEnabled} /><Pressable accessibilityLabel="Повторить открытие локальных данных" accessibilityRole="button" onPress={onRetryLocalData} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Попробовать ещё раз</Text></Pressable></View>
                : messages.length === 0 ? <Text style={styles.dateDivider}>{EMPTY_CONVERSATION_TEXT}</Text>
                  : null
          }
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={handleMessageScroll}
          ref={listRef}
          renderItem={({ item }) => (
            item.itemType === 'dateDivider'
              ? <Text accessibilityLabel={item.label} accessibilityRole="text" style={styles.dateDivider}>{item.label}</Text>
              : <MessageBubble message={item.message} messages={messages} onRetryMessage={onRetryMessage} />
          )}
          scrollEventThrottle={32}
          style={styles.messageList}
        />
      </View>
      <View style={styles.composerOverlay}>
        <View style={styles.composerCapsule}>
          <ComposerIconButton accessibilityLabel="Смайлы" icon={<Smile color={colors.textMuted} size={22} />} />
          <TextInput
            accessibilityLabel="Текст сообщения"
            multiline
            onChangeText={onComposer}
            placeholder="Сообщение"
            placeholderTextColor={colors.textMuted}
            scrollEnabled
            style={styles.composerInput}
            value={composer}
          />
          <ComposerIconButton accessibilityLabel="Вложение" icon={<Paperclip color={colors.textMuted} size={22} />} />
          {composerState.showCamera ? <ComposerIconButton accessibilityLabel="Камера" icon={<Camera color={colors.textMuted} size={22} />} /> : null}
        </View>
        <Pressable
          accessibilityLabel={composerState.action === 'send' ? 'Отправить сообщение' : 'Голосовое сообщение'}
          accessibilityRole="button"
          onPress={composerState.action === 'send' ? onSendMessage : undefined}
          style={styles.composerAction}
        >
          <Animated.View
            style={[
              styles.composerActionIcon,
              {
                opacity: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ scale: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) }],
              },
            ]}
          >
            <Mic color={colors.surface} size={23} />
          </Animated.View>
          <Animated.View
            style={[
              styles.composerActionIcon,
              {
                opacity: actionTransition,
                transform: [{ scale: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) }],
              },
            ]}
          >
            <SendHorizontal color={colors.surface} size={23} />
          </Animated.View>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function LocalDataErrorDiagnosticText({
  diagnostic,
  enabled,
}: {
  diagnostic: LocalDataErrorDiagnostic | null;
  enabled: boolean;
}) {
  const styles = useStyles();
  if (!enabled || !diagnostic) return null;
  return (
    <Text accessibilityLabel={`Диагностика локальной ошибки: ${diagnostic.name}: ${diagnostic.message}`} style={styles.localDataErrorDiagnostic}>
      {diagnostic.name}: {diagnostic.message}
    </Text>
  );
}

function ComposerIconButton({ accessibilityLabel, icon }: { accessibilityLabel: string; icon: ReactNode }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={() => undefined} style={styles.composerIconButton}>
      {icon}
    </Pressable>
  );
}

function MessageBubble({ message, messages, onRetryMessage }: { message: Message; messages: Message[]; onRetryMessage: (clientMessageId: string) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const presentation = getMessagePresentation(messages, message);
  if (presentation.isCallEvent) {
    return (
      <View style={[styles.callEventBubble, presentation.isMissedCall && styles.missedCallEventBubble]}>
        {presentation.isMissedCall ? <PhoneMissed color={colors.danger} size={17} /> : <Phone color={colors.textMuted} size={17} />}
        <Text style={[styles.callEventText, presentation.isMissedCall && styles.missedCallEventText]}>{message.text}</Text>
        <Text style={styles.callEventTime}>{formatMessageTime(message.createdAt)}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.messageBubble,
        message.sender === 'me' ? styles.outgoingBubble : styles.incomingBubble,
        presentation.incomingTail && styles.incomingBubbleTail,
      ]}
    >
      <Text style={styles.messageText}>{message.text}</Text>
      <View style={styles.messageMetaRow}>
        <Text style={styles.messageMeta}>{formatMessageTime(message.createdAt)}</Text>
        <LocalDeliveryControl message={message} state={presentation.localDeliveryState} onRetryMessage={onRetryMessage} />
        <ReceiptIcon state={presentation.receipt} />
      </View>
    </View>
  );
}

function LocalDeliveryControl({
  message,
  onRetryMessage,
  state,
}: {
  message: Message;
  onRetryMessage: (clientMessageId: string) => void;
  state: 'queued' | 'sent' | 'not_sent' | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (state === 'queued') {
    return <Clock3 accessibilityLabel="В очереди" color={colors.textMuted} size={14} strokeWidth={2.4} />;
  }
  if (state === 'sent') {
    return <Check accessibilityLabel="Отправлено" color={colors.textMuted} size={15} strokeWidth={2.5} />;
  }
  if (state === 'not_sent' && message.clientMessageId && message.kind === 'text') {
    return (
      <View style={styles.notSentControl}>
        <CircleAlert accessibilityLabel="Не отправлено" color={colors.danger} size={15} strokeWidth={2.5} />
        <Pressable
          accessibilityLabel="Повторить отправку"
          accessibilityRole="button"
          onPress={() => onRetryMessage(message.clientMessageId as string)}
          style={styles.retryMessageButton}
        >
          <Text style={styles.retryMessageText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}

function ReceiptIcon({ state }: { state: 'none' | 'sent' | 'delivered' | 'read' }) {
  const { colors } = useTheme();
  if (state === 'none') {
    return null;
  }
  const iconColor = state === 'read' ? colors.accent : colors.textMuted;
  return state === 'sent' ? <Check color={iconColor} size={15} strokeWidth={2.5} /> : <CheckCheck color={iconColor} size={15} strokeWidth={2.5} />;
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

function useStyles() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return useMemo(() => createStyles(colors, insets), [colors, insets]);
}

const createStyles = (colors: ThemeColors, insets: { top: number; bottom: number }) => StyleSheet.create({
  appShell: { flex: 1, backgroundColor: colors.background },
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
  avatarSmall: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarSmallText: { color: colors.surface, fontSize: typography.sm, fontWeight: '800' },
  conversationTitle: { flex: 1, minWidth: 0 },
  chatName: { color: colors.text, flexShrink: 1, fontSize: typography.md, fontWeight: '700' },
  connectionBanner: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700' },
  connectionBannerOnline: { color: colors.accent },
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
  emptyState: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: typography.lg, fontWeight: '800' },
  localDataErrorDiagnostic: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 18, textAlign: 'center' },
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
  messageBubble: { borderRadius: 16, maxWidth: '82%', minWidth: 74, paddingHorizontal: spacing.sm, paddingBottom: 5, paddingTop: 7 },
  incomingBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  incomingBubbleTail: { borderTopLeftRadius: 4 },
  outgoingBubble: { alignSelf: 'flex-end', backgroundColor: colors.outgoing, borderTopRightRadius: 4 },
  messageText: { color: colors.text, fontSize: typography.md, lineHeight: 22 },
  messageMetaRow: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 2, marginTop: 3 },
  messageMeta: { color: colors.textMuted, fontSize: typography.xs },
  notSentControl: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  retryMessageButton: { justifyContent: 'center', minHeight: 24 },
  retryMessageText: { color: colors.danger, fontSize: typography.xs, fontWeight: '800' },
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
});
