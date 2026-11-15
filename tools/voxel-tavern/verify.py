"""Use the owner's existing isolated Playwright MCP; no personal browser profile."""
import asyncio, json, pathlib, subprocess, os, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT=pathlib.Path(__file__).resolve().parent

async def main():
    artifacts=ROOT/'artifacts'; artifacts.mkdir(exist_ok=True)
    processes=[]
    try:
        for command in [['node',str(ROOT/'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5179']]:
            processes.append(subprocess.Popen(command,cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
        cached=list((pathlib.Path(os.environ['LOCALAPPDATA'])/'npm-cache/_npx').glob('*/node_modules/@playwright/mcp/cli.js'))
        if not cached: raise RuntimeError('Existing Playwright MCP CLI is not available')
        params=StdioServerParameters(command='node',args=[str(cached[0]),'--headless','--isolated','--browser=chrome','--output-dir',str(artifacts/'mcp')],env=dict(os.environ),cwd=str(ROOT))
        async with stdio_client(params) as (reader,writer):
            async with ClientSession(reader,writer) as session:
                await session.initialize()
                available=await session.list_tools()
                print(json.dumps({'tools':[t.name for t in available.tools]},ensure_ascii=False),flush=True)
                async def call(name,args):
                    r=await session.call_tool(name,args)
                    print(json.dumps({'tool':name,'error':r.isError,'content':[c.text for c in r.content if getattr(c,'text',None)]},ensure_ascii=False),flush=True)
                    return r
                await call('browser_navigate',{'url':'http://127.0.0.1:5179/?snapshot=1'})
                code='''async (page) => {
                  await page.waitForFunction(() => window.tavernProbe || document.querySelector('#error').textContent, {timeout:30000});
                  const initial = await page.locator('aside').innerText();
                  if (!await page.evaluate(() => !!window.tavernProbe)) return {initial};
                  await page.waitForTimeout(4000);
                  const results={initial, views:[]};
                  for (const name of VIEWS) {
                    await page.locator(`[data-view="${name}"]`).click();
                    await page.waitForTimeout(1500);
                    const filename=ARTIFACTS+'/'+name+'.png';
                    await page.screenshot({path:filename});
                    results.views.push({name, filename, diagnostics:await page.evaluate(()=>({position:window.tavernProbe.controls.object.position.toArray(),drawCalls:window.tavernProbe.renderer.info.render.calls,triangles:window.tavernProbe.renderer.info.render.triangles,stats:window.tavernProbe.stats}))});
                  }
                  if (FULL) {
                  await page.locator('[data-view="outside"]').click();
                  await page.locator('#night').click();await page.waitForTimeout(750);
                  await page.screenshot({path:ARTIFACTS+'/night.png'});
                  await page.locator('#night').click();
                  results.walk=await page.evaluate(async()=>{
                    const c=window.tavernProbe.controls;
                    c.body.gravityMultiplier=1;c.teleportToExact(0,4.6,11.5);
                    await new Promise(r=>setTimeout(r,500));
                    const path=[[0,4.3],[5,4.3],[5,-3.5],[2.5,-3.5],[2.5,4.3],[0,4.3],[0,7]],out=[];
                    for(const [x,z]of path){
                      const end=performance.now()+6000;c.movements.front=true;
                      while(performance.now()<end){const p=c.object.position;if(Math.hypot(x-p.x,z-p.z)<.25)break;c.setDirection(x-p.x,0,z-p.z);await new Promise(r=>setTimeout(r,25));}
                      c.movements.front=false;await new Promise(r=>setTimeout(r,120));
                      const p=c.object.position.toArray();out.push({target:[x,z],position:p,reached:Math.hypot(x-p[0],z-p[2])<.65});
                      if(!out[out.length-1].reached)break;
                    }
                    return {route:out,passed:out.length===path.length&&out.every(p=>p.reached)&&out[out.length-1].position[1]>9};
                  });
                  }
                  results.mode='authored offline construction; new building multiplayer not retested';
                  return results;
                }'''.replace('ARTIFACTS',json.dumps(str(artifacts).replace('\\','/'))).replace('VIEWS',json.dumps(sys.argv[1:] or ['outside','hall','upstairs','balcony','facade','bar'])).replace('FULL','false' if sys.argv[1:] else 'true')
                code_tool=next(t.name for t in available.tools if t.name in ('browser_run_code','browser_run_code_unsafe'))
                await call(code_tool,{'code':code})
                await call('browser_console_messages',{'level':'error'})
    finally:
        for p in processes:
            subprocess.run(['taskkill','/pid',str(p.pid),'/t','/f'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':asyncio.run(main())
