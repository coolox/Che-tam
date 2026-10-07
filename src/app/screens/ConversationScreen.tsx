import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  Copy,
  EllipsisVertical,
  Mic,
  Paperclip,
  Phone,
  PhoneMissed,
  Reply,
  SendHorizontal,
  Smile,
  Trash2,
  Video,
  X,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
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
  closeMessageActionSheet,
  createReplyTarget,
  formatReplyPreview,
  formatMessageTime,
  getDeliveryIndicatorPresentation,
  getDeliveryIndicatorState,
  getComposerState,
  getConversationDateItems,
  getMessagePresentation,
  openMessageActionSheet,
  requestMessageDeleteConfirmation,
  type MessageActionSheetState,
  type ReplyTarget,
  type ConversationDateItem,
  type DeliveryIndicatorState,
} from '../../ui/state';
import { useTheme } from '../../ui/theme';
import { radius, spacing, typography, type ThemeColors } from '../../ui/tokens';
import type { Chat, Message } from '../../ui/types';
import { expoClipboardWriter, type ClipboardWriter } from '../clipboard';
import {
  initialMessageSwipeReplyState,
  reduceMessageSwipeReply,
  shouldCaptureSwipeReplyGesture,
  type MessageSwipeReplyState,
} from './messageSwipeReply';

type CallMode = 'audio' | 'video';
type MessageActionLayout = { height: number; pageX: number; pageY: number; width: number } | null;
type ExpoHapticsModule = {
  ImpactFeedbackStyle?: { Light?: string };
  impactAsync?: (style?: string) => Promise<void>;
  selectionAsync?: () => Promise<void>;
};

type ConversationScreenProps = {
  chat: Chat;
  clipboardWriter?: ClipboardWriter;
  connectionStatusSource?: NetworkAvailabilitySource;
  composer: string;
  dataErrorDiagnostic: LocalDataErrorDiagnostic | null;
  dataErrorText: string | null;
  dataStatus: LocalDataSnapshot['status'];
  isLocalTestModeEnabled: boolean;
  messages: Message[];
  onBack: () => void;
  onComposer: (value: string) => void;
  onDeleteMessageForMe: (messageId: string) => void | Promise<void>;
  onSendMessage: (replyTarget: ReplyTarget | null) => void | boolean | Promise<void | boolean>;
  onStartCall: (mode: CallMode) => void;
  onRetryLocalData: () => void;
  onRetryMessage: (clientMessageId: string) => void;
};

