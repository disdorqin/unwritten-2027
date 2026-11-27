import {retireBR30LegacyTerracePlates} from './town-b-r30-retire-legacy-terraces';
import {refitBR30LegacyStory} from './town-b-r30-settle-story-supports';
import {attachBR30CraterCompletion} from './town-b-r30-crater-completion';
import {ar30HostRoutes,ar30HostTracks,surveyAR30InscriptionAccess,type AR30SurfacePort} from './town-a-r30-unified-surface-host';
import {bindPlay} from './town-a-r30-play-candidate';
export function ar30SurfacePort():AR30SurfacePort{let mounted:ReturnType<typeof attachBR30CraterCompletion>|undefined;let marker:string;return {story:{retire:retireBR30LegacyTerracePlates,refit:refitBR30LegacyStory},attach(road,rail){const tracks=ar30HostTracks(rail),routes=ar30HostRoutes(road,rail);marker=road.inscription.rubbingHostMarker.id;return mounted=attachBR30CraterCompletion(road,rail,tracks,'host-candidate',routes,surveyAR30InscriptionAccess);},createPlay(assembly,ctx){if(!mounted||assembly!==mounted)throw Error('Wrong play assembly');return bindPlay(mounted,marker,ctx);}};}
