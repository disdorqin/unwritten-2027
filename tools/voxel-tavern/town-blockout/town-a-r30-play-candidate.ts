import {createAR30CraterPlay,type CraterPlayContext} from './town-a-r30-crater-play';
import {createBR30WorkshopControls} from './town-b-r30-crater-workshop-controls';
import {createBR30MoundControls} from './town-b-r30-mound-work-flag';
import {createBR30RubbingControls} from './town-b-r30-inscription-rubbing';
import type {attachBR30CraterCompletion} from './town-b-r30-crater-completion';
export function bindPlay(c:ReturnType<typeof attachBR30CraterCompletion>,marker:string,ctx:CraterPlayContext){
 const m=c.kit.machines;
 return createAR30CraterPlay({
 aimWorkshop:p=>m.aimControl(p,p.heading,p.pitch,p.eyeHeight),
 aimPaper:p=>c.paper.aimed(p),aimFlag:p=>c.flag.aimed(p),atSummit:p=>c.flag.atSummit(p),
 workshop:h=>createBR30WorkshopControls(m,h),mound:h=>createBR30MoundControls(c.flag,h),rubbing:h=>createBR30RubbingControls(c.paper,marker,h)
 },ctx);
}
