// 这个包说哪一版契约。
//
// # ⚠️ 它只会说一种，这不是一个范围
//
// 下面的 API_PREFIX 是从 SPEAKS.major 拼出来的，而每个请求都走它。所以「core 支持
// 的最高 API 版本」和「最低」是同一个数 —— 它不是一个区间的两端，它是唯一的那一个。
// 一个前端拿着这个包去连 v1 后端，不是「降级运行」，是每一个请求同时 404。
//
// minor 不一样，它**是**一个下界：契约的 minor 是加法式的（新端点、新字段），所以
// 后端报的 minor 比这里高完全没问题，低才有问题 —— 这个包会去调那时候还不存在的
// 端点。所以 SPEAKS.minor 的意思是「后端至少要报到这个数」。
//
// # 版本号语义（2026-08-12 作者拍板）
//
//     @daycore/core 的版本 = <APIVersion>.<APIMinor>.<patch>
//
//   major   它说的那一版契约。不是范围，是唯一的那个。
//   minor   它用到的端点最早出现在哪个 minor —— 也就是对后端的下界要求。
//   patch   这个包自己的修复，不改变它说哪一版契约。
//
// 这样一来「前端钉的 core 与后端对不上」在握手当场就能报，而不是变成一屏 404。
// 后端那边的 Go 闸门（internal/server/core_client_test.go）钉住这三者一致。
//
// ⚠️ 这仍然是一面镜子，权威在 internal/apipath 与 internal/version。这里之所以要
// 重复一份，是因为客户端得知道往哪儿发**第一个**请求，包括那个本来会告诉它答案的
// 请求。

/** 这个包说的那一版契约。改它就是改这个包说什么。 */
export const SPEAKS = { major: 2, minor: 3 } as const;

const API_PREFIX = `/api/v${SPEAKS.major}`;
const UNVERSIONED = ['/api/version', '/api/healthz'];

export function apiPath(path: string): string {
  const bare = path.split('?')[0]!;
  if (!path.startsWith('/api/') || UNVERSIONED.includes(bare)) return path;
  if (path.startsWith(API_PREFIX + '/')) return path;
  return API_PREFIX + path.slice('/api'.length);
}
