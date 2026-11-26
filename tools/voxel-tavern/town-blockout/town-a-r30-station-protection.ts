import {extensionPlots} from './town-extension';
const station=extensionPlots.find(p=>p.id==='railway-station')!;
const [east,north]=station.origin;
const [width,depth]=station.footprint;
/** Preserve the actual existing station and its 5m terrain apron.
 * The legacy D road ends eight metres below this occupied plot.
 * A buried road must not become a player's walk surface here. The new
 * D road/cable connection still requires joint geometry approval. */
export function protectedRailStationSurface(e:number,n:number){
 return Math.abs(e-east)<=width/2+5&&Math.abs(n-north)<=depth/2+5;
}
export function protectRailStationRoad(road:(e:number,n:number,h?:number)=>number|undefined){
 return (e:number,n:number,h?:number)=>protectedRailStationSurface(e,n)?undefined:road(e,n,h);
}