export function ConversationScreen({
  chat,
  clipboardWriter = expoClipboardWriter,
  connectionStatusSource,
  composer,
  dataErrorDiagnostic,
  dataErrorText,
  dataStatus,
  isLocalTestModeEnabled,
  messages,
  onBack,
  onComposer,
  onDeleteMessageForMe,
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
  const [messageActionSheet, setMessageActionSheet] = useState<MessageActionSheetState>(closeMessageActionSheet());
  const [messageActionLayout, setMessageActionLayout] = useState<MessageActionLayout>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const scrollIntentState = useRef<ConversationScrollIntentState>({
    isAtLatest: true,
    isKeyboardOpen: false,
    latestMessageId: latestMessage?.id ?? null,
    pendingScrollAfterLayout: false,
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

  const handleLatestLayoutSettled = useCallback(() => {
    applyScrollIntent({ type: 'layoutSettled' });
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

  const closeActions = useCallback(() => setMessageActionSheet(closeMessageActionSheet()), []);

  const openActions = useCallback((message: Message, layout: MessageActionLayout) => {
    setMessageActionLayout(layout);
    setMessageActionSheet(openMessageActionSheet(message));
  }, []);

  const setReplyFromMessage = useCallback((message: Message) => {
    setReplyTarget(createReplyTarget(message, chat));
  }, [chat]);

  const handleCopyMessage = useCallback(async () => {
    if (!messageActionSheet.visible) return;
    await clipboardWriter.setString(messageActionSheet.message.text);
    closeActions();
  }, [clipboardWriter, closeActions, messageActionSheet]);

  const handleReplyMessage = useCallback(() => {
    if (!messageActionSheet.visible) return;
    setReplyFromMessage(messageActionSheet.message);
    closeActions();
  }, [closeActions, messageActionSheet, setReplyFromMessage]);

  const handleConfirmDeleteMessage = useCallback(async () => {
    if (!messageActionSheet.visible) return;
    await onDeleteMessageForMe(messageActionSheet.message.id);
    if (replyTarget?.messageId === messageActionSheet.message.id) {
      setReplyTarget(null);
    }
    closeActions();
  }, [closeActions, messageActionSheet, onDeleteMessageForMe, replyTarget?.messageId]);

  const handleSendMessage = useCallback(async () => {
    const result = await onSendMessage(replyTarget);
    if (result !== false) {
      setReplyTarget(null);
    }
  }, [onSendMessage, replyTarget]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      applyScrollIntent({ type: 'keyboardOpened' });
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      applyScrollIntent({ type: 'keyboardClosed' });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
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
      <View onLayout={handleLatestLayoutSettled} style={styles.messageArea}>
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
          onContentSizeChange={handleLatestLayoutSettled}
          onScroll={handleMessageScroll}
          ref={listRef}
          renderItem={({ item }) => (
            item.itemType === 'dateDivider'
              ? <Text accessibilityLabel={item.label} accessibilityRole="text" style={styles.dateDivider}>{item.label}</Text>
              : <MessageBubble message={item.message} messages={messages} onLongPressMessage={openActions} onReplyMessage={setReplyFromMessage} onRetryMessage={onRetryMessage} />
          )}
          scrollEventThrottle={32}
          style={styles.messageList}
        />
      </View>
      <View style={styles.composerOverlay}>
        {replyTarget ? (
          <View accessibilityLabel={`Ответ на сообщение от ${replyTarget.senderName}`} accessibilityRole="text" style={styles.replyComposerPanel}>
            <View style={styles.replyQuoteAccent} />
            <View style={styles.replyComposerText}>
              <Text numberOfLines={1} style={styles.replySender}>{replyTarget.senderName}</Text>
              <Text numberOfLines={2} style={styles.replyPreview}>{replyTarget.preview}</Text>
            </View>
            <Pressable accessibilityLabel="Убрать ответ" accessibilityRole="button" onPress={() => setReplyTarget(null)} style={styles.replyDismissButton}>
              <X color={colors.textMuted} size={20} />
            </Pressable>
          </View>
        ) : null}
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
          onPress={composerState.action === 'send' ? () => void handleSendMessage() : undefined}
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
      <MessageActionMenu
        onCancel={closeActions}
        onConfirmDelete={() => void handleConfirmDeleteMessage()}
        onCopy={() => void handleCopyMessage()}
        onDelete={() => setMessageActionSheet(current => requestMessageDeleteConfirmation(current))}
        onReply={handleReplyMessage}
        selectedLayout={messageActionLayout}
        state={messageActionSheet}
      />
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

function MessageBubble({
  message,
  messages,
  onLongPressMessage,
  onReplyMessage,
  onRetryMessage,
}: {
  message: Message;
  messages: Message[];
  onLongPressMessage: (message: Message, layout: MessageActionLayout) => void;
  onReplyMessage: (message: Message) => void;
  onRetryMessage: (clientMessageId: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const presentation = getMessagePresentation(messages, message);
  const bubbleRef = useRef<View>(null);
  const swipeState = useRef<MessageSwipeReplyState>(initialMessageSwipeReplyState());
  const translateX = useRef(new Animated.Value(0)).current;
  const replyAffordanceOpacity = useRef(new Animated.Value(0)).current;
  const replyAffordanceScale = useRef(new Animated.Value(0.8)).current;
  const triggerReplyHaptic = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const haptics = require('expo-haptics') as ExpoHapticsModule;
      if (haptics.impactAsync) {
        void haptics.impactAsync(haptics.ImpactFeedbackStyle?.Light);
      } else if (haptics.selectionAsync) {
        void haptics.selectionAsync();
      }
    } catch {
      // Haptics are best-effort; missing native module must not break reply.
    }
  }, []);
  const resetSwipeAnimation = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, { friction: 8, tension: 90, toValue: 0, useNativeDriver: true }),
      Animated.timing(replyAffordanceOpacity, { duration: 120, toValue: 0, useNativeDriver: true }),
      Animated.timing(replyAffordanceScale, { duration: 120, toValue: 0.8, useNativeDriver: true }),
    ]).start();
  }, [replyAffordanceOpacity, replyAffordanceScale, translateX]);
  const updateSwipeAnimation = useCallback((nextState: MessageSwipeReplyState) => {
    translateX.setValue(nextState.translateX);
    Animated.parallel([
      Animated.timing(replyAffordanceOpacity, {
        duration: 90,
        toValue: nextState.translateX > 0 ? 1 : 0,
        useNativeDriver: true,
      }),
      Animated.timing(replyAffordanceScale, {
        duration: 90,
        toValue: nextState.replyReady ? 1 : 0.86,
        useNativeDriver: true,
      }),
    ]).start();
  }, [replyAffordanceOpacity, replyAffordanceScale, translateX]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => shouldCaptureSwipeReplyGesture(gesture.dx, gesture.dy),
    onPanResponderGrant: () => {
      swipeState.current = initialMessageSwipeReplyState();
    },
    onPanResponderMove: (_, gesture) => {
      const result = reduceMessageSwipeReply(swipeState.current, { type: 'move', dx: gesture.dx, dy: gesture.dy });
      swipeState.current = result.state;
      if (result.shouldTriggerHaptic) {
        triggerReplyHaptic();
      }
      updateSwipeAnimation(result.state);
    },
    onPanResponderRelease: () => {
      const result = reduceMessageSwipeReply(swipeState.current, { type: 'release' });
      swipeState.current = result.state;
      resetSwipeAnimation();
      if (result.shouldReply) {
        onReplyMessage(message);
      }
    },
    onPanResponderTerminate: () => {
      const result = reduceMessageSwipeReply(swipeState.current, { type: 'cancel' });
      swipeState.current = result.state;
      resetSwipeAnimation();
    },
  }), [message, onReplyMessage, resetSwipeAnimation, triggerReplyHaptic, updateSwipeAnimation]);
  const handleLongPress = useCallback(() => {
    bubbleRef.current?.measureInWindow((pageX, pageY, width, height) => {
      onLongPressMessage(message, { height, pageX, pageY, width });
    });
  }, [message, onLongPressMessage]);

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
    <View style={styles.messageSwipeRow}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.swipeReplyAffordance,
          message.sender === 'me' ? styles.swipeReplyAffordanceOutgoing : styles.swipeReplyAffordanceIncoming,
          { opacity: replyAffordanceOpacity, transform: [{ scale: replyAffordanceScale }] },
        ]}
      >
        <Reply color={colors.surface} size={18} />
        <Text style={styles.swipeReplyText}>Ответить</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <Pressable
          {...panResponder.panHandlers}
          accessibilityLabel={message.sender === 'me' ? 'Ваше сообщение' : 'Сообщение собеседника'}
          accessibilityRole="button"
          onLongPress={handleLongPress}
          ref={bubbleRef}
          style={[
            styles.messageBubble,
            message.sender === 'me' ? styles.outgoingBubble : styles.incomingBubble,
            presentation.incomingTail && styles.incomingBubbleTail,
          ]}
        >
          {message.replyTo ? <MessageQuote senderName={message.replyTo.senderName} preview={message.replyTo.preview} /> : null}
          <Text style={styles.messageText}>{message.text}</Text>
          <View style={styles.messageMetaRow}>
            <Text style={styles.messageMeta}>{formatMessageTime(message.createdAt)}</Text>
            <DeliveryIndicator message={message} onRetryMessage={onRetryMessage} state={getDeliveryIndicatorState(presentation)} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function MessageQuote({ senderName, preview }: { senderName: string; preview: string }) {
  const styles = useStyles();
  return (
    <View accessibilityLabel={`Цитата от ${senderName}: ${preview}`} accessibilityRole="text" style={styles.messageQuote}>
      <View style={styles.messageQuoteAccent} />
      <View style={styles.messageQuoteText}>
        <Text numberOfLines={1} style={styles.messageQuoteSender}>{senderName}</Text>
        <Text numberOfLines={2} style={styles.messageQuotePreview}>{formatReplyPreview(preview, 90)}</Text>
      </View>
    </View>
  );
}

