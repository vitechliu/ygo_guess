import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createApp } from '../server/app.js';
import { SqliteStore } from '../server/store.js';
import { PinkAuthError } from '../server/pink-auth.js';
import { FixtureCards } from './fixtures.js';

const store = new SqliteStore(':memory:');
let rejectToken = false;
const app = await createApp({ store, cards: new FixtureCards(), pinkVerifier: async token => {
  if (token === 'no-core') throw new PinkAuthError(403, '请先关联机器人账号，再使用粉红登录');
  if (rejectToken) throw new PinkAuthError(401, '粉红登录已失效，请重新关联');
  return { userId: 11, coreUserId: 123, name: '机器人昵称', verifiedAt: Date.now() };
} });
await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + (app.server.address() as {port:number}).port;
const browser = await chromium.launch({ headless:true, ...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH}:{}) });
try {
  await mkdir('test-results', {recursive:true});
  for (const mobile of [false,true]) {
    const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error=>errors.push(error.message));
    let issued = 'valid';
    const loginBodies: Record<string,string>[] = [];
    let afterLoginCalls = 0;
    let failAfterLogin = false;
    let releaseAfterLogin!: () => void;
    const afterLoginGate = new Promise<void>(resolve => { releaseAfterLogin = resolve; });
    let firstAfterLoginFinished = false;
    const waitForCalls = async (count: number) => {
      for (let i = 0; i < 200 && afterLoginCalls < count; i++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(afterLoginCalls, count);
    };
    await context.route('https://io2.vitechliu.com/api/cgv3/afterLogin', async route => {
      const request = route.request();
      assert.equal(request.method(), 'POST');
      assert.equal(request.headers().authorization, 'Bearer valid');
      assert.equal(await page.evaluate(() => localStorage.getItem('ygo_guess_pink_token')), 'valid');
      afterLoginCalls++;
      if (afterLoginCalls === 1) await afterLoginGate;
      // The local backend currently has no response body; support that as well as failures.
      await route.fulfill({ status: failAfterLogin ? 503 : 200, body: '' });
      firstAfterLoginFinished = true;
    });
    await context.route('https://io2.vitechliu.com/api/auth/**',async route=>{
      const request = route.request();
      if (request.url().endsWith('/logout')) {assert.equal(request.headers().authorization,'Bearer valid');await route.fulfill({json:{status:'success'}});return;}
      assert.equal(request.headers().authorization,undefined);
      loginBodies.push(request.postDataJSON());
      await route.fulfill({json:{status:'success',data:{user:{nickname:'错误网站昵称'},access_token:issued}}});
    });
    await page.goto(base+'/?room=ABCDEF');
    await page.getByRole('button',{name:'粉红登录',exact:true}).click();
    await page.getByLabel('关联码',{exact:true}).fill('abc123');
    await page.screenshot({path:`test-results/pink-login-${mobile?'mobile':'desktop'}.png`,fullPage:true,animations:'disabled'});
    const box=await page.getByRole('dialog').boundingBox();assert(box&&box.x>=0&&box.x+box.width<=(mobile?390:1440));
    await page.getByRole('button',{name:'关联账号',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.getByLabel('你的昵称',{exact:false}).inputValue(),'机器人昵称');
    assert.deepEqual(loginBodies[0],{code:'abc123',source:'ygo_guess'});
    assert.equal(await page.evaluate(()=>localStorage.getItem('ygo_guess_pink_token')),'valid');
    assert.equal(new URL(page.url()).searchParams.get('room'),'ABCDEF');
    await waitForCalls(1);
    assert.equal(firstAfterLoginFinished,false); // Login is complete while notification is still pending.
    await page.getByLabel('你的昵称',{exact:false}).fill('自由昵称');
    await page.getByRole('tab',{name:'创建房间',exact:true}).click();
    await page.getByRole('button',{name:'创建房间，邀请朋友',exact:false}).click();
    await page.getByRole('button',{name:'留在原房间',exact:true}).click();
    await page.locator('.room-page').waitFor({timeout:5000});
    assert.equal(firstAfterLoginFinished,false); // Reconnect verification is not held in the login queue.
    const notified = page.waitForResponse('https://io2.vitechliu.com/api/cgv3/afterLogin');
    releaseAfterLogin();
    await notified;
    await page.reload();
    await page.locator('.room-page').waitFor();
    assert((await page.locator('.identity').innerText()).includes('自由昵称'));
    assert.equal(afterLoginCalls,1); // Reconnect and restore must not call afterLogin.
    const leave=page.getByRole('button',{name:'离开房间',exact:false});
    await leave.click();
    await page.getByRole('alertdialog').getByRole('button',{name:'确认',exact:true}).click();
    await page.getByRole('button',{name:'已关联',exact:true}).waitFor();
    assert.equal(await page.getByLabel('你的昵称',{exact:false}).inputValue(),'自由昵称');
    await page.getByRole('button',{name:'已关联',exact:true}).click();
    await page.getByRole('button',{name:'解除关联',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>localStorage.getItem('ygo_guess_pink_token')),null);
    await page.getByRole('button',{name:'粉红登录',exact:true}).click();
    failAfterLogin=true;
    await page.getByRole('tab',{name:'账号密码',exact:true}).click();
    await page.getByLabel('用户名',{exact:true}).fill('account');
    await page.getByLabel('密码',{exact:true}).fill('password-for-test');
    await page.getByRole('button',{name:'关联账号',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.deepEqual(loginBodies[1],{username:'account',password:'password-for-test',source:'ygo_guess'});
    await waitForCalls(2);
    assert.equal(await page.evaluate(()=>localStorage.getItem('ygo_guess_pink_token')),'valid');
    assert.equal(await page.getByLabel('你的昵称',{exact:false}).inputValue(),'机器人昵称');
    rejectToken=true;
    await page.reload();
    await page.getByRole('button',{name:'粉红登录',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('ygo_guess_pink_token')),null);
    rejectToken=false;issued='no-core';
    await page.getByRole('button',{name:'粉红登录',exact:true}).click();
    await page.getByLabel('关联码',{exact:true}).fill('abcdef');
    await page.getByRole('button',{name:'关联账号',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'请先关联机器人账号'}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('ygo_guess_pink_token')),null);
    assert.equal(afterLoginCalls,2); // Invalid tokens and rejected associations must not notify.
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('Pink login desktop/mobile E2E passed');
}finally{await browser.close();await app.close();await store.close();}
