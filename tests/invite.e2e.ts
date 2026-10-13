import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {createApp} from '../server/app.js';
import {SqliteStore} from '../server/store.js';
import {FixtureCards} from './fixtures.js';

const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-invite-'));
const store=new SqliteStore(path.join(dir,'test.sqlite'));
const app=await createApp({store,cards:new FixtureCards()});
await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:process.platform==='win32'?{channel:'msedge'}:{})});
try{
 const first=await browser.newContext(),second=await browser.newContext();
 const old=await first.newPage(),friend=await second.newPage();
 await old.goto(base);await old.getByLabel('你的昵称').fill('旧房间玩家');await old.getByRole('button',{name:'创建房间，邀请朋友'}).click();
 const oldCode=(await old.locator('.code-copy').innerText()).trim();
 await friend.goto(base);await friend.getByLabel('你的昵称').fill('新房间房主');await friend.getByRole('button',{name:'创建房间，邀请朋友'}).click();
 const newCode=(await friend.locator('.code-copy').innerText()).trim();
 await old.goto(base+'/?room=ZZZZZZ');
 await old.getByRole('heading',{name:'朋友邀请你加入 ZZZZZZ'}).waitFor();
 await old.getByRole('button',{name:'加入新房间'}).click();
 await old.getByText('找不到这个房间').waitFor();
 assert.equal(app.hub.roomFor((await old.evaluate(async()=>((await (await fetch('/api/session')).json()).session.playerId))) as string)?.code,oldCode);
 await old.goto(base+'/?room='+newCode);
 await old.getByRole('heading',{name:'朋友邀请你加入 '+newCode}).waitFor();
 await old.getByRole('button',{name:'留在原房间'}).click();
 await old.locator('.code-copy').getByText(oldCode).waitFor();
 await old.goto(base+'/?room='+newCode);
 await old.getByRole('button',{name:'加入新房间'}).click();
 await old.locator('.code-copy').getByText(newCode).waitFor();
 assert.equal((await store.loadRooms()).find(r=>r.code===oldCode)?.phase,'closed');
 assert.equal(new URL(old.url()).searchParams.has('room'),false);
 console.log('PASS invitation takes precedence over stale room, failed target preserves membership, switch succeeds');
}finally{await browser.close();await app.close();await store.close();}
