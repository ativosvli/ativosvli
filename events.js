const EventEmitter = require('events');

class EventBus extends EventEmitter {}
const eventBus = new EventBus();

const clients = new Set();

function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write('data: {"type":"connected"}\n\n');

  const client = { id: Date.now(), res };
  clients.add(client);

  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clients.delete(client);
    clearInterval(keepAlive);
  });
}

function broadcast(event, data) {
  const payload = JSON.stringify({ type: event, ...data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (e) {
      clients.delete(client);
    }
  }
}

module.exports = { eventBus, sseHandler, broadcast };
