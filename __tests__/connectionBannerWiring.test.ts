// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };

describe('connection banner wiring', () => {
  it('renders the accessible banner only in the open Conversation header without transport behavior', () => {
    const shell = fs.readFileSync('src/app/PreviewAppShell.tsx', 'utf8');
    const conversation = fs.readFileSync('src/app/screens/ConversationScreen.tsx', 'utf8');
    const outsideConversation = shell;
    const source = `${shell}\n${conversation}`;

    const renderedHookCalls = outsideConversation.match(/useConnectionStatus\(\)/g) ?? [];

    expect(conversation).toContain("const connection = useConnectionStatus();");
    expect(conversation).toContain('accessibilityRole="text"');
    expect(conversation).toContain('accessibilityLiveRegion="polite"');
    expect(conversation).toContain('accessibilityLabel={connection.accessibilityLabel}');
    expect(conversation).toContain('{connection.text}');
    expect(renderedHookCalls).toEqual([]);
    expect(source).not.toMatch(/\b(fetch|WebSocket|socket|endpoint)\b|https?:\/\//i);
  });
});
