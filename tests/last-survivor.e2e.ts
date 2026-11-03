import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createApp } from '../server/app.js';
import { SqliteStore } from '../server/store.js';
import { cards, FixtureCards } from './fixtures.js';
import type { RoomView } from '../shared/types.js';

const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-last-survivor-e2e-'));
const store=new SqliteStore(path.join(dir,'test.sqlite'));
const fixtureCards=cards.map(card=>({...card,image:'/debug-blue-eyes-card.webp'}));
class LocalCards extends FixtureCards {
  async card(id:number){return fixtureCards.find(card=>card.id===id)!;}
  async search(q:string,start=0){return {cards:fixtureCards.filter(card=>card.name.includes(q)).slice(start,start+3),next:0};}
}
const app=await createApp({store,cards:new LocalCards(fixtureCards),adminKey:'last-survivor-local-test'});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
  await new Promise<void>((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
  const snapshots=new Map<Page,RoomView|null>(),errors:string[]=[];
  const page=async(mobile=false)=>{
    const context=await browser!.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
    const p=await context.newPage();
    p.on('pageerror',error=>errors.push(error.message));
    p.on('websocket',socket=>socket.on('framereceived',frame=>{
      const message=JSON.parse(frame.payload.toString());
      if(message.type==='snapshot')snapshots.set(p,message.room);
    }));
    return p;
  };
  const wait=async(check:()=>boolean)=>{
    for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}
    throw new Error('Timed out waiting for last-survivor state');
  };
  const pick=async(p:Page,name:string)=>{
    await p.getByRole('combobox',{name:'你认为自己是哪张卡？',exact:true}).fill(name);
    await p.getByRole('option').filter({hasText:name}).first().click();
    await p.getByRole('button',{name:'提交猜测',exact:true}).click();
  };
  const a=await page(),b=await page(true),admin=await page();
  await a.goto(base);
  await a.getByLabel('你的昵称').fill('甲');
  await a.getByRole('radio',{name:'随机分配'}).check();
  await a.getByRole('button',{name:'创建房间，邀请朋友'}).click();
  await wait(()=>!!snapshots.get(a));
  const code=snapshots.get(a)!.code;
  await b.goto(base+'/?room='+code);
  await b.getByLabel('你的昵称').fill('乙');
  await b.getByRole('button',{name:'加入牌桌'}).click();
  await b.getByRole('button',{name:'我准备好了'}).click();
  await a.getByRole('button',{name:'开始游戏'}).click();
  await wait(()=>snapshots.get(a)?.phase==='guessing');
  assert(await a.getByRole('button',{name:'跳过回合',exact:true}).isEnabled());
  assert.equal(await a.getByRole('button',{name:'跳过回合',exact:true}).getAttribute('title'),null);
  await admin.goto(base+'/admin/entry?key=last-survivor-local-test');
  await admin.getByRole('heading',{name:'房间管理',exact:true}).waitFor();
  assert(await admin.getByRole('button',{name:'强制跳过回合',exact:true}).isEnabled());

  // The host finishes first, leaving the mobile player with three attempts.
  const state=app.hub.rooms.get(code)!;
  await pick(a,state.entries[0].card!.name);
  await wait(()=>snapshots.get(b)?.canSkipTurn===false);
  await b.locator('.turn-banner').getByText('仅剩你仍在猜卡，不能跳过回合。剩余 3 次猜测机会。',{exact:true}).waitFor();
  assert(await b.getByRole('button',{name:'跳过回合',exact:true}).isDisabled());
  assert(await a.getByRole('button',{name:'强制跳过',exact:true}).isDisabled());
  assert(await admin.getByRole('button',{name:'强制跳过回合',exact:true}).isDisabled());
  const turn=snapshots.get(b)!.turnId;
  await b.reload();
  await b.getByRole('button',{name:'跳过回合',exact:true}).waitFor();
  assert(await b.getByRole('button',{name:'跳过回合',exact:true}).isDisabled());
  assert.equal(snapshots.get(b)!.turnId,turn);
  await mkdir('test-results/last-survivor',{recursive:true});
  await a.screenshot({path:'test-results/last-survivor/desktop.png',fullPage:true});
  await b.screenshot({path:'test-results/last-survivor/mobile.png',fullPage:true});
  await admin.screenshot({path:'test-results/last-survivor/admin.png',fullPage:true});
  for(const p of [a,b])assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');

  const wrong=cards.find(card=>card.cid!==state.entries[1].card!.cid)!;
  for(let remaining=2;remaining>=0;remaining--){
    await pick(b,wrong.name);
    await wait(()=>snapshots.get(b)?.players.find(p=>p.id===snapshots.get(b)!.selfId)?.attempts===remaining);
    if(remaining>0){
      assert.equal(snapshots.get(b)!.phase,'guessing');
      assert(await b.getByRole('button',{name:'跳过回合',exact:true}).isDisabled());
      await b.locator('.turn-banner').getByText(`仅剩你仍在猜卡，不能跳过回合。剩余 ${remaining} 次猜测机会。`,{exact:true}).waitFor();
    }
  }
  await b.getByText('累计积分排行榜',{exact:true}).waitFor();
  assert.equal(snapshots.get(b)!.phase,'round-end');
  assert.equal(snapshots.get(b)!.players.find(p=>p.id===snapshots.get(b)!.selfId)!.status,'failed');
  assert.equal(snapshots.get(b)!.history.length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS desktop/mobile/admin skip restrictions, reload recovery and settlement after three guesses');
}finally{
  await browser?.close();await app.close();await store.close();await rm(dir,{recursive:true,force:true});
}
