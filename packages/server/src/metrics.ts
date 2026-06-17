import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

// Dedicated registry so we control exactly what is exposed.
export const registry = new Registry();
registry.setDefaultLabels({ service: 'rtc-server' });
collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const wsConnections = new Gauge({
  name: 'rtc_ws_connections',
  help: 'Currently open WebSocket connections',
  registers: [registry],
});

export const activeDocuments = new Gauge({
  name: 'rtc_active_documents',
  help: 'Documents currently loaded in memory',
  registers: [registry],
});

export const docUpdatesTotal = new Counter({
  name: 'rtc_doc_updates_total',
  help: 'Total document updates applied',
  registers: [registry],
});

export const docUpdateBytes = new Histogram({
  name: 'rtc_doc_update_bytes',
  help: 'Size of applied document updates in bytes',
  buckets: [64, 256, 1024, 4096, 16384, 65536],
  registers: [registry],
});
