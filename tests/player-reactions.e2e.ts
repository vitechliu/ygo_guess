import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createApp} from '../server/app.js';
import {SqliteStore} from '../server/store.js';
import {FixtureCards} from './fixtures.js';
import type {Command,Session,PlayerReaction} from '../shared/types.js';

const store=new SqliteStore(':memory:');
const app=await createApp({store,cards:new FixtureCards()});
await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const run=(actor:Session,action:Record<string,unknown>)=>app.hub.handle(actor,{id:randomUUID(),...action} as Command);
try{
  await mkdir('test-results',{recursive:true});
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
  const mobile=await browser.newContext({viewport:{width:390,height:844}});
  const a=(await (await desktop.request.post(base+'/api/session',{data:{name:'桌面玩家'}})).json()).session as Session;
  const b=(await (await mobile.request.post(base+'/api/session',{data:{name:'手机玩家'}})).json()).session as Session;
  a.expiresAt=b.expiresAt=Date.now()+86400000;
  await run(a,{type:'create',settings:{mode:'random',attempts:3,itemCards:false}});
  const code=app.hub.roomFor(a.playerId)!.code;
  await run(b,{type:'join',code});
  const page=await desktop.newPage(),phone=await mobile.newPage();
  const errors:string[]=[];const events:PlayerReaction[]=[];
  for(const p of [page,phone])p.on('pageerror',error=>errors.push(error.message));
  phone.on('websocket',ws=>ws.on('framereceived',frame=>{const m=JSON.parse(frame.payload.toString());if(m.type==='player-reaction')events.push(m.reaction);}));
  await page.goto(base);await phone.goto(base);
  const trigger=page.getByRole('button',{name:'与 手机玩家 互动',exact:true});
  await trigger.click();assert(await page.getByRole('menuitem',{name:'送花 x1',exact:true}).isDisabled());await page.keyboard.press('Escape');
  await run(b,{type:'ready',ready:true});await run(a,{type:'start'});
  const chat=structuredClone(app.hub.roomFor(a.playerId)!.chat);
  await page.getByLabel('剩余互动额度').filter({hasText:'100 / 100'}).waitFor();
  await trigger.click();await page.getByRole('menuitem',{name:'送花 x1',exact:true}).click();
  await page.getByLabel('剩余互动额度').filter({hasText:'99 / 100'}).waitFor();
  for(let i=0;i<9;i++){
    await trigger.click();await page.getByRole('menuitem',{name:'砸蛋 x10',exact:true}).click();
    await page.getByLabel('剩余互动额度').filter({hasText:`${89-i*10} / 100`}).waitFor();
  }
  await trigger.click();assert(await page.getByRole('menuitem',{name:'送花 x10',exact:true}).isDisabled());assert(await page.getByRole('menuitem',{name:'砸蛋 x10',exact:true}).isDisabled());
  assert(await page.getByRole('menuitem',{name:'送花 x1',exact:true}).isEnabled());
  await page.screenshot({path:'test-results/reactions-desktop.png',fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');
  await page.reload();await page.getByLabel('剩余互动额度').filter({hasText:'9 / 100'}).waitFor();
  await phone.getByRole('button',{name:'与 桌面玩家 互动',exact:true}).click();
  await phone.screenshot({path:'test-results/reactions-mobile.png',fullPage:true,animations:'disabled'});
  assert(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await phone.getByRole('menuitem',{name:'送花 x10',exact:true}).click();
  await phone.getByLabel('剩余互动额度').filter({hasText:'90 / 100'}).waitFor();
  assert.equal(events.length,11);assert.deepEqual(app.hub.roomFor(a.playerId)!.chat,chat);
  for(let i=0;i<2;i++){
    const r=app.hub.roomFor(a.playerId)!;
    await run(r.turnPlayerId===a.playerId?a:b,{type:'give-up',turnId:r.turnId});
  }
  await run(a,{type:'next'});await run(b,{type:'ready',ready:true});await run(a,{type:'start'});
  await page.getByLabel('剩余互动额度').filter({hasText:'100 / 100'}).waitFor();
  await phone.getByLabel('剩余互动额度').filter({hasText:'100 / 100'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS desktop/mobile reaction menus, shared allowance, disabled quantities, silent room events, reload and next-round reset');
}finally{await browser.close();await app.close();await store.close();}
