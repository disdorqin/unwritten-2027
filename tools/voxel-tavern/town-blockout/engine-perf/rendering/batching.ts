/** Initial conservative eligibility. Actual Three adapter must verify world
 * transforms, materials, transparency, shadows, picking and disposal. */
export type BatchDescriptor=Readonly<{chunk:string;material:string;staticGeometry:boolean;transparent:boolean;interactive:boolean;skinned:boolean}>;
export function batchKey(d:BatchDescriptor):string|undefined{
 if(!d.staticGeometry||d.transparent||d.interactive||d.skinned)return undefined;
 return JSON.stringify([d.chunk,d.material]);
}
