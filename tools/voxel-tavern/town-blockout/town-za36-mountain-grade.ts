/** ZA-36 mountain A: geometry-only road gradient gate. This does NOT create
 * walkable mesh, extend domain authority, or certify terrain contact. */
export const za36MountainGradeSpec = Object.freeze({
  minRoadMetres: 2750,
  maxAbsGrade: 0.12,
  minClearWidth: 2.5,
  worldWidth: 640,
  northLimit: 800,
  townBoundaryNorth: 540,
});
export type Za36TrailNode = Readonly<{ east: number; north: number; height: number; clearWidth: number }>;
export type Za36TrailFault = Readonly<{
  kind: 'length' | 'grade' | 'clear-width' | 'domain' | 'zero-segment' | 'invalid';
  at: number; value: number; limit: number;
}>;
export type Za36TrailGradeResult = Readonly<{
  horizontalMetres: number;
  minimumByRiseMetres: number;
  maxAbsGrade: number;
  minClearWidth: number;
  faults: readonly Za36TrailFault[];
  geometryPass: boolean;
  terrainVerified: false;
  liveTraversalVerified: false;
}>;
export const za36MountainSeam = Object.freeze({ east: 320, north: 539.5 });
export const za36MountainCloudTerminal = Object.freeze({ east: 336, north: 640 });

/**
 * The live town ends at north=540 while the mountain model covers that same
 * coordinate at a much higher elevation. Only comparisons of the EXACT
 * samplers can define the transition. Never copy visual ridge elevation
 * directly into the town heightfield at the cut line.
 */
export function surveyZa36MountainSeam(
  townHeightAt: (east: number, north: number) => number,
  mountainHeightAt: (east: number, north: number) => number,
) {
  const start=za36MountainSeam;
  const cloud=za36MountainCloudTerminal;
  const townHeight=townHeightAt(start.east,start.north);
  const mountainAtTownBoundary=mountainHeightAt(start.east,start.north);
  const summitHeight=mountainHeightAt(cloud.east,cloud.north);
  const step=mountainAtTownBoundary-townHeight;
  const rise=summitHeight-townHeight;
  if(![townHeight,mountainAtTownBoundary,summitHeight].every(Number.isFinite))
    throw new RangeError('ZA-36 requires finite, live terrain samples');
  return {
    start:{...start,height:townHeight},
    target:{...cloud,height:summitHeight},
    seamVerticalGap:step,
    fullRise:rise,
    minHorizontalMetres:Math.abs(rise)/za36MountainGradeSpec.maxAbsGrade,
    nominal2750MetreAverageGrade:Math.abs(rise)/za36MountainGradeSpec.minRoadMetres,
  };
}

/** Reusable mechanical gate for FUTURE candidate survey polylines only. */
export function inspectZa36TrailGrade(nodes:readonly Za36TrailNode[]): Za36TrailGradeResult {
  if(nodes.length<2) throw new RangeError('A walking route needs at least two surveyed points');
  const faults: Za36TrailFault[] = [];
  const spec=za36MountainGradeSpec;
  let horizontalMetres=0,maxAbsGrade=0,minClearWidth=Infinity;
  for(let i=0;i<nodes.length;i++){
    const p=nodes[i]!;
    if(![p.east,p.north,p.height,p.clearWidth].every(Number.isFinite)) {
      faults.push({kind:'invalid',at:i,value:NaN,limit:0});
      continue;
    }
    minClearWidth=Math.min(minClearWidth,p.clearWidth);
    if(p.clearWidth<spec.minClearWidth)
      faults.push({kind:'clear-width',at:i,value:p.clearWidth,limit:spec.minClearWidth});
    if(p.east<0||p.east>spec.worldWidth||p.north<0||p.north>spec.northLimit)
      faults.push({kind:'domain',at:i,value:p.north,limit:spec.northLimit});
    if(i===0)continue;
    const q=nodes[i-1]!;
    if(![q.east,q.north,q.height].every(Number.isFinite))continue;
    const distance=Math.hypot(p.east-q.east,p.north-q.north);
    horizontalMetres+=distance;
    if(distance<.01){faults.push({kind:'zero-segment',at:i,value:distance,limit:.01});continue;}
    const slope=Math.abs(p.height-q.height)/distance;
    maxAbsGrade=Math.max(maxAbsGrade,slope);
    if(slope>spec.maxAbsGrade+1e-9)
      faults.push({kind:'grade',at:i,value:slope,limit:spec.maxAbsGrade});
  }
  const a=nodes[0]!,z=nodes.at(-1)!;
  const minimumByRiseMetres=Math.abs(z.height-a.height)/spec.maxAbsGrade;
  const minRequired=Math.max(spec.minRoadMetres,minimumByRiseMetres);
  if(horizontalMetres+.01<minRequired)
    faults.push({kind:'length',at:nodes.length-1,value:horizontalMetres,limit:minRequired});
  return {
    horizontalMetres,minimumByRiseMetres,maxAbsGrade,minClearWidth,faults,
    geometryPass:faults.length===0,
    // A green grade budget is NEVER an authorization to place an avatar here:
    // terrain cutting, collisions, town-domain extension, and a real browser
    // step/WS trace remain required in separate acceptance tests.
    terrainVerified:false,liveTraversalVerified:false,
  };
}
