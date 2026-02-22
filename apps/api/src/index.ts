import Fastify from 'fastify';
import type { ResponseSnapshot } from '@postboy/shared';

const server = Fastify({ logger: true });

server.get('/health', async () => {
  const response: ResponseSnapshot = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { ok: true },
    timings: {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    },
  };

  return response;
});

const port = Number(process.env.PORT ?? 4000);
await server.listen({ port, host: '0.0.0.0' });
