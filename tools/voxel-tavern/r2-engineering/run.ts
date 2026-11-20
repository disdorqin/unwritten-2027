import { createR2EngineeringCandidate } from './candidate';
import {
  reverseR2EngineeringGate, reverseR2EngineeringTerrain, rollR2EngineeringCandidate, surveyR2EngineeringCandidate,
} from './survey';

const candidate = createR2EngineeringCandidate();
const result = {
  kind: 'r2-isolated-engineering',
  sampleSeconds: 1 / 60,
  survey: surveyR2EngineeringCandidate(candidate),
  downhill: rollR2EngineeringCandidate(candidate),
  uphillWithHingeDisabled: reverseR2EngineeringTerrain(candidate),
  reverseHinge: [-1.74, 0, 1.74].map(offset => reverseR2EngineeringGate(candidate, offset)),
  reverseHingeDisabledControl: reverseR2EngineeringGate(candidate, 0, false),
};
process.stdout.write(JSON.stringify(result) + '\n');
