import type {createMainSummitTrail} from './main-summit-trail';
import type {D2MassifWire} from './town-d2-r30-massif';
export type A32CanonicalWire={arrivalHeight:number;trail:Pick<ReturnType<typeof createMainSummitTrail>,'points'|'metrics'>;massif:D2MassifWire[];heights:Float32Array;ms:number};
