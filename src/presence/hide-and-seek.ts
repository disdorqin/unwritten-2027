// Round rules for Muse 《未写镇玩法增补设计》 §3.5. The host supplies the
// active town's plaza, contact rule, and surveyed regions.
export const hideDurationMs = 90_000;
export const hideSeekRoundMs = 12 * 60_000;
export const hideSeekReportMs = 3 * 60_000;

export type HideSeekPosition = { east: number; north: number; height: number };
type PeerId = number;
type Region = string;
type Phase = 'hiding' | 'seeking' | 'ended';
type HideSeekPositions = ReadonlyMap<PeerId, HideSeekPosition>;

export type HideSeekRules = {
  isInPlaza: (position: HideSeekPosition) => boolean;
  isTouching: (seeker: HideSeekPosition, hider: HideSeekPosition) => boolean;
  regionAt: (position: HideSeekPosition) => Region;
};

type AreaReport = {
  privateReports: { hiderId: PeerId; region: Region }[];
  seekerReport: { region: Region; hiders: number }[];
};

export class HideAndSeekRound {
  readonly seekingAt: number;
  readonly deadline: number;
  readonly #captured = new Map<PeerId, number>();
  readonly #hiders: ReadonlySet<PeerId>;
  #nextReport: number;
  #endedAt: number | undefined;

  constructor(
    readonly seekerId: PeerId,
    hiderIds: readonly PeerId[],
    readonly startedAt: number,
    private readonly rules: HideSeekRules,
  ) {
    const hiders = new Set(hiderIds);
    if (hiders.size !== hiderIds.length || hiders.has(seekerId) || hiders.size < 2 || hiders.size > 5) {
      throw new RangeError('A hide-and-seek round requires one seeker and two to five distinct hiders');
    }
    this.#hiders = hiders;
    this.seekingAt = startedAt + hideDurationMs;
    this.deadline = startedAt + hideSeekRoundMs;
    this.#nextReport = startedAt + hideSeekReportMs;
  }

  phase(now: number): Phase {
    if (this.#endedAt !== undefined || now >= this.deadline) return 'ended';
    return now < this.seekingAt ? 'hiding' : 'seeking';
  }

  canMove(id: PeerId, destination: HideSeekPosition, now: number): boolean {
    return id !== this.seekerId || this.phase(now) !== 'hiding' || this.rules.isInPlaza(destination);
  }

  scores(now: number) {
    return {
      captures: this.#captured.size,
      hiders: [...this.#hiders].map(hiderId => ({
        hiderId,
        survivedMs: Math.max(0, Math.min(now, this.deadline, this.#endedAt ?? Infinity,
          this.#captured.get(hiderId) ?? Infinity) - this.startedAt),
      })),
    };
  }

  advance(now: number, positions: HideSeekPositions): {
    captures: PeerId[];
    areas?: AreaReport;
    finished: boolean;
  } {
    const captures: PeerId[] = [];
    if (this.#endedAt !== undefined) return { captures, finished: false };
    if (now >= this.deadline) {
      this.#endedAt = this.deadline;
      return { captures, finished: true };
    }
    if (this.phase(now) !== 'seeking') return { captures, finished: false };
    const seeker = positions.get(this.seekerId);
    if (seeker) {
      for (const hiderId of this.#hiders) {
        const hider = positions.get(hiderId);
        if (!this.#captured.has(hiderId) && hider && this.rules.isTouching(seeker, hider)) {
          this.#captured.set(hiderId, now);
          captures.push(hiderId);
        }
      }
    }
    if (this.#captured.size === this.#hiders.size) {
      this.#endedAt = now;
      return { captures, finished: true };
    }
    if (now < this.#nextReport) return { captures, finished: false };
    // Report the current positions once even if the host missed several beats.
    this.#nextReport = this.startedAt + (Math.floor((now - this.startedAt) / hideSeekReportMs) + 1) * hideSeekReportMs;
    const privateReports: AreaReport['privateReports'] = [];
    const counts = new Map<Region, number>();
    for (const hiderId of this.#hiders) {
      const position = positions.get(hiderId);
      if (!position || this.#captured.has(hiderId)) continue;
      const region = this.rules.regionAt(position);
      privateReports.push({ hiderId, region });
      counts.set(region, (counts.get(region) ?? 0) + 1);
    }
    const seekerReport = Array.from(counts, ([region, hiders]) => ({ region, hiders }));
    return { captures, areas: { privateReports, seekerReport }, finished: false };
  }

  // Call only after a successful door-book landing, with the actual entry and
  // destination. Normal walking, failed fallback, and same-region trips are silent.
  doorTravel(id: PeerId, from: HideSeekPosition, to: HideSeekPosition, now: number): { region: Region } | undefined {
    if (this.phase(now) !== 'seeking' || !this.#hiders.has(id) || this.#captured.has(id)) return;
    const region = this.rules.regionAt(to);
    if (this.rules.regionAt(from) !== region) return { region };
  }

  // Let the existing NPC direction template interpret this when a live hider
  // talks to a resident. No extra prose or location is included in public reports.
  seekerDirection(id: PeerId, now: number, positions: HideSeekPositions):
      { east: number; north: number } | undefined {
    if (this.phase(now) === 'ended' || !this.#hiders.has(id) || this.#captured.has(id)) return;
    const seeker = positions.get(this.seekerId), hider = positions.get(id);
    if (seeker && hider) return { east: seeker.east - hider.east, north: seeker.north - hider.north };
  }
}
