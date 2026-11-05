import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium,type Page} from 'playwright';
import {createApp} from '../server/app.js';
import {SqliteStore} from '../server/store.js';
import {FixtureCards} from './fixtures.js';
import type {Command,Session} from '../shared/types.js';

declare global {interface Window {reactionDraws:string[];reactionAudioStarts:number;reactionAudioStops:number}}
const store=new SqliteStore(':memory:');
const app=await createApp({store,cards:new FixtureCards()});
await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const run=(actor:Session,action:Record<string,unknown>)=>app.hub.handle(actor,{id:randomUUID(),...action} as Command);
async function painted(page:Page){
  assert(await page.locator('.player-reaction-canvas').evaluate(canvas=>{
    const target=canvas as HTMLCanvasElement,ctx=target.getContext('2d')!;
    const data=ctx.getImageData(0,0,target.width,target.height).data;
    let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>20)pixels++;
    return pixels>50;
  }),'canvas contains visible effect pixels');
}
try{
  await mkdir('test-results',{recursive:true});
  const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1000}}),browser.newContext({viewport:{width:390,height:844}})]);
  const actors:Session[]=[],pages:Page[]=[],errors:string[]=[],failedAssets:string[]=[],requests:string[]=[];
  for(let i=0;i<2;i++){
    const context=contexts[i];
    await context.route('https://music.163.com/**',route=>readFile('public/player-reactions/renghuahuanhu.mp3').then(body=>route.fulfill({contentType:'audio/mpeg',body})));
    await context.addInitScript(()=>{
      window.reactionDraws=[];window.reactionAudioStarts=0;window.reactionAudioStops=0;
      const draw=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(this:CanvasRenderingContext2D,...args:unknown[]){
        const img=args[0];if(img instanceof HTMLImageElement&&img.src.includes('/player-reactions/')){
          window.reactionDraws.push(img.src.split('/').at(-1)!);if(window.reactionDraws.length>500)window.reactionDraws.splice(0,100);
        }
        return Reflect.apply(draw,this,args);
      };
      const stop=AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.stop=function(...args:Parameters<typeof stop>){window.reactionAudioStops++;return Reflect.apply(stop,this,args);};
      const start=AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){window.reactionAudioStarts++;return Reflect.apply(start,this,args);};
    });
    const session=(await (await context.request.post(base+'/api/session',{data:{name:i?'手机玩家':'桌面玩家'}})).json()).session as Session;
    session.expiresAt=Date.now()+86400000;actors.push(session);
    const page=await context.newPage();pages.push(page);page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().includes('/player-reactions/'))requests.push(request.url());});
    page.on('response',response=>{if(response.url().includes('/player-reactions/')&&response.status()>=400)failedAssets.push(response.url());});
  }
  await run(actors[0],{type:'create',settings:{mode:'random',attempts:3,itemCards:false}});
  const code=app.hub.roomFor(actors[0].playerId)!.code;
  await run(actors[1],{type:'join',code});
  for(const page of pages)await page.goto(base);
  await pages[0].getByRole('button',{name:'与 手机玩家 互动',exact:true}).waitFor();
  assert.equal(requests.length,0,'cosmetic assets stay unloaded before first reaction');
  for(const page of pages)await page.locator('.room-heading h1').click();
  await run(actors[1],{type:'ready',ready:true});await run(actors[0],{type:'start'});
  for(const page of pages)await page.getByLabel('剩余互动额度').filter({hasText:'100 / 100'}).waitFor();
  const chat=structuredClone(app.hub.roomFor(actors[0].playerId)!.chat);
  for(const [kind,quantity,hit] of [['flower',1,'sprites.webp'],['egg',1,'sprites.webp'],['flower',10,'cup-play2.webp'],['egg',10,'shoehit-play.webp']] as const){
    for(const page of pages)await page.evaluate(()=>{window.reactionDraws=[];});
    // Use the actual nickname menu to exercise sound unlock and WebSocket dispatch.
    await pages[0].getByRole('button',{name:'与 手机玩家 互动',exact:true}).click();
    await pages[0].getByRole('menuitem',{name:(kind==='flower'?'送花':'砸蛋')+' x'+quantity,exact:true}).click();
    for(const page of pages){
      await page.waitForFunction(name=>window.reactionDraws.includes(name),hit);
      if(quantity===1)await page.waitForTimeout(750);
      await painted(page);
    }
    await pages[0].screenshot({path:`test-results/reaction-effect-${kind}-${quantity}-desktop.png`});
    await pages[1].screenshot({path:`test-results/reaction-effect-${kind}-${quantity}-mobile.png`});
    for(const page of pages)await page.waitForFunction(()=>document.querySelector('.player-reaction-canvas')?.getAttribute('data-active')==='0');
  }
  assert(await pages[0].evaluate(()=>window.reactionAudioStarts>0),'audio plays after trusted interaction');
  assert(await pages[1].evaluate(()=>window.reactionAudioStarts>0),'receiver audio plays after trusted interaction');
  assert.deepEqual(app.hub.roomFor(actors[0].playerId)!.chat,chat);
  assert.equal(app.hub.roomFor(actors[0].playerId)!.players[0].reactionAllowance,78);
  const room=app.hub.roomFor(actors[0].playerId)!;
  room.music={activationId:randomUUID(),trackId:'4998139'};app.hub.broadcast();
  await pages[0].waitForFunction(()=>{const audio=document.querySelector('.music-player audio') as HTMLAudioElement|null;return audio?.src.includes('music.163.com')&&!audio.paused;});
  const startsBefore=await pages[0].evaluate(()=>window.reactionAudioStarts);
  await run(actors[0],{type:'player-reaction',kind:'flower',quantity:10,targetPlayerId:actors[1].playerId,setupId:room.setupId});
  await pages[0].waitForFunction(count=>window.reactionAudioStarts>count,startsBefore);
  const stopsBefore=await pages[0].evaluate(()=>window.reactionAudioStops);
  await pages[0].getByRole('button',{name:'关闭音乐 / 音效',exact:true}).click();
  await pages[0].waitForFunction(count=>window.reactionAudioStops>count,stopsBefore);
  await pages[0].waitForFunction(()=>{const audio=document.querySelector('.music-player audio') as HTMLAudioElement;return audio.paused&&!audio.getAttribute('src');});
  const before=await pages[0].evaluate(()=>window.reactionAudioStarts);
  await run(actors[0],{type:'player-reaction',kind:'egg',quantity:1,targetPlayerId:actors[1].playerId,setupId:room.setupId});
  await pages[0].waitForTimeout(1500);assert.equal(await pages[0].evaluate(()=>window.reactionAudioStarts),before);
  await painted(pages[0]);
  await pages[0].reload();
  await pages[0].getByRole('button',{name:'开启音乐 / 音效',exact:true}).waitFor();
  assert(await pages[0].locator('.music-player audio').evaluate(audio=>(audio as HTMLAudioElement).paused&&!audio.getAttribute('src')));
  await pages[0].getByRole('button',{name:'与 手机玩家 互动',exact:true}).click();
  assert.equal(await pages[0].getByRole('menuitem',{name:/互动音效/}).count(),0);await pages[0].keyboard.press('Escape');
  await pages[0].getByRole('button',{name:'开启音乐 / 音效',exact:true}).click();
  await pages[0].waitForFunction(()=>{const audio=document.querySelector('.music-player audio') as HTMLAudioElement;return !audio.paused&&!!audio.getAttribute('src');});
  const resumedStarts=await pages[0].evaluate(()=>window.reactionAudioStarts);
  await run(actors[0],{type:'player-reaction',kind:'egg',quantity:1,targetPlayerId:actors[1].playerId,setupId:room.setupId});
  await pages[0].waitForFunction(count=>window.reactionAudioStarts>count,resumedStarts);
  for(const page of pages)await page.waitForFunction(()=>document.querySelector('.player-reaction-canvas')?.getAttribute('data-active')==='0');
  await pages[1].emulateMedia({reducedMotion:'reduce'});
  await pages[1].evaluate(()=>{window.reactionDraws=[];});
  await run(actors[1],{type:'player-reaction',kind:'flower',quantity:10,targetPlayerId:actors[0].playerId,setupId:app.hub.roomFor(actors[0].playerId)!.setupId});
  await pages[1].waitForFunction(()=>window.reactionDraws.includes('sprites.webp'));await painted(pages[1]);
  await pages[1].waitForFunction(()=>document.querySelector('.player-reaction-canvas')?.getAttribute('data-active')==='0');
  assert(!await pages[1].evaluate(()=>window.reactionDraws.some(name=>name.startsWith('cup-')||name.startsWith('roseburst-'))));
  assert(await pages[1].evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  // Leaving tears down active effects and audio without affecting other players.
  await run(actors[1],{type:'leave'});await pages[1].waitForFunction(()=>!document.querySelector('.player-reaction-canvas'));
  assert.deepEqual(failedAssets,[]);assert.deepEqual(errors,[]);
  console.log('PASS four real effects on desktop/mobile, lazy assets, visible pixels, unified music/effect mute, immediate stop, preference persistence and re-enable, reduced motion, silent chat and teardown');
}finally{await browser.close();await app.close();await store.close();}
