type Action=Readonly<{id:string;label:string}>;
type Port={current():Action|undefined;invoke(id:string):boolean;hold(held:boolean):void};
/** A single physical input owner for B's controller, shared by keyboard
 * and the existing mobile action button. An accepted press is never sent
 * to gathering, another activity, or key-repeat on release. */
export function createA31CableInput(port:Port){
 let source:string|undefined,held=false;
 const consumed=new Set<string>();
 function down(id:string,repeat=false){
  if(consumed.has(id))return true;
  if(source!==undefined){consumed.add(id);return true;}
  const action=port.current();
  if(!action)return false;
  consumed.add(id);
  if(repeat||!port.invoke(action.id))return true;
  source=id;held=action.id==='pry-cable';
  return true;
 }
 function up(id:string){
  if(!consumed.delete(id))return false;
  if(source!==id)return true;
  source=undefined;held=false;port.hold(false);return true;
 }
 function cancel(){held=false;source=undefined;consumed.clear();port.hold(false);}
 return {down,up,cancel,tick(){port.hold(held);},claimed:()=>source!==undefined,
  click(){if(source!==undefined)return true;const a=port.current();if(!a)return false;if(a.id!=='pry-cable')port.invoke(a.id);return true;}};
}
