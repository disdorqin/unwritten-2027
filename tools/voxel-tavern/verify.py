"""Use the owner's existing isolated Playwright MCP; no personal browser profile."""
import asyncio, json, pathlib, subprocess, os
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
                  for (const name of ['outside','hall','upstairs']) {
                    await page.locator(`[data-view="${name}"]`).click();
                    await page.waitForTimeout(1500);
                    const filename=ARTIFACTS+'/'+name+'.png';
                    await page.screenshot({path:filename});
                    results.views.push({name, filename, diagnostics:await page.evaluate(()=>({position:window.tavernProbe.controls.object.position.toArray(),drawCalls:window.tavernProbe.renderer.info.render.calls,triangles:window.tavernProbe.renderer.info.render.triangles,stats:window.tavernProbe.stats}))});
                  }
                  results.mode='offline visual QA, multiplayer separately tested against Rust server';
                  return results;
                }'''.replace('ARTIFACTS',json.dumps(str(artifacts).replace('\\','/')))
                code_tool=next(t.name for t in available.tools if t.name in ('browser_run_code','browser_run_code_unsafe'))
                await call(code_tool,{'code':code})
                await call('browser_console_messages',{'level':'error'})
    finally:
        for p in processes:
            subprocess.run(['taskkill','/pid',str(p.pid),'/t','/f'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':asyncio.run(main())
