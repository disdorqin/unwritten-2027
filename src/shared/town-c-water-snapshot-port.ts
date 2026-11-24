/** C2 handoff: view of the accepted presence water snapshot.
 * Matches createUndergroundWaterState().tonight() in batch96. The core remains
 * the sole owner of phase, epoch and pump offset. No local time or phase math. */
export type AcceptedUndergroundWaterSnapshot=Readonly<{
 nightOrdinal:number;phase:'rise'|'level'|'fall';baseLevel:'low'|'mid'|'high';
 pumpOffset:number;level:'low'|'mid'|'high';
}>;
export type AcceptedWaterReader=()=>AcceptedUndergroundWaterSnapshot|undefined;
export function readUndergroundWaterPresentation(read:AcceptedWaterReader){
 const s=read();
 if(!s||!Number.isSafeInteger(s.nightOrdinal)||!Number.isInteger(s.pumpOffset)||s.pumpOffset< -2||s.pumpOffset>2||
  !['rise','level','fall'].includes(s.phase)||!['low','mid','high'].includes(s.baseLevel)||!['low','mid','high'].includes(s.level))return;
 // Legacy -140 art uses 'middle' for the authority's 'mid'. This is a naming
 // conversion only: effective level, including tonight's pump offset, wins.
 return Object.freeze({nightOrdinal:s.nightOrdinal,phase:s.phase,level:s.level,riverState:s.level==='mid'?'middle' as const:s.level});
}
