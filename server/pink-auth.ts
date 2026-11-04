import { z } from 'zod';
import type { PinkIdentity } from '../shared/types.js';

export class PinkAuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type PinkVerifier = (token: string) => Promise<PinkIdentity>;
const profile = z.object({
  id: z.number().int().positive().safe(),
  core_user: z.object({ id: z.number().int().positive().safe(), name: z.string().max(255) }).nullable(),
});
export const verifyPinkToken: PinkVerifier = async token => {
  let response: Response;
  try {
    response = await fetch('https://io2.vitechliu.com/api/auth/me', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000), redirect: 'error',
    });
  } catch { throw new PinkAuthError(503, '粉红服务暂时无法连接，请稍后重试或使用游客'); }
  if (response.status === 401) throw new PinkAuthError(401, '粉红登录已失效，请重新关联');
  if (response.status === 403) throw new PinkAuthError(403, '该粉红账号暂时无法登录');
  if (!response.ok) throw new PinkAuthError(response.status === 429 ? 429 : 503, '粉红服务繁忙，请稍后重试');
  try {
    const body = await response.json();
    if (body.status !== 'success') throw new Error();
    const user = profile.parse(body.data);
    if (!user.core_user) throw new PinkAuthError(403, '请先关联机器人账号，再使用粉红登录');
    return { userId: user.id, coreUserId: user.core_user.id, name: user.core_user.name, verifiedAt: Date.now() };
  } catch (error) {
    if (error instanceof PinkAuthError) throw error;
    throw new PinkAuthError(503, '粉红账号资料暂时无法读取');
  }
};
export function pinkGameName(name: string): string {
  let result = '';
  for (const char of name.replace(/[\x00-\x1f\x7f]/g, '').trim()) {
    if (result.length + char.length > 16) break;
    result += char;
  }
  return result;
}