function MessageActionMenu({
  onCancel,
  onConfirmDelete,
  onCopy,
  onDelete,
  onReply,
  selectedLayout,
  state,
}: {
  onCancel: () => void;
  onConfirmDelete: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onReply: () => void;
  selectedLayout: MessageActionLayout;
  state: MessageActionSheetState;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [renderedState, setRenderedState] = useState<MessageActionSheetState>(state);
  const transition = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state.visible) {
      setRenderedState(state);
      Animated.timing(transition, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(transition, {
      duration: 120,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setRenderedState(closeMessageActionSheet());
      }
    });
  }, [state, transition]);
  const visible = state.visible || renderedState.visible;
  const activeState = renderedState.visible ? renderedState : state;
  const menuTop = selectedLayout ? Math.max(24, selectedLayout.pageY + selectedLayout.height + 8) : undefined;
  const selectedTop = selectedLayout ? Math.max(16, selectedLayout.pageY) : undefined;
  const menuHorizontalStyle = activeState.visible && activeState.message.sender === 'me'
    ? { right: 16 }
    : { left: Math.max(16, selectedLayout?.pageX ?? 16) };
  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible={visible}>
      <Pressable accessibilityLabel="Закрыть действия сообщения" accessibilityRole="button" onPress={onCancel} style={styles.actionBackdrop}>
        {activeState.visible ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.selectedMessageHighlight,
              {
                left: activeState.message.sender === 'me' ? undefined : selectedLayout?.pageX,
                opacity: transition,
                right: activeState.message.sender === 'me' ? 16 : undefined,
                top: selectedTop,
                transform: [{ scale: transition.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
                width: selectedLayout?.width,
              },
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                styles.highlightedBubble,
                activeState.message.sender === 'me' ? styles.outgoingBubble : styles.incomingBubble,
              ]}
            >
              {activeState.message.replyTo ? <MessageQuote senderName={activeState.message.replyTo.senderName} preview={activeState.message.replyTo.preview} /> : null}
              <Text style={styles.messageText}>{activeState.message.text}</Text>
              <View style={styles.messageMetaRow}>
                <Text style={styles.messageMeta}>{formatMessageTime(activeState.message.createdAt)}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
        <Animated.View
          style={[
            styles.actionSheetPlacement,
            {
              ...menuHorizontalStyle,
              opacity: transition,
              top: menuTop,
              transform: [
                { translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                { scale: transition.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          <Pressable accessibilityLabel="Действия сообщения" accessibilityRole="menu" onPress={(event) => event.stopPropagation()} style={styles.actionSheet}>
          {activeState.visible && activeState.confirmDelete ? (
            <>
              <Text accessibilityRole="header" style={styles.actionTitle}>Удалить сообщение у себя?</Text>
              <Text style={styles.actionText}>Сообщение исчезнет только на этом устройстве.</Text>
              <View style={styles.actionRow}>
                <Pressable accessibilityLabel="Отменить удаление" accessibilityRole="button" onPress={onCancel} style={styles.actionSecondaryButton}>
                  <Text style={styles.actionSecondaryText}>Отмена</Text>
                </Pressable>
                <Pressable accessibilityLabel="Удалить сообщение у себя" accessibilityRole="button" onPress={onConfirmDelete} style={styles.actionDangerButton}>
                  <Trash2 color={colors.surface} size={18} />
                  <Text style={styles.actionDangerText}>Удалить</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ActionMenuButton icon={<Reply color={colors.accent} size={19} />} label="Ответить" onPress={onReply} />
              <ActionMenuButton icon={<Copy color={colors.accent} size={19} />} label="Копировать" onPress={onCopy} />
              <ActionMenuButton danger icon={<Trash2 color={colors.danger} size={19} />} label="Удалить у себя" onPress={onDelete} />
            </>
          )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function ActionMenuButton({ danger = false, icon, label, onPress }: { danger?: boolean; icon: ReactNode; label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="menuitem" onPress={onPress} style={styles.actionMenuButton}>
      {icon}
      <Text style={[styles.actionMenuText, danger && styles.actionMenuDangerText]}>{label}</Text>
    </Pressable>
  );
}

function DeliveryIndicator({
  message,
  onRetryMessage,
  state,
}: {
  message: Message;
  onRetryMessage: (clientMessageId: string) => void;
  state: DeliveryIndicatorState;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const presentation = getDeliveryIndicatorPresentation(state);
  if (presentation.icon === 'clock') {
    return <Clock3 accessibilityLabel="В очереди" color={colors.textMuted} size={14} strokeWidth={2.4} />;
  }
  if (presentation.icon === 'check') {
    return <Check accessibilityLabel="Отправлено" color={colors.textMuted} size={15} strokeWidth={2.5} />;
  }
  if (presentation.icon === 'checkCheck') {
    return <CheckCheck accessibilityLabel={state === 'read' ? 'Прочитано' : 'Доставлено'} color={presentation.accent ? colors.accent : colors.textMuted} size={15} strokeWidth={2.5} />;
  }
  if (presentation.icon === 'alert' && message.clientMessageId && message.kind === 'text') {
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
  messageSwipeRow: { justifyContent: 'center', minHeight: 36 },
  messageBubble: { borderRadius: 16, maxWidth: '82%', minWidth: 74, paddingHorizontal: spacing.sm, paddingBottom: 5, paddingTop: 7 },
  incomingBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  incomingBubbleTail: { borderTopLeftRadius: 4 },
  outgoingBubble: { alignSelf: 'flex-end', backgroundColor: colors.outgoing, borderTopRightRadius: 4 },
  swipeReplyAffordance: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: 5,
    height: 34,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: spacing.sm,
    position: 'absolute',
    top: 5,
  },
  swipeReplyAffordanceIncoming: { left: 2 },
  swipeReplyAffordanceOutgoing: { left: '18%' },
  swipeReplyText: { color: colors.surface, fontSize: typography.xs, fontWeight: '800' },
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
    flexWrap: 'wrap',
    gap: 7,
    paddingBottom: insets.bottom + 7,
    paddingHorizontal: 7,
    paddingTop: 7,
  },
  replyComposerPanel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    padding: spacing.sm,
  },
  replyQuoteAccent: { alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: radius.full, width: 3 },
  replyComposerText: { flex: 1, minWidth: 0 },
  replySender: { color: colors.accent, fontSize: typography.sm, fontWeight: '800' },
  replyPreview: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 18 },
  replyDismissButton: { alignItems: 'center', borderRadius: radius.full, height: 36, justifyContent: 'center', width: 36 },
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
  messageQuote: {
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 7,
    marginBottom: 6,
    minWidth: 0,
    padding: 7,
  },
  messageQuoteAccent: { alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: radius.full, width: 3 },
  messageQuoteText: { flex: 1, minWidth: 0 },
  messageQuoteSender: { color: colors.accentDark, fontSize: typography.xs, fontWeight: '800' },
  messageQuotePreview: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 16 },
  actionBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    padding: spacing.md,
  },
  selectedMessageHighlight: { position: 'absolute' },
  highlightedBubble: {
    borderColor: 'rgba(255, 255, 255, 0.74)',
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  actionSheetPlacement: {
    alignSelf: 'center',
    maxWidth: 260,
    minWidth: 224,
    position: 'absolute',
  },
  actionSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    elevation: 12,
    gap: spacing.xs,
    padding: spacing.sm,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  actionMenuButton: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.sm },
  actionMenuText: { color: colors.text, fontSize: typography.md, fontWeight: '800' },
  actionMenuDangerText: { color: colors.danger },
  actionTitle: { color: colors.text, fontSize: typography.lg, fontWeight: '800', paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  actionText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 19, paddingHorizontal: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  actionSecondaryButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  actionSecondaryText: { color: colors.text, fontSize: typography.md, fontWeight: '800' },
  actionDangerButton: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radius.md, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 48 },
  actionDangerText: { color: colors.surface, fontSize: typography.md, fontWeight: '800' },
  localOnlyComposerNote: { color: colors.textMuted, fontSize: 11, paddingBottom: 4, paddingHorizontal: spacing.md, textAlign: 'center' },
});
