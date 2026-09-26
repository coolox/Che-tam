import { loadConfig } from './config.mjs';
import { FileJournalStore } from './journal-store.mjs';
import { createCanaryServer } from './server.mjs';

const config = loadConfig();
const journalStore = new FileJournalStore(config.dataDir);
const server = createCanaryServer({
  canaryKey: config.canaryKey,
  journalStore,
  turn: config.turn,
});

server.listen(config.port, config.host, () => {
  console.log(`Hearth Canary v4 server listening on ${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
