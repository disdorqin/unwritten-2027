// Real Rust server + two independent WebSocket clients; no renderer mock.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {gzipSync}=require('node:zlib');
const {protocol,PROTOCOL_VERSION}=require('@voxelize/protocol');
const lz4=require('lz4js');
const WebSocket=require('ws');
const path=require('node:path');
const server=spawn(path.join(__dirname,'target/debug/tavern'),[],{stdio:['ignore','pipe','pipe']});
const clients=[];
const messages=[[],[]];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const send=(ws,data)=>ws.send(protocol.Message.encode(protocol.Message.create(data)).finish());
const timer=setTimeout(()=>finish(new Error('server/client timeout')),20000);
function finish(error){clearTimeout(timer);clients.forEach(c=>c.terminate());server.kill();if(error){console.error(error);process.exitCode=1;}}
server.stdout.on('data',async d=>{
 if(!d.toString().includes('server marked started'))return;
 try {
   for(let i=0;i<2;i++){
     const ws=new WebSocket('ws://127.0.0.1:4000/ws/');clients.push(ws);
     ws.on('message',b=>{try {const bytes=b[0]===4&&b[1]===34?lz4.decompress(b):b;messages[i].push(protocol.Message.decode(bytes));}catch(e){finish(e);}});
     await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej);});
     send(ws,{type:1,json:JSON.stringify({world:'tavern',username:`probe-${i}`,protocol:PROTOCOL_VERSION})});
   }
   await delay(1200);
   const init=messages.map(ms=>ms.find(m=>m.type===0));
   if(init.some(m=>!m))throw new Error('missing INIT: '+JSON.stringify(messages.map(ms=>ms.map(m=>({type:m.type,text:m.text})))));
   const own=JSON.parse(init[0].json);
   console.log('INIT fields',Object.keys(own));
   const id=own.id;
   send(clients[0],{type:4,peers:[{id,username:'probe-0',metadata:JSON.stringify({position:[0,4,3],direction:[0,0,-1]})}]});
   await delay(800);
   const delivered=messages[1].some(m=>m.peers.some(p=>p.username==='probe-0' && JSON.stringify(JSON.parse(p.metadata).position)==='[0,4,3]'));
   if(!delivered)throw new Error('position was not broadcast: '+JSON.stringify(messages[1].map(m=>({type:m.type,text:m.text,peers:m.peers}))));
   if(process.argv.includes('--capture')){
     const chunks=[];for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)chunks.push([x,z]);
     send(clients[0],{type:6,json:JSON.stringify({center:[0,0],direction:[0,-1],chunks})});
     for(let i=0;i<80 && messages[0].filter(m=>m.type===6).flatMap(m=>m.chunks).length<9;i++)await delay(100);
     const loaded=messages[0].filter(m=>m.type===6).flatMap(m=>m.chunks);
     if(loaded.length<9)throw new Error('incomplete captured chunks: '+loaded.length);
     function unpack(b,kind){if(!b.length)return [];const n=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);const out=new Uint8Array(n);lz4.decompressBlock(b.subarray(4),out,0,b.length-4,0);return Array.from(kind==='float'?new Float32Array(out.buffer):new Uint32Array(out.buffer));}
     const clean=loaded.map(c=>({
       id:c.id,x:c.x,z:c.z,voxels:unpack(c.voxels),lights:unpack(c.lights),
       meshes:c.meshes.map(m=>({level:m.level,geometries:m.geometries.map(g=>({
         ...g,positions:unpack(g.positions,'float'),indices:unpack(g.indices),
         uvs:unpack(g.uvs,'float'),lights:unpack(g.lights)
       }))}))
     }));
     const data=gzipSync(JSON.stringify({init:{type:'INIT',json:own},load:{type:'LOAD',chunks:clean}}));
     writeFileSync(path.join(__dirname,'snapshot.json.gz'),data);
     writeFileSync(path.join(__dirname,'snapshot.ts'),'// Captured from the real Rust server; offline visual QA only.\nexport default '+JSON.stringify(data.toString('base64'))+';\n');
     console.log('Captured real server registry + chunks',loaded.length,'gzip bytes',data.length);
   }
   const info=await (await fetch('http://127.0.0.1:4000/info')).json();
   const rss=Number(readFileSync(`/proc/${server.pid}/status`,'utf8').match(/VmRSS:\s+(\d+)/)[1]);
   console.log(JSON.stringify({result:'PASS',twoClientsJoined:true,positionBroadcast:true,serverRssMiB:Math.round(rss/1024),info},null,2));
   finish();
 }catch(e){finish(e);}
});
