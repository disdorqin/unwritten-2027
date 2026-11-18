import type { RequestListener } from 'node:http';

const offsetPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createRehearsalClockEndpoint(value: string | undefined, wallNow = Date.now): RequestListener | undefined {
  if (!value) return;
  const input = value.trim();
  const calendarFields = offsetPattern.exec(input)?.[1];
  const epochMs = Date.parse(input);
  const calendarEpoch = calendarFields ? Date.parse(calendarFields + 'Z') : NaN;
  if (!Number.isSafeInteger(epochMs) || !Number.isFinite(calendarEpoch) ||
      new Date(calendarEpoch).toISOString().slice(0, 19) !== calendarFields) {
    throw new Error('TOWN_REHEARSAL_AT requires an ISO 8601 timestamp with an explicit timezone.');
  }
  const offsetMs = epochMs - wallNow();
  return (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url !== '/presence/rehearsal-clock') {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      ceremonyEpochMs: wallNow() + offsetMs,
    }));
  };
}
