import { Color, DataTexture, NearestFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType } from 'three';

/**
 * D2/D11 front-ridge stone and snow treatment, material-only. Does not
 * change or consume any player heightfield, collision or server world state.
 *
 * The source is a deterministic 32x32 image, repeated at 2m per tile:
 * exactly 16 *visible square pixels* per metre. This uses DataTexture
 * instead of HTML canvas, so headless tests and Chrome get identical pixels.
 * No downloads, no CDN assets and no asynchronous texture loading.
 */
export const FRONT_RIDGE_PALETTE = Object.freeze({
  snow: '#e8ecf0',
  stone: '#8a8378',
  ochre: '#a98a56',
  umber: '#5d4630',
  moss: '#44503c',
  midnight: '#2c3648',
  rust: '#8a4a34',
} as const);
export const frontRidgePixelSpec = Object.freeze({
  edge: 32,
  tileMetres: 2,
  pixelsPerMetre: 16,
  minAltitudeSnowMetres: 257,
  snowMaxSteepness: .46,
});

function hash(x: number, y: number, salt = 0): number {
  let z = Math.imul(x + 1031, 73856093) ^ Math.imul(y + 917, 19349663) ^ Math.imul(salt + 313, 83492791);
  z ^= z >>> 13;
  z = Math.imul(z, 1274126177);
  return (z ^ z >>> 16) >>> 0;
}
const clamp01 = (v:number) => Math.max(0,Math.min(1,v));
function smooth(t:number) {const s=clamp01(t);return s*s*(3-2*s);}

/**
 * Nearby rock is dark and angular; snow is confined to upper ledges and
 * gently inclined caps. 'steep' is 1-max(normal.y,0), in [0,1].
 * Use a broad transition on rock/soil; do NOT put snow on a sheer wall.
 */
export function frontRidgeSurfaceColorAt(east:number,north:number,height:number,steep:number) {
  const altitude=Number.isFinite(height)?height:0;
  const incline=clamp01(steep);
  const strata=hash(Math.floor(east/17),Math.floor(north/19),Math.floor(altitude/13));
  const geology=smooth(((strata%101)/100-.18)/.64);
  const base=new Color(FRONT_RIDGE_PALETTE.stone);
  const earth=new Color(FRONT_RIDGE_PALETTE.ochre);
  const moss=new Color(FRONT_RIDGE_PALETTE.moss);
  const night=new Color(FRONT_RIDGE_PALETTE.midnight);
  const snow=new Color(FRONT_RIDGE_PALETTE.snow);
  const umber=new Color(FRONT_RIDGE_PALETTE.umber);
  // The toe is dirt-rock with dark moss; the middle is a stone/ochre
  // sequence. The upper rock face is intentionally darkened and cannot
  // turn bright white simply because its altitude is 300m.
  const soil=smooth((altitude-22)/118);
  const ochreMiddle=.42*smooth((altitude-94)/62)*(1-smooth((altitude-254)/58));
  base.lerp(earth,(1-soil)*.55+geology*.1+ochreMiddle);
  if(altitude<125)base.lerp(moss,.13+(1-geology)*.22);
  if(altitude>=112&&altitude<245){
    const rockLayer=.22*smooth((altitude-112)/55)+.16*geology;
    base.lerp(umber,rockLayer);
  }
  if(altitude>=180)base.lerp(night,.28*smooth((altitude-180)/105));
  // A broad snowline with noisy variation: the upper ledges accumulate
  // snow on nearly-horizontal faces only. Cliff faces remain exposed rock.
  const snowline=frontRidgePixelSpec.minAltitudeSnowMetres+(geology-.5)*34;
  const altitudeWeight=smooth((altitude-snowline)/74);
  const gentle=1-smooth((incline-.20)/.27);
  const snowWeight=altitudeWeight*gentle*.93;
  // The actual visual-only slope contains shallow snow-catching shelves at
  // N745..749 and N758..764. Their neighbouring steep triangles made the
  // *averaged* vertex normal appear almost vertical, so use the verified
  // shelf coordinates as a secondary snow-presence condition; never coat
  // the whole N710-740 sheer face.
  const shelfOne=smooth((north-743.5)/2.0)*(1-smooth((north-749)/3.2));
  const shelfTwo=smooth((north-757)/2.1)*(1-smooth((north-765)/2.0));
  const snowPatch=(hash(Math.floor(east/19),Math.floor(north/17),7)%9)/8;
  const shelfSnow=(.48+.35*snowPatch)*Math.max(shelfOne,shelfTwo)*
    altitudeWeight;
  base.lerp(snow,Math.max(snowWeight,shelfSnow));
  return base;
}

export function makeFrontRidgePixelTexture(): DataTexture {
  const edge=frontRidgePixelSpec.edge;
  const pixels=new Uint8Array(edge*edge*4);
  // R4 visual audit rejected the first repeated orthogonal crack pattern:
  // at 1.6m camera height it looked like a giant tiled floor, not rock.
  // Use a wrapped irregular Voronoi seam with broken short cracks instead.
  // Periodicity is still 2m/32px, but there is no horizontal/vertical grid.
  const stones=Array.from({length:17},(_,i)=>({
    x:hash(i,7,1)%edge,y:hash(i,13,2)%edge,
  }));
  for(let y=0;y<edge;y++)for(let x=0;x<edge;x++){
    const h=hash(x,y), coarse=hash(Math.floor(x/4),Math.floor(y/5),1);
    let near=Infinity,runnerUp=Infinity;
    for(const stone of stones){
      const dx=Math.abs(x-stone.x),dy=Math.abs(y-stone.y);
      const qx=Math.min(dx,edge-dx),qy=Math.min(dy,edge-dy);
      const distance=qx*qx+qy*qy;
      if(distance<near){runnerUp=near;near=distance;}
      else if(distance<runnerUp)runnerUp=distance;
    }
    const grain=(h%31)-15;
    const speck=h%29===1 ? -34 : 0;
    const seam=runnerUp-near<7 && h%7!==1 ? -48 : 0;
    const cluster=(coarse%24)-12;
    const value=Math.max(112,Math.min(252,222+grain+speck+seam+cluster));
    const i=(y*edge+x)*4;
    pixels[i]=value;
    pixels[i+1]=Math.max(0,value-2+(h%5));
    pixels[i+2]=Math.min(255,value+1);
    pixels[i+3]=255;
  }
  const tex=new DataTexture(pixels,edge,edge,RGBAFormat,UnsignedByteType);
  tex.wrapS=tex.wrapT=RepeatWrapping;
  tex.magFilter=tex.minFilter=NearestFilter;
  tex.generateMipmaps=false;
  tex.colorSpace=SRGBColorSpace;
  tex.flipY=false;
  tex.needsUpdate=true;
  tex.name='front-ridge-pixel-grain-32-nearest';
  return tex;
}

/**
 * 2 metres per repeat across the WORLD mesh. The mapping is deliberately
 * positional so the north-facing valley and buried skirt share a stable
 * grain cadence, independent of new triangulation.
 */
export function frontRidgeWorldUv(east:number,north:number,height:number) {
  return {u:east/frontRidgePixelSpec.tileMetres,
    v:(height*.81-north*.19)/frontRidgePixelSpec.tileMetres};
}

export function frontRidgeBandAt(height:number,steep:number) {
  return height<115?'moss-rock':height<245?'stone-ochre':
    (height>=frontRidgePixelSpec.minAltitudeSnowMetres && steep<frontRidgePixelSpec.snowMaxSteepness)
      ?'snow-ledge':'dark-cliff';
}
