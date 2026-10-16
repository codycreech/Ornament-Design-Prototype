const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'};
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader'],headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.waitForSelector('#sphereMount canvas');
 await page.waitForTimeout(1800);
 const canvas=page.locator('#gridMount canvas'); const box=await canvas.boundingBox();
 await page.mouse.click(box.x+45,box.y+45);
 await page.waitForFunction(()=>Object.keys(Shared.nodePaint).length===1);
 await page.locator('#undo').click(); await page.waitForFunction(()=>Object.keys(Shared.nodePaint).length===0);
 await page.locator('#redo').click(); await page.waitForFunction(()=>Object.keys(Shared.nodePaint).length===1);
 await page.fill('#profileName','Test profile'); await page.click('#save');
 await page.waitForTimeout(600); await page.reload(); await page.waitForSelector('#gridMount canvas');
 assert.equal(await page.evaluate(()=>Object.keys(Shared.nodePaint).length),1);
 await page.setInputFiles('#importFile',{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"nodePaint":{"0":"invalid"}}')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Import failed:'));
 assert.equal(await page.evaluate(()=>Object.keys(Shared.nodePaint).length),1);
 const download=page.waitForEvent('download'); await page.click('#png'); const file=await download; assert(file.suggestedFilename().endsWith('.png'));

 await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.waitForSelector('#sphereMount canvas');await context.setOffline(false);
 const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const touch=await phone.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(base);await touch.waitForSelector('#gridMount canvas');await touch.evaluate(()=>window.scrollTo(0,document.querySelector('#gridMount canvas').getBoundingClientRect().top+scrollY-120));const touchBox=await touch.locator('#gridMount canvas').boundingBox();await touch.touchscreen.tap(touchBox.x+45,touchBox.y+45);await touch.waitForFunction(()=>Object.keys(Shared.nodePaint).length===1);await touch.locator('#paintEnabled').uncheck();await touch.waitForFunction(()=>document.querySelector('#gridMount canvas').style.touchAction==='auto');await phone.close();
 await page.evaluate(()=>SharedHelpers.applyPaintProfile({version:1,nodePaint:Object.fromEntries(Object.keys(Shared.sphereNodeToCellId).map(id=>[id,'#d86477']))}));await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>{const canvas=document.querySelector('#sphereMount canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');return gl.getError();}),0);
 console.log(JSON.stringify({errors,painted:await page.evaluate(()=>Object.keys(Shared.nodePaint).length)}));
 assert.deepEqual(errors,[]);
 } finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exit(1)});
