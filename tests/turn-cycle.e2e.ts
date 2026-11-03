import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createApp } from '../server/app.js';
import { SqliteStore } from '../server/store.js';
import { cards, FixtureCards } from './fixtures.js';
import type { RoomView } from '../shared/types.js';

const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-turn-cycle-e2e-'));
const store=new SqliteStore(path.join(dir,'test.sqlite'));
const provider=new FixtureCards(cards.map(card=>({...card,image:'/debug-blue-eyes-card.webp'})));
const app=await createApp({store,cards:provider});
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
    throw new Error('Timed out waiting for turn cycle');
  };
  const cycle=async(p:Page,value:number)=>{
    await p.getByLabel('当前回合',{exact:true}).filter({hasText:new RegExp('^第'+value+'回合$')}).waitFor();
    assert.equal(snapshots.get(p)!.turnCycle,value);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  };
  const a=await page(),b=await page(true);
  await a.goto(base);
  await a.getByLabel('你的昵称').fill('甲');
  await a.getByRole('radio',{name:'随机分配'}).check();
  await a.getByRole('button',{name:'创建房间，邀请朋友'}).click();
  await wait(()=>!!snapshots.get(a));
  assert.equal(await a.getByLabel('当前回合',{exact:true}).count(),0);
  await b.goto(base+'/?room='+snapshots.get(a)!.code);
  await b.getByLabel('你的昵称').fill('乙');
  await b.getByRole('button',{name:'加入牌桌'}).click();
  await b.getByRole('button',{name:'我准备好了'}).click();
  await a.getByRole('button',{name:'开始游戏'}).click();
  await cycle(a,1);await cycle(b,1);
  await a.getByRole('button',{name:'跳过回合',exact:true}).click();
  await wait(()=>snapshots.get(a)?.turnPlayerId===snapshots.get(b)?.selfId);
  await cycle(a,1);await cycle(b,1);
  await b.getByRole('button',{name:'跳过回合',exact:true}).click();
  await cycle(a,2);await cycle(b,2);
  await a.reload();await cycle(a,2);
  await mkdir('test-results/turn-cycle',{recursive:true});
  await a.screenshot({path:'test-results/turn-cycle/desktop.png',fullPage:true});
  await b.screenshot({path:'test-results/turn-cycle/mobile.png',fullPage:true});
  for(const p of [a,b]){
    await p.getByRole('button',{name:'放弃本局',exact:true}).click();
    await p.getByRole('button',{name:'确认',exact:true}).click();
  }
  await a.getByRole('button',{name:'返回准备'}).click();
  await b.getByRole('button',{name:'我准备好了'}).click();
  await a.getByRole('button',{name:'开始游戏'}).click();
  await cycle(a,1);await cycle(b,1);
  assert.equal(snapshots.get(a)!.round,2);
  assert.equal(snapshots.get(a)!.turnPlayerId,snapshots.get(b)!.selfId);
  assert.deepEqual(errors,[]);
  console.log('PASS desktop/mobile cycle display, full rotation, reload and next-game reset');
}finally{
  await browser?.close();await app.close();await store.close();await rm(dir,{recursive:true,force:true});
}
