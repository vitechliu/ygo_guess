import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createApp } from '../server/app.js';
import { SqliteStore } from '../server/store.js';
import { FixtureCards } from './fixtures.js';

const store = new SqliteStore(':memory:');
const app = await createApp({ store, cards: new FixtureCards() });
await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + (app.server.address() as { port: number }).port;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
try {
  await mkdir('test-results', { recursive: true });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors: string[] = [];
    let connections = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', () => connections++);
    // Simulate an outdated cached bundle without adding a production test switch.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('use-current-version')) return;
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(url: string | URL, protocols?: string | string[]) {
          const changed = new URL(url);
          changed.searchParams.set('version', '3.4.0');
          super(changed, protocols);
        }
      };
    });
    const guest = await context.request.post(base + '/api/session', { data: { name: mobile ? '移动玩家' : '桌面玩家' } });
    assert.equal(guest.status(), 200);
    const html = await page.goto(base + '/?room=ABCDEF');
    assert.equal(html?.headers()['cache-control'], 'no-store');
    await page.getByRole('heading', { name: '请更新网页后进入房间' }).waitFor();
    assert.equal(app.hub.rooms.size, 0);
    assert.equal(await page.getByText('连接正在恢复', { exact: false }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `test-results/version-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    // Longer than the initial reconnect delay: incompatibility must not retry.
    await page.waitForTimeout(1000);
    assert.equal(connections, 1);
    await page.evaluate(() => sessionStorage.setItem('use-current-version', '1'));
    await page.getByRole('button', { name: '刷新到最新版本' }).click();
    await page.getByRole('heading', { name: '入座，开一局。' }).waitFor();
    const refreshed = new URL(page.url());
    assert.equal(refreshed.searchParams.get('room'), 'ABCDEF');
    assert(refreshed.searchParams.get('_refresh'));
    assert.equal(await page.getByLabel('房间码', { exact: true }).inputValue(), 'ABCDEF');
    await page.goto(base);
    await page.getByRole('heading', { name: '入座，开一局。' }).waitFor();
    await page.getByRole('button', { name: '创建房间，邀请朋友' }).click();
    await page.locator('.code-copy').waitFor();
    assert.equal(app.hub.rooms.size, 1);
    assert.deepEqual(errors, []);
    const room = [...app.hub.rooms.values()][0];
    await page.reload();
    await page.locator('.code-copy').waitFor();
    assert.equal((await page.locator('.code-copy').innerText()).trim(), room.code);
    app.hub.rooms.clear();
    await context.close();
  }
  console.log('PASS version desktop/mobile: blocking, no retries, cache headers, invitation-preserving refresh, create and reconnect');
} finally {
  await browser.close();
  await app.close();
  await store.close();
}
