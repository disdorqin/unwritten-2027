import { createPresenceServer } from './server.js';

const server = await createPresenceServer({
  host: process.env.PRESENCE_HOST ?? '0.0.0.0',
  port: Number(process.env.PRESENCE_PORT ?? 8090),
  tiers: process.env.PRESENCE_TIERS ? JSON.parse(process.env.PRESENCE_TIERS) : undefined,
  testFireworks: process.env.TEST_FIREWORKS === 'on',
});
console.log(`Town presence listening on ${server.address().port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  void server.close().catch(error => { console.error(error); process.exitCode = 1; });
});
