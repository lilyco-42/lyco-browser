// CI fixture only: a CONNECT socket leaves the HTTP server's ordinary request
// error handling. Even an immediately denied tunnel must own its error event.
export function protectConnectHandler(handler, record = () => {}) {
  return function (req, socket, head) {
    socket.on('error', error => {
      const code = ['ECONNRESET', 'EPIPE', 'ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)
        ? error.code : 'OTHER';
      record({code});
      socket.destroy();
    });
    return handler.call(this, req, socket, head);
  };
}
