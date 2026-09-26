import { createSocket } from 'node:dgram';

export const DEFAULT_UDP_ECHO_HOST = '127.0.0.1';
export const DEFAULT_UDP_ECHO_PORT = 9999;

export function createUdpEchoServer({
  host = DEFAULT_UDP_ECHO_HOST,
  port = DEFAULT_UDP_ECHO_PORT,
  logger = console,
} = {}) {
  const socket = createSocket('udp4');

  socket.on('message', (message, remote) => {
    socket.send(message, remote.port, remote.address, (error) => {
      if (error) {
        logger.warn?.('canary_udp_echo_send_error', {
          message: error.message,
          remoteAddress: remote.address,
          remotePort: remote.port,
        });
      }
    });
  });

  socket.on('error', (error) => {
    logger.error?.('canary_udp_echo_error', { message: error.message });
  });

  return {
    socket,
    listen() {
      return new Promise((resolve, reject) => {
        function onError(error) {
          socket.off('listening', onListening);
          reject(error);
        }

        function onListening() {
          socket.off('error', onError);
          const address = socket.address();
          logger.info?.('canary_udp_echo_listening', {
            address: address.address,
            port: address.port,
          });
          resolve(address);
        }

        socket.once('error', onError);
        socket.once('listening', onListening);
        socket.bind(port, host);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        socket.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
