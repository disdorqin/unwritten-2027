export const summitPassportActions = ['status', 'cloud-stamp', 'summit-stamp', 'register-summit'] as const;
export type SummitPassportAction = typeof summitPassportActions[number];

export type SummitPassportProgress = Readonly<{
  cloudStamped: boolean;
  summitStamped: boolean;
  summitRegistered: boolean;
  snowWingEligible: boolean;
}>;

const resultCodes = ['ok', 'unavailable', 'position', 'previous-stamp'] as const;
export type SummitPassportResult = typeof resultCodes[number];

export type SummitPassportReply = Readonly<{
  type: 'event';
  kind: 'summit-passport-result';
  action: SummitPassportAction;
  result: SummitPassportResult;
  progress: SummitPassportProgress;
}>;

export function isSummitPassportAction(value: unknown): value is SummitPassportAction {
  return summitPassportActions.some(action => action === value);
}

export function readSummitPassportReply(value: unknown): SummitPassportReply | undefined {
  if (!value || typeof value !== 'object') return;
  const frame = value as Partial<SummitPassportReply>;
  if (frame.type !== 'event' || frame.kind !== 'summit-passport-result' || !isSummitPassportAction(frame.action) ||
      !resultCodes.some(result => result === frame.result)) return;
  const state = frame.progress;
  if (!state || typeof state.cloudStamped !== 'boolean' || typeof state.summitStamped !== 'boolean' ||
      typeof state.summitRegistered !== 'boolean' || typeof state.snowWingEligible !== 'boolean' ||
      (state.summitStamped && !state.cloudStamped) || (state.summitRegistered && !state.summitStamped) ||
      state.snowWingEligible !== state.summitRegistered) return;
  return frame as SummitPassportReply;
}
