import {Box3,type Object3D} from 'three';
import type {ChunkDescriptor} from '../core/contracts';
export type ThreeRegistration=Readonly<{owner:string;id:string;revision:string;staticGeometry:boolean;coverageRequired:boolean}>;
/** Opt-in host bridge: reads world bounds, never changes meshes or physics.
 * World renderer convention X=E, Z=-N. Dynamic objects require host updates.
 * A huge group should later be split into spatial chunks, not one global batch. */
export function describeThreeObject(object:Object3D,info:ThreeRegistration):ChunkDescriptor{
 object.updateWorldMatrix(true,true);
 const b=new Box3().setFromObject(object,true);
 if(b.isEmpty()||![b.min.x,b.max.x,b.min.z,b.max.z].every(Number.isFinite))throw RangeError('missing model bounds');
 return {...info,west:b.min.x,east:b.max.x,south:-b.max.z,north:-b.min.z};
}
