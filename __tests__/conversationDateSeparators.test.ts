// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };

import { formatMessageTime, getConversationDateItems } from '../src/ui/state';
import type { Message } from '../src/ui/types';

function message(id: string, createdAt: string): Message {
  return {
    id,
    chatId: 'parents',
    sender: 'relative',
    text: `Сообщение ${id}`,
    createdAt,
    delivered: true,
    kind: 'text',
  };
}

describe('conversation local date separators', () => {
  it('formats bubble and separator with the same local civil timezone in Istanbul', () => {
    const instantSeenAt1108 = '2026-10-05T08:08:00.000Z';
    const timeZone = 'Europe/Istanbul';

    expect(formatMessageTime(instantSeenAt1108, { timeZone })).toBe('11:08');
    expect(getConversationDateItems([message('istanbul', instantSeenAt1108)], {
      now: new Date('2026-10-05T09:00:00.000Z'),
      timeZone,
    })[0]).toMatchObject({ itemType: 'dateDivider', label: 'Сегодня' });
  });

  it('formats bubble and separator with the same local civil timezone in Ashgabat', () => {
    const instantSeenAt1108 = '2026-10-05T06:08:00.000Z';
    const timeZone = 'Asia/Ashgabat';

    expect(formatMessageTime(instantSeenAt1108, { timeZone })).toBe('11:08');
    expect(getConversationDateItems([message('ashgabat', instantSeenAt1108)], {
      now: new Date('2026-10-05T07:00:00.000Z'),
      timeZone,
    })[0]).toMatchObject({ itemType: 'dateDivider', label: 'Сегодня' });
  });

  it('classifies today and yesterday by injected local time zone, not UTC calendar date', () => {
    const items = getConversationDateItems(
      [
        message('yesterday-local', '2026-10-04T20:30:00.000Z'),
        message('today-local', '2026-10-05T20:30:00.000Z'),
      ],
      {
        now: new Date('2026-10-05T20:00:00.000Z'),
        timeZone: 'Asia/Ashgabat',
      },
    );

    expect(items).toMatchObject([
      { itemType: 'dateDivider', label: 'Вчера' },
      { itemType: 'message', message: { id: 'yesterday-local' } },
      { itemType: 'dateDivider', label: 'Сегодня' },
      { itemType: 'message', message: { id: 'today-local' } },
    ]);
  });

  it('formats older Russian calendar dates and includes the year outside the current year', () => {
    const items = getConversationDateItems(
      [
        message('same-year', '2026-10-03T08:00:00.000Z'),
        message('previous-year', '2025-10-03T08:00:00.000Z'),
      ],
      {
        now: new Date('2026-10-05T12:00:00.000Z'),
        timeZone: 'Europe/Moscow',
      },
    );

    expect(items[0]).toMatchObject({ itemType: 'dateDivider', label: '3 октября' });
    expect(items[2]).toMatchObject({ itemType: 'dateDivider' });
    expect(items[2].itemType === 'dateDivider' ? items[2].label : '').toContain('2025');
  });

  it('preserves chronological message order and adds one divider for each local date boundary', () => {
    const items = getConversationDateItems(
      [
        message('m1', '2026-10-03T08:00:00.000Z'),
        message('m2', '2026-10-03T09:00:00.000Z'),
        message('m3', '2026-10-04T09:00:00.000Z'),
      ],
      {
        now: new Date('2026-10-05T12:00:00.000Z'),
        timeZone: 'Europe/Moscow',
      },
    );

    expect(items.map(item => item.key)).toEqual([
      'date-divider-2026-10-03',
      'message-m1',
      'message-m2',
      'date-divider-2026-10-04',
      'message-m3',
    ]);
    expect(items.filter(item => item.itemType === 'dateDivider')).toHaveLength(2);
  });

  it('wires ConversationScreen to render local date divider items with accessible labels', () => {
    const source = fs.readFileSync('src/app/screens/ConversationScreen.tsx', 'utf8');

    expect(source).toContain('getConversationDateItems(messages)');
    expect(source).toContain('accessibilityLabel={item.label}');
    expect(source).not.toContain('<Text style={styles.dateDivider}>Сегодня</Text>');
  });
});
