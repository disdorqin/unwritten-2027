import type {Object3D} from 'three';
import type {createNightBProductionController,nightBProductionAuthority} from './town-night-b-production-controller';
type Input=Parameters<typeof createNightBProductionController>[0];
type Front=Extract<NonNullable<Input['front']>,{ready:true}>;
type Upper=Extract<NonNullable<Input['upper']>,{ready:true}>;
export type A31CableBindings=Pick<Input,'front'|'upper'|'frontRepair'>;
export type A31CableAuthority=ReturnType<typeof nightBProductionAuthority>;
export type A31FrontCableOwner={
 transportReady:boolean;facilities?:Front['facilities'];
 frontOperation?:Front;frontRepair?:Input['frontRepair'];
 preparePublicFrontCable?:(authority:A31CableAuthority)=>void|Promise<void>;
};
export type A31RearCableOwner={
 group:Object3D;cableState():{installed:boolean;certified:boolean;boardable:boolean};
 cableOperation?:Upper;
 preparePublicCable?:(authority:A31CableAuthority)=>void|Promise<void>;
};
function owned(group:Object3D,root:Object3D){
 for(let p:Object3D|null=group;p;p=p.parent)if(p===root)return true;
 return false;
}
export function readA31FrontCable(owner:A31FrontCableOwner|undefined):Pick<A31CableBindings,'front'|'frontRepair'>{
 const op=owner?.frontOperation,repair=owner?.frontRepair;
 if(!owner?.transportReady||!op?.ready||!op.service.physical||owner.facilities!==op.facilities||!op.facilities.group.parent||!repair||typeof repair.surfaceAt!=='function'||typeof repair.clear!=='function')return {};
 if(!(['brake','cableWheel','weightTower','weightFrame'] as const).every(k=>{const p=repair.anchors?.[k];return p&&Number.isFinite(p.east)&&Number.isFinite(p.north);}))return {};
 return {front:op,frontRepair:repair};
}
export function readA31UpperCable(owner:A31RearCableOwner|undefined):Upper|undefined{
 const op=owner?.cableOperation,state=owner?.cableState();
 if(!owner||!state?.installed||!state.certified||!state.boardable||!op?.ready||!op.service.physical||!owned(op.ropeway.group,owner.group)||!owned(op.workshop.group,owner.group))return;
 return op;
}
