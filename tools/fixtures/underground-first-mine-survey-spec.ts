import type {UndergroundMineSpec} from '../../src/shared/underground-mine-layout.js';
// Review fixture, matching the certified spec in integration host (4046962a).
// Never imported by the production host or used to register a world domain.
export const undergroundMineSpec:UndergroundMineSpec={
 pool:{length:4,width:6,depth:1.2,shaftAperture:{width:2,length:2}},shoreLength:8,
 gallery:{length:20,drop:1,railGauge:1,railWidth:.08},collapse:{length:3,width:1.2,height:1.3},
 camp:{length:10,side:'right',extension:5,openBackForExpansion:true,crystalGate:true},
 walker:{radius:.27,standingHeight:1.8,crouchingHeight:1.1,maxGrade:.2},
};
