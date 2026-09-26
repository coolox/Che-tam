import { createUdpEchoServer, DEFAULT_UDP_ECHO_HOST, DEFAULT_UDP_ECHO_PORT } from './udp-echo.mjs';

const host = process.env.CANARY_UDP_ECHO_HOST || DEFAULT_UDP_ECHO_HOST;
const port = Number.parseInt(process.env.CANARY_UDP_ECHO_PORT || String(DEFAULT_UDP_ECHO_PORT), 10);
const server = createUdpEchoServer({ host, port });

await server.listen();

function shutdown() {
  server.close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
