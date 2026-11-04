import { toast } from 'sonner';
import type { User } from './game';

export const PINK_TOKEN_KEY = 'ygo_guess_pink_token';
const BASE = 'https://io2.vitechliu.com';
let memoryToken: string | null = null;
let storageBlocked = false;
export class PinkRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function readPinkToken(): string | null {
  try { return storageBlocked ? memoryToken : localStorage.getItem(PINK_TOKEN_KEY); }
  catch { return memoryToken; }
}
function saveToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(PINK_TOKEN_KEY, token);
    else localStorage.removeItem(PINK_TOKEN_KEY);
  } catch {
    if (!storageBlocked) toast.warning('无法保存登录状态，关闭页面后可能需要重新关联');
    storageBlocked = true;
  }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { throw new PinkRequestError(0, '暂时无法连接粉红登录，请重试或继续使用游客'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new PinkRequestError(response.status, body?.message || '粉红登录暂时不可用');
  return body as T;
}
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}
let running: Promise<User | null> | undefined;
export function restorePink(): Promise<User | null> {
  if (running) return running;
  running = serialized(async () => {
    const token = readPinkToken();
    if (!token) return null;
    try {
      const result = await request<{ session: User }>('/api/pink/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      return result.session;
    } catch (error) {
      if (error instanceof PinkRequestError && [401, 403].includes(error.status) && readPinkToken() === token) saveToken(null);
      throw error;
    }
  }).finally(() => { running = undefined; });
  return running;
}
function scheduleAfterLogin(token: string): void {
  const send = () => {
    // A deferred notification must not use an account that has since been unlinked.
    if (readPinkToken() !== token) return;
    void request(BASE + '/api/cgv3/afterLogin', {
      method: 'POST', credentials: 'omit', priority: 'low',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    }).catch(() => { toast.warning('粉红登录已成功，但登录后同步暂未完成'); });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(send, { timeout: 2000 });
  else setTimeout(send, 0);
}
export function loginPink(method: 'code' | 'password', fields: { code: string; username: string; password: string }): Promise<User> {
  return serialized(async () => {
    const result = await request<{ data: { access_token: string } }>(BASE + (method === 'code' ? '/api/auth/registerByCode' : '/api/auth/login'), {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...(method === 'code' ? { code: fields.code.trim() } : { username: fields.username.trim(), password: fields.password }), source: 'ygo_guess' }),
    });
    const token = result.data?.access_token;
    if (typeof token !== 'string' || !token || token.length > 6000 || /\s/.test(token)) throw new Error('粉红登录响应异常，请重试');
    const verified = await request<{ session: User }>('/api/pink/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    saveToken(token);
    scheduleAfterLogin(token);
    return verified.session;
  });
}
export function unlinkPink(): Promise<User | null> {
  return serialized(async () => {
    const token = readPinkToken();
    const result = await request<{ session: User | null }>('/api/pink/session', { method: 'DELETE' });
    saveToken(null);
    if (token) {
      try { await request(BASE + '/api/auth/logout', { method: 'POST', credentials: 'omit', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }); }
      catch { toast.warning('已在本机退出；粉红服务暂时无法完成远端注销'); }
    }
    return result.session;
  });
}
export async function syncPink(): Promise<User | null> {
  if (readPinkToken()) return restorePink();
  return serialized(async () => (await request<{ session: User | null }>('/api/pink/session', { method: 'DELETE' })).session);
}
