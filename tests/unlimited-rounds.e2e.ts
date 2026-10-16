import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createApp } from '../server/app.js';
import { SqliteStore } from '../server/store.js';
import { FixtureCards } from './fixtures.js';
import type { RoomView } from '../shared/types.js';

const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-rounds-e2e-'));
const store=new SqliteStore(path.join(dir,'test.sqlite'));
const app=await createApp({store,cards:new FixtureCards()});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
  const snapshots=new Map<Page,RoomView|null>();
  const page=async()=>{
    const context=await browser!.newContext();
    const result=await context.newPage();
    result.on('websocket',socket=>socket.on('framereceived',frame=>{
      try{const message=JSON.parse(frame.payload.toString());if(message.type==='snapshot')snapshots.set(result,message.room);}catch{}
    }));
    return result;
  };
  const wait=async(check:()=>boolean)=>{
    for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}
    throw new Error('Timed out waiting for game state');
  };
  const pick=async(p:Page,name:string,button:string)=>{
    await p.locator('input[role="combobox"]').fill(name);
    await p.getByRole('option',{name:new RegExp(name)}).first().click();
    await p.getByRole('button',{name:button,exact:true}).click();
  };
  const a=await page(),b=await page();
  await a.goto(base);
  assert.equal(await a.getByLabel('比赛局数').count(),0);
  await a.getByLabel('你的昵称').fill('甲');
  await a.getByLabel('每局猜测机会').fill('1');
  await a.getByRole('button',{name:'创建房间，邀请朋友'}).click();
  await wait(()=>!!snapshots.get(a));
  const code=snapshots.get(a)!.code;
  assert.equal('rounds' in snapshots.get(a)!.settings,false);
  assert.equal(await a.getByLabel('房间比赛局数').count(),0);
  await b.goto(base+'/?room='+code);
  await b.getByLabel('你的昵称').fill('乙');
  await b.getByRole('button',{name:'加入牌桌'}).click();
  await b.getByRole('button',{name:'我准备好了'}).click();
  await wait(()=>!!snapshots.get(a)?.players.find(p=>p.name==='乙'&&p.ready));
  await a.getByRole('button',{name:'开始游戏'}).click();
  for(let round=1;round<=2;round++){
    await wait(()=>snapshots.get(a)?.phase==='setting');
    await pick(a,'测试卡0','确认出题');
    await pick(b,'测试卡1','确认出题');
    await wait(()=>snapshots.get(a)?.phase==='guessing');
    for(let turn=0;turn<2;turn++){
      const current=snapshots.get(a)!.turnPlayerId;
      await pick(current===snapshots.get(a)!.selfId?a:b,current===snapshots.get(a)!.selfId?'测试卡1':'测试卡0','提交猜测');
      await wait(()=>snapshots.get(a)?.phase==='round-end'||snapshots.get(a)?.turnPlayerId!==current);
    }
    await wait(()=>snapshots.get(a)?.phase==='round-end');
    assert.equal(snapshots.get(a)!.round,round);
    assert.deepEqual(snapshots.get(a)!.players.map(p=>p.score),[round*1000,round*1000]);
    await a.getByText('累计积分排行榜',{exact:true}).waitFor();
    if(round<2)await a.getByRole('button',{name:'开始下一局'}).click();
  }
  console.log('PASS browser creates without round count and keeps scores through two rounds');
}finally{
  await browser?.close();
  await app.close();
  await store.close();
  await rm(dir,{recursive:true,force:true});
}
