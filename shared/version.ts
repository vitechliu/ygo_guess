import packageInfo from '../package.json' with { type: 'json' };

export const GAME_VERSION = packageInfo.version;
// Raise this only when older pages can no longer safely use the current game.
export const MIN_CLIENT_VERSION = '4.0.0';
export interface VersionPolicy { currentVersion: string; minClientVersion: string }
export const VERSION_POLICY: VersionPolicy = { currentVersion: GAME_VERSION, minClientVersion: MIN_CLIENT_VERSION };

function parts(version: unknown): number[] | null {
  if (typeof version !== 'string' || version.length > 40 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null;
  const values = version.split('.').map(Number);
  return values.every(Number.isSafeInteger) ? values : null;
}

export function isClientCompatible(version: unknown, policy: VersionPolicy = VERSION_POLICY): boolean {
  const client = parts(version), minimum = parts(policy.minClientVersion), current = parts(policy.currentVersion);
  if (!client || !minimum || !current || client[0] !== current[0]) return false;
  for (let i = 0; i < 3; i++) {
    if (client[i] !== minimum[i]) return client[i] > minimum[i];
  }
  return true;
}

export function updateRequiredMessage(policy: VersionPolicy = VERSION_POLICY): string {
  return `网页版本已过期或不兼容，当前服务版本 v${policy.currentVersion}，最低支持 v${policy.minClientVersion}。请刷新页面后重新进入房间；若仍提示，请清除此网站的缓存后重试。`;
}
