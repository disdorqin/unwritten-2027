type Kind='rock'|'basalt'|'iron'|'rust'|'wood'|'crystal'|'ember'|'gravel';
type Box=(k:Kind,x:number,n:number,y:number,w:number,d:number,h:number,rz?:number,solid?:boolean)=>void;
/** Dry-side chambers and support station. Each room uses its surveyed shared layout.
 * Nothing in this function is a collectible, live mine, active lantern, boat, or water-state change. */
export function dressSecondMineDryWings(box:Box){
  // Upper workings: bent iron ribs, original rust-blackened bracing,
  // fragmented rock faces, track-free dry branches and an empty storage bay.
  for(const [side,n0,n1,edge] of [[-1,38,56,28],[1,68,90,32]] as const){
    const mid=(n0+n1)/2;
    for(let d=8;d<edge-3;d+=4){
      for(const n of [n0+1.1,n1-1.1]){
        box('iron',side*d,n,2.4,.33,.38,4.8,0,true);
        box('rust',side*d,n,.29,.66,.72,.58);
        for(let k=0;k<8;k++)box('iron',side*d+side*.20,n, .4+k*.54,.10,.12,.13);
      }
      box('iron',side*d,mid,4.85,.34,n1-n0-1.1,.30);
      for(const n of [n0+2.1,n1-2.1])box('rust',side*d,n,4.12,.26,.32,1.15,side*.42);
    }
    for(let row=0;row<11;row++)for(let col=0;col<Math.floor((n1-n0-2)/.57);col++){
      const n=n0+1+col*.57, y=.29+row*.46,x=side*(edge-.18-(row%3)*.09);
      box((row*13+col)%8===0?'rust':(row+col)%4?'rock':'basalt',x,n,y,.38,.54,.43,0,true);
      if((row*17+col)%13===0)box('iron',x-side*.22,n,y,.14,.34,.09);
    }
    // Mechanical storage in the corner: racks and empty bins. The entire
    // centre of the room remains clear for future measured encounter feet.
    const rackX=side*(edge-2.4),rackN=n0+2.4;
    for(const dn of [-1.1,1.1])box('iron',rackX,rackN+dn,1.05,.15,.18,2.1,0,true);
    for(const y of [.26,.99,1.77])box('wood',rackX,rackN,y,.98,2.4,.14,0,true);
    for(let j=0;j<18;j++){
      box(j%5?'wood':'iron',rackX+side*(j%3-1)*.22,rackN-.82+(j%6)*.32,.45+Math.floor(j/6)*.70,.23,.26,.22);
    }
    for(let j=0;j<16;j++)box(j%4?'gravel':'rust',side*(edge-1.7-j%3*.4),n1-1.1-Math.floor(j/3)*.47,.16+j%3*.06,.42,.39,.32+j%3*.13,0,true);
  }
  // -140 support station: dry supply cabinet, timber bench, sign blank,
  // spare iron ribs and a small empty tool tray beside the existing camp fire.
  for(const n of [5,14]){
    box('iron',-5.3,n,1.8,.27,.32,3.6,0,true);box('iron',5.3,n,1.8,.27,.32,3.6,0,true);
    box('iron',0,n,3.65,10.7,.33,.30);
  }
  for(let i=0;i<6;i++){
    box('wood',-5,6+i*.53,.43,.79,.50,.85,0,true);
    box('rust',-4.57,6+i*.53,.45,.05,.12,.22);
    box('iron',4.82,15+i*.57,1.1,.13,.45,2.2,0,true);
  }
  box('wood',-5,12.3,.46,.65,2.4,.18,0,true);
  for(const n of [11.3,13.3])box('iron',-5,n,.21,.22,.24,.43,0,true);
  box('wood',5.0,8,.84,1.1,2.4,.20,0,true);
  for(const n of [7,9])box('iron',5,n,.36,.22,.28,.72,0,true);
  for(let i=0;i<9;i++)box(i%3?'iron':'rust',5.0+(i%2-.5)*.45,7.22+i*.18,.99,.20,.12,.08);
  // Deep collapse: one traversable side passage with authentic graded debris,
  // a bent support crown and exposed mineral seams as non-mineable artwork.
  for(let n=163;n<180;n+=.64)for(let i=0;i<5;i++){
    const x=-64.8+i*.56, h=.44+((i*7+Math.round(n*10))%7)*.25;
    box(i%3?'rock':'basalt',x,n,h/2,.59,.60,h,0,true);
    if(i%3===0)box('rust',x+.12,n,h+.1,.22,.29,.13);
  }
  for(let i=0;i<8;i++){
    box('iron',-60,163+i*2,1.4,.23,.29,2.8,-.18, true);
    box('rust',-60.1,163+i*2,2.8,.25,.32,.5,-.3);
    box('iron',-58.5,163+i*2,3.10,3.2,.30,.24);
  }
  for(let row=0;row<12;row++)for(let col=0;col<24;col++){
    const n=162.35+col*.70;
    box((row*7+col)%15===0?'crystal':(row+col)%3?'rock':'basalt',-65.82,n,.28+row*.58,.32,.67,.54);
  }
  // Abandoned barracks: a real interior with bunk frames, empty lockers,
  // torn blankets, stools and worn shelving; no reward sockets.
  for(const n of [168.5,179.5])for(let i=0;i<4;i++){
    const x=57+i*2;
    for(const dx of [-.60,.60])for(const dn of [-.85,.85])box('iron',x+dx,n+dn,.85,.12,.14,1.7,0,true);
    for(const y of [.34,1.45]){
      for(let j=0;j<8;j++)box('wood',x,n-.75+j*.21,y,1.18,.19,.14,0,true);
      box('rock',x,n,y+.15,1.02,1.43,.15,0,true);
      box('gravel',x,n-.50,y+.26,.83,.32,.11);
      for(let j=0;j<6;j++)box('basalt',x+(j%3-1)*.27,n+.15+Math.floor(j/3)*.34,y+.24,.26,.31,.06);
    }
  }
  for(let i=0;i<8;i++){
    const n=167.3+i*1.8;
    box('rust',65,n,.97,.76,1.1,1.94,0,true);
    for(let row=0;row<5;row++)box('iron',64.58,n,.43+row*.27,.05,.76,.23);
    box('iron',64.52,n+.28,1.11,.09,.12,.15);
  }
  for(let i=0;i<8;i++){
    const x=49.5+i*1.75;
    box('wood',x,177.1,.52,1.32,.70,.18,0,true);
    for(const d of [-.48,.48])box('iron',x+d,177.1,.22,.18,.50,.44,0,true);
    for(let j=0;j<4;j++)box(j%3?'rust':'gravel',x-.4+j*.26,177.1,.68,.20,.22,.14);
  }
}
