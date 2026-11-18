import { createRehearsalClockEndpoint } from './rehearsal-clock.js';
import { startPresence } from './start.js';
import { townCeremonyMidnight } from './ceremony-arrival.js';

const rehearsal = createRehearsalClockEndpoint(process.env.TOWN_REHEARSAL_AT);
await startPresence(rehearsal, townCeremonyMidnight - (rehearsal?.offsetMs ?? 0));
