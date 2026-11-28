/** Separate rear-summit room. Never mix this wire frame with the existing
 * front-ridge mountain room. World metres use the assembly anchor (300,676).
 * 4 cm horizontal and 2 cm vertical quantization, existing 12-byte records. */
export const summitPresencePath='/presence-summit';
export const summitPresenceFrame='summit-v1';
export const summitPresenceOrigin=Object.freeze({east:-800,north:630,height:120});
export const summitPresenceScale=Object.freeze({horizontal:4,vertical:2});
export const summitPresenceBounds=Object.freeze({width:550,depth:459,height:365});
type Point={east:number;north:number;height:number};
export function summitPresenceEndpoint(path:string){
 if(path!=='/presence'&&!path.startsWith('/presence/'))throw Error('Invalid summit presence route');
 return summitPresencePath+path.slice('/presence'.length);
}
export function fromSummitPresencePose<T extends Point>(p:T):T|undefined{
 const b=summitPresenceBounds,o=summitPresenceOrigin,s=summitPresenceScale;
 if(![p.east,p.north,p.height].every(Number.isFinite)||p.east<0||p.east>b.width||p.north<0||p.north>b.depth||p.height<0||p.height>b.height)return;
 return {...p,east:o.east+p.east*s.horizontal,north:o.north+p.north*s.horizontal,height:o.height+p.height*s.vertical};
}
export function toSummitPresencePose<T extends Point>(p:T):T|undefined{
 const o=summitPresenceOrigin,s=summitPresenceScale,b=summitPresenceBounds;
 const q={...p,east:(p.east-o.east)/s.horizontal,north:(p.north-o.north)/s.horizontal,height:(p.height-o.height)/s.vertical};
 if(![q.east,q.north,q.height].every(Number.isFinite)||q.east<0||q.east>b.width||q.north<0||q.north>b.depth||q.height<0||q.height>b.height)return;
 return q;
}
/** Measured line-two summit approach and cabin-board positions, in WORLD
 * coordinates. Compared with the decoded server-accepted record, not an
 * untrusted JSON coordinate. This is a location gate, not proof of walking.
 * Production additionally requires host authorization of the route. */
export const summitReleaseApproaches=Object.freeze([
 Object.freeze({east:326.772724292099742,north:1669.4545514158006,height:800}),
 Object.freeze({east:321.227275707900265,north:1680.5454485841994,height:800}),
]);
export function isSummitCableReleaseRecord(record:Readonly<Point>){
 const p=fromSummitPresencePose({east:record.east/100,north:record.north/100,height:record.height/100});
 return !!p&&summitReleaseApproaches.some(a=>Math.hypot(p.east-a.east,p.north-a.north)<=1.6&&Math.abs(p.height-a.height)<=.65);
}
