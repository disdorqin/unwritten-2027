import * as V from '@voxelize/core';
import * as T from 'three';
import blueprint from './tavern.json';
import snapshotBase64 from './snapshot';

const status=document.querySelector('#status')!;
async function start(){
 const offline=new URLSearchParams(location.search).has('snapshot');
 const world=new V.World({textureUnitDimension:8});
 const camera=new T.PerspectiveCamera(65,innerWidth/innerHeight,.1,200);
 const renderer=new T.WebGLRenderer({canvas:document.querySelector('#view')!,antialias:true});
 renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 world.background=new T.Color('#253747');
 const inputs=new V.Inputs();
 const controls=new V.RigidControls(camera,renderer.domElement,world,{initialPosition:[14,5,20]});
 controls.connect(inputs,'in-game');
 world.add(controls.object);
 const peers=new V.Peers<V.Character>(controls.object);
 peers.createPeer=id=>{const c=new V.Character();c.username=id.slice(0,6);return c;};
 peers.onPeerUpdate=(peer,data)=>peer.set(data.position,data.direction);
 world.add(peers);
 const network=new V.Network();network.register(world).register(controls).register(peers);
 const target=new URL(location.origin);
 let snapshot:any;
 if(offline){
  const bytes=Uint8Array.from(atob(snapshotBase64),c=>c.charCodeAt(0));
  snapshot=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  // The captured nine chunks form this viewer's finite map. Avoid waiting
  // for uncaptured neighbour chunks before the engine can mesh boundary cells.
  snapshot.init.json.options.minChunk=[-1,-1];snapshot.init.json.options.maxChunk=[1,1];
  world.onMessage(snapshot.init);
 }else{await network.connect(target.toString());await network.join('tavern');}
 await world.initialize();
 await world.applyBlockTexture(1,['px','nx','py','ny','pz','nz'],new T.Color(blueprint.palette.snow));
 for(let i=0;i<blueprint.catalogue.length;i++)for(let j=0;j<blueprint.catalogue[i].length;j++){
  const part=blueprint.catalogue[i][j];const prefix=`${part.m}${j}`;
  const faces=world.getBlockById(i+2).faces.filter(f=>f.name.startsWith(prefix)).map(f=>f.name);
  await world.applyBlockTexture(i+2,faces,new T.Color(blueprint.palette[part.m as keyof typeof blueprint.palette]));
 }
 world.renderRadius=3;
 if(offline){
  for(const c of snapshot.load.chunks){c.voxels=new Uint32Array(c.voxels);c.lights=new Uint32Array(c.lights);for(const m of c.meshes)for(const g of m.geometries){g.positions=new Float32Array(g.positions);g.indices=new Uint32Array(g.indices);g.uvs=new Float32Array(g.uvs);g.lights=new Uint32Array(g.lights);}}
  world.onMessage(snapshot.load);
  document.querySelector('h1')!.textContent='酒馆 · 离线建筑查看';
 }
 const views={outside:{p:[14,5,20],look:[0,6,0]},hall:{p:[0,4.5,3],look:[-1,4,-4]},upstairs:{p:[1,8,4],look:[-3,7.5,-2]}};
 function view(name:keyof typeof views){const v=views[name];controls.teleportToExact(...v.p as [number,number,number]);controls.setDirection(v.look[0]-v.p[0],v.look[1]-v.p[1],v.look[2]-v.p[2]);}
 document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view as keyof typeof views));
 document.querySelector('#enter')!.addEventListener('click',()=>controls.lock());
 let frames=0;
 renderer.setAnimationLoop(()=>{controls.update();world.update(controls.object.position,camera.getWorldDirection(new T.Vector3()),camera);world.updateShaderLighting(camera,controls.object.position);peers.update();renderer.render(world,camera);if(++frames%60===0)status.textContent=offline?`真实服务器地图快照 · ${blueprint.stats.pieces} 件构件 · 此查看器未联机`:`已连接 · ${peers.map.size+1} 人 · ${blueprint.stats.pieces} 件构件`;});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 view('outside');
 // Read-only diagnostics for the sample's browser acceptance.
 Object.assign(window,{tavernProbe:{world,controls,peers,network,renderer,camera,view,stats:blueprint.stats}});
 status.textContent='已连接，载入方块…';
}
start().catch(e=>{document.querySelector('#error')!.textContent=String(e);status.textContent='验证未通过：初始化失败';console.error(e);});
