import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createApp } from '../server/app.js';
import { SqliteStore } from '../server/store.js';
import { FixtureCards, cards } from './fixtures.js';

const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-god-rage-'));
const store=new SqliteStore(path.join(dir,'room.sqlite'));
const app=await createApp({store,cards:new FixtureCards()});
await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});

async function choose(page:Page,cardName:string){
  await page.getByRole('combobox').fill(cardName);
  await page.getByRole('option',{name:cardName}).click();
  await page.getByRole('button',{name:'确认出题'}).click();
}

try {
  const host=await browser.newPage();
  const first=await browser.newPage();
  const second=await browser.newPage();
  await host.goto(base);
  await host.getByLabel('你的昵称').fill('游星');
  await host.getByRole('button',{name:'创建房间，邀请朋友'}).click();
  await host.locator('.code-copy').waitFor();
  const code=(await host.locator('.code-copy').innerText()).trim();
  for(const [page,name] of [[first,'海马'],[second,'十代']] as const){
    await page.goto(base+'/?room='+code);
    await page.getByLabel('你的昵称').fill(name);
    await page.getByRole('button',{name:'加入牌桌',exact:true}).click();
    await page.getByRole('button',{name:'我准备好了'}).click();
  }
  await host.getByRole('button',{name:'开始游戏',exact:true}).click();
  await choose(host,cards[0].name);
  await choose(first,cards[0].name);
  await choose(second,cards[1].name);

  const room=app.hub.rooms.get(code)!;
  assert.equal(room.phase,'guessing');
  assert.equal(room.turnPlayerId,room.hostId);
  const coveredId=room.entries[1].playerId;
  const visibleId=room.entries[2].playerId;
  assert.equal(room.entries[1].card?.cid,room.entries[2].card?.cid);
  room.entries[0].itemCards!.push({instanceId:randomUUID(),cardId:'god-rage-card'});
  app.hub.broadcast();

  const godRage=host.locator('article.item-card').filter({hasText:'神愤卡'});
  await godRage.locator('select').selectOption(coveredId);
  await godRage.getByRole('button',{name:'使用道具卡'}).click();
  const covered=host.locator('[data-testid="player-'+coveredId+'"]');
  const visible=host.locator('[data-testid="player-'+visibleId+'"]');
  await covered.locator('.card-name-cover').waitFor();
  assert(await covered.locator('.card-image-button').isDisabled());
  assert(await visible.locator('.card-image-button').isEnabled());
  await visible.locator('.card-image-button').click();
  await host.getByRole('dialog',{name:cards[0].name}).waitFor();
  await host.waitForTimeout(200);
  assert.equal(await host.getByRole('dialog',{name:cards[0].name}).count(),1);
  console.log('PASS god rage leaves another player with the same card viewable');
} finally {
  await browser.close();
  await app.close();
  await store.close();
}
