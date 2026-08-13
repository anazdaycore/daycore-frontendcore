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
// # 版本号语义：**兼容的最低 API 版本**（2026-08-12 作者拍板）
//
//     @daycore/core 的版本 = <最低兼容 major>.<最低兼容 minor>.<patch>
//
//   major   它说的那一版契约。不是范围，是唯一的那个 —— 见上面。
//   minor   它能对付的**最老**的后端 minor。
//   patch   这个包自己的迭代，不改变它对后端的要求。
//
// ⚠️ 「最低」而不是「构建时的那一版」，这两者差别是真的。取构建时的版本（第一版
// 就是这么干的，2.3）等于声称需要一个 2.3 后端，于是**把 2.2 后端挡在外面，而它
// 其实跑得动**。版本号是一句关于兼容性的**承诺**，不是一个时间戳。
//
// ⚠️ 2.2 这个数字是算出来的不是拍的：`make core-min-api` 对 endpoints.ts 里每条
// 路径找它第一次进本仓的 commit，读那时的版本，取最大。**它测得出的下界不会低于
// 仓库历史的起点** —— 本仓第一个 commit 时 Version 已经是 2.2.x，所以更老的后端
// 这个仓库无法作证，声称支持它们就是编的。
//
// ⚠️ 由此，patch 是这个包唯一的迭代计数器。两个都只要求 2.2 的 core 就是 2.2.0 与
// 2.2.1。要求上去了（用了新端点）才动 minor，而那时它**只涨不落**。
//
// 后端那边的 Go 闸门（internal/server/core_client_test.go）钉住 package.json 与
// 这里一致、且不高于后端当前实际服务的版本。
//
// ⚠️ 这仍然是一面镜子，权威在 internal/apipath 与 internal/version。这里之所以要
// 重复一份，是因为客户端得知道往哪儿发**第一个**请求，包括那个本来会告诉它答案的
// 请求。

/**
 * 这个包能对付的**最老**后端。改它就是改这个包对部署的要求。
 *
 * ⚠️ 用 `make core-min-api` 重算，不要手填。
 */
export const SPEAKS = { major: 2, minor: 2 } as const;

const API_PREFIX = `/api/v${SPEAKS.major}`;

/** The prefix this build sends to. Exported so boot() can compare it against
 *  what the backend reports rather than re-deriving the same string. */
export function apiPrefix(): string {
  return API_PREFIX;
}
const UNVERSIONED = ['/api/version', '/api/healthz'];

export function apiPath(path: string): string {
  const bare = path.split('?')[0]!;
  if (!path.startsWith('/api/') || UNVERSIONED.includes(bare)) return path;
  if (path.startsWith(API_PREFIX + '/')) return path;
  return API_PREFIX + path.slice('/api'.length);
}
