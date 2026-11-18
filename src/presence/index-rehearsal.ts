import { createRehearsalClockEndpoint } from './rehearsal-clock.js';
import { startPresence } from './start.js';

await startPresence(createRehearsalClockEndpoint(process.env.TOWN_REHEARSAL_AT));
