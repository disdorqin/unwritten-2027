import {DataTexture,NearestFilter,RepeatWrapping,RGBAFormat,SRGBColorSpace,UnsignedByteType} from 'three';

/** Small original pixel grain; neutral albedo multiplier, shared by all
 * colors in a batch. No download, large atlas, new light or draw call. */
export function createSkyCitySurfaceGrain(){
 const size=32,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const coarse=((x>>2)*17+(y>>2)*31+((x>>2)^(y>>2))*11)%21;
   const fine=(x*47+y*71+x*y*19)%12;
   const score=223+coarse+fine;
   const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.min(255,score);data[i+3]=255;
 }
 const tex=new DataTexture(data,size,size,RGBAFormat,UnsignedByteType);
 tex.colorSpace=SRGBColorSpace;tex.wrapS=tex.wrapT=RepeatWrapping;tex.magFilter=NearestFilter;tex.minFilter=NearestFilter;
 tex.needsUpdate=true;return tex;
}
