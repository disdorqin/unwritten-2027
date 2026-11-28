import {certifyHikingSteps,type HikingPoint,type HikingSurface} from './town-a32-summit-hiking';

/** Offline surveyed natural-ground foot route (NOT the planned 12% road).
 * 140m middle station to 347m cloud apron. Many short traverses avoid
 * climbing the steep fall line. A runtime certificate against the final
 * mounted terrain and all actual obstacles is mandatory before displaying it.
 */
export const r31FrontTrailWaypoints:readonly HikingPoint[]=Object.freeze([
 [440,512],[438,513],[426,522],[423,526],[419,529],[415,528],[413,529],[410,533],[409,534],[405,537],[409,536],[405,539],[409,538],[411,537],[408,541],[406,544],[409,543],[406,547],[409,546],[408,550],[412,549],[416,550],[417,553],[420,557],[424,560],[422,563],[421,567],[423,570],[420,574],[416,577],[420,578],[416,580],[420,581],[416,582],[413,581],[409,578],[406,574],[402,571],[396,563],[394,560],[395,563],[394,561],[396,567],[392,561],[393,564],[391,561],[392,564],[391,562],[394,571],[392,568],[393,571],[391,568],[392,571],[390,568],[391,571],[389,568],[390,571],[388,568],[389,571],[387,568],[384,564],[380,561],[382,564],[376,560],[378,563],[375,561],[377,564],[374,562],[376,565],[373,563],[375,566],[369,562],[381,578],[378,576],[381,580],[378,578],[381,582],[378,580],[376,579],[382,587],[383,590],[385,598],[382,594],[384,602],[385,605],[387,613],[386,617],[384,620],[381,616],[378,625],[375,621],[372,625],[368,626],[336,650],[328,652],[324,655],
].map(([east,north])=>Object.freeze({east:east!,north:north!})));
export function* certifyR31FrontTrail(host:HikingSurface){
 return yield* certifyHikingSteps(host,r31FrontTrailWaypoints,.80);
}
