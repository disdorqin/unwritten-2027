import {
  CanvasTexture, SRGBColorSpace,
} from 'three';
import {surveyPlateLines, type SurveyStationId} from './town-survey';

/**
 * D4-R4/R5: exact B-window survey inscription. All four signs use the
 * B-window rule leaf (no duplicate beacon drift formula, no lore spoilers).
 *
 * Return metadata even in Node, so the source text remains testable. The
 * rendered photo uses a live native canvas texture only in the browser.
 */
export function createSummitSurveyInscription(id: SurveyStationId){
  const lines=surveyPlateLines(id);
  const pixelWidth=768,pixelHeight=540;
  if(typeof document==='undefined'){
    return {id,lines,texture:undefined,pixelWidth,pixelHeight};
  }
  const canvas=document.createElement('canvas');
  canvas.width=pixelWidth;
  canvas.height=pixelHeight;
  const ctx=canvas.getContext('2d');
  if(!ctx)return {id,lines,texture:undefined,pixelWidth,pixelHeight};
  // Chiseled gold-ochre plate, rectangular wear around bronze triangle.
  const gradient=ctx.createLinearGradient(0,0,pixelWidth,pixelHeight);
  gradient.addColorStop(0,'#dfc997');
  gradient.addColorStop(.54,'#bca173');
  gradient.addColorStop(1,'#92734c');
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,pixelWidth,pixelHeight);
  // Fine rock-grain etch marks rather than a smooth abstract sticker.
  for(let i=0;i<340;i++){
    const x=(i*109+71)%pixelWidth;
    const y=(i*167+13)%pixelHeight;
    ctx.fillStyle=i%4===0?'#5f5947':'#edddb0';
    ctx.fillRect(x,y,i%3===0?5:2,i%5===0?3:1);
  }
  ctx.strokeStyle='#604b31';
  ctx.lineWidth=16;
  ctx.strokeRect(27,26,pixelWidth-54,pixelHeight-52);
  ctx.strokeStyle='#e5d0a1';
  ctx.lineWidth=5;
  ctx.strokeRect(47,45,pixelWidth-94,pixelHeight-90);
  const fonts=['bold 91px "Microsoft YaHei",sans-serif',
    'bold 78px "Microsoft YaHei",sans-serif',
    'bold 76px "Microsoft YaHei",sans-serif'] as const;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  for(let row=0;row<lines.length;row++){
    const y=140+row*134;
    ctx.font=fonts[row]!;
    ctx.fillStyle='#e8d6b0';
    ctx.fillText(lines[row]!,pixelWidth/2+4,y+4,pixelWidth-100);
    ctx.fillStyle='#453b2d';
    ctx.fillText(lines[row]!,pixelWidth/2,y,pixelWidth-100);
  }
  const texture=new CanvasTexture(canvas);
  texture.colorSpace=SRGBColorSpace;
  texture.name='mountain-survey-engraved-'+id.toLowerCase();
  return {id,lines,texture,pixelWidth,pixelHeight};
}
