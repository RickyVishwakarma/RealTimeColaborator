/**
 * WebSocket / collaboration load test.
 *
 * Spawns N Socket.io clients that all join one document. One "writer" emits Yjs
 * updates at a fixed rate; every other client measures how long each update
 * takes to arrive (broadcast fan-out latency).
 *
 * Usage (server must be running, with Postgres + Redis up):
 *   node load/ws-load.mjs
 *   CLIENTS=200 DURATION_MS=20000 RATE_MS=200 node load/ws-load.mjs
 */
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const CLIENTS = Number(process.env.CLIENTS || 100);
const DURATION_MS = Number(process.env.DURATION_MS || 15_000);
const RATE_MS = Number(process.env.RATE_MS || 250);

async function bootstrap() {
  const email = `wsload_${Date.now()}@example.com`;
  const signup = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', displayName: 'WS Load' }),
  });
  if (!signup.ok) throw new Error(`signup failed: ${signup.status}`);
  const { accessToken } = await signup.json();

  const docRes = await fetch(`${BASE_URL}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ title: 'WS load test' }),
  });
  if (!docRes.ok) throw new Error(`create doc failed: ${docRes.status}`);
  const { document } = await docRes.json();
  return { token: accessToken, documentId: document.id };
}

function connect(token, documentId) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { auth: { token }, transports: ['websocket'] });
    socket.on('connect', () => {
      socket.emit('doc:join', { documentId }, (ack) => {
        if (ack.ok) resolve(socket);
        else reject(new Error(ack.error));
      });
    });
    socket.on('connect_error', reject);
  });
}

const latencies = [];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  console.log(`Bootstrapping… (${CLIENTS} clients, ${DURATION_MS}ms, every ${RATE_MS}ms)`);
  const { token, documentId } = await bootstrap();

  const sockets = await Promise.all(
    Array.from({ length: CLIENTS }, () => connect(token, documentId)),
  );
  console.log(`Connected ${sockets.length} clients.`);

  const [writer, ...readers] = sockets;
  const doc = new Y.Doc();
  const sendStamps = new Map(); // update byteLength -> sendTime (approx tag)

  for (const reader of readers) {
    reader.on('doc:update', () => {
      const now = performance.now();
      const sent = sendStamps.get('last');
      if (sent) latencies.push(now - sent);
    });
  }

  doc.on('update', (update) => {
    sendStamps.set('last', performance.now());
    writer.emit('doc:update', { documentId, update });
  });

  const text = doc.getText('content');
  const timer = setInterval(() => text.insert(text.length, 'x'), RATE_MS);

  await new Promise((r) => setTimeout(r, DURATION_MS));
  clearInterval(timer);
  sockets.forEach((s) => s.disconnect());

  latencies.sort((a, b) => a - b);
  console.log('\n--- Broadcast latency (ms) ---');
  console.log(`samples : ${latencies.length}`);
  console.log(`p50     : ${percentile(latencies, 50).toFixed(1)}`);
  console.log(`p95     : ${percentile(latencies, 95).toFixed(1)}`);
  console.log(`p99     : ${percentile(latencies, 99).toFixed(1)}`);
  console.log(`max     : ${(latencies.at(-1) ?? 0).toFixed(1)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
