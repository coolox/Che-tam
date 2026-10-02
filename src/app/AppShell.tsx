import PreviewApp from './PreviewAppShell';

/**
 * The application composition boundary. APP-001 deliberately mounts the
 * existing offline preview unchanged; future tasks can replace this adapter
 * without coupling domain modules to preview fixtures.
 */
export function AppShell() {
  return <PreviewApp />;
}