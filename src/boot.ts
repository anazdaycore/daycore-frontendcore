import * as api from './endpoints';
import { setBuildHeader } from './http';
import { markSetupDone } from './backend';
import { buildHash } from './build';
import { loadCatalog, preferredLocale, type Catalog, type Locale } from './i18n';
import { apiPrefix, SPEAKS } from './paths';
import type { Handshake, Session } from './types';

// Bringing a frontend up against a backend it has never met.
//
// Three steps, in this order, and the order is load-bearing:
//
//   1. handshake     introduce ourselves; learn which family we were assigned
//                    and which of our tokens this deployment can validate
//   2. build header  every later request carries it, so theme reads and writes
//                    are judged against OUR token space, not the fallback
//   3. session       the anonymous session everything else hangs off
//
// The handshake goes FIRST because it is the only step that works without a
// session — it has to, since a build making first contact holds no credential.
// Doing it after would mean a frontend that could not introduce itself until it
// had already started using the API it was introducing itself about.

export interface Boot {
  session: Session;
  handshake: Handshake;
  /**
   * The backend serves a NEWER contract than this build speaks.
   *
   * ⚠️ Not an error, and not silence either — the two obvious options, both
   * wrong. Following the backend's prefix would send every request through a
   * contract this build's types and endpoints have never been checked against;
   * refusing to start would break every older frontend the moment a backend
   * upgrades, which is the thing putting the version in the path exists to
   * prevent.
   *
   * So: keep using our own prefix (the backend still serves it) and hand the
   * fact to the app, which can say so somewhere calm. What must not happen is
   * the third option — carrying on as if nothing were different, and slowly
   * drifting out of step with nothing anywhere reporting it.
   */
  backendAhead: boolean;
  /** The reader's catalogue, built from what THIS deployment can render. */
  catalog: Catalog;
  /** Every locale the deployment offers — a setting screen lists them. */
  availableLocales: Locale[];
  /** Tokens this deployment will not accept yet, because their kind is pending. */
  deferred: string[];
  buildHash: string;
}

export interface BootProblem {
  kind: 'unreachable' | 'too-old' | 'error';
  message: string;
}

/**
 * What this package requires of a backend.
 *
 * ⚠️ Derived from SPEAKS, not written again. It used to be `MIN_API = 1` while
 * paths.ts hard-coded `/api/v2` — so against a v1 backend the check read
 * `1 < 1`, passed, and every single request 404'd. The comment below promises
 * that a mismatch is REPORTED rather than worked around; that promise was false
 * for the one case it existed to cover.
 */
export const MIN_API = SPEAKS.major;
export const MIN_API_MINOR = SPEAKS.minor;

/**
 * @param manifest  a function taking this build's hash and returning the body
 *                  POST /api/version wants. A FUNCTION rather than a value
 *                  because the hash is derived from the manifest itself, and
 *                  the caller is the only one that can close that loop.
 */
export async function boot(manifest: (hash: string) => unknown): Promise<Boot> {
  const hash = buildHash(JSON.stringify(manifest('')));
  setBuildHeader(hash);

  const hs = await api.handshake(manifest(hash));

  // ⚠️ A backend older than this build is REPORTED, not worked around. A
  // frontend could guess which calls still exist, and the guess would be wrong
  // in a way the user experiences as random breakage rather than as "these two
  // do not fit".
  //
  // ⚠️ Two checks, because the two numbers fail differently. A wrong MAJOR is
  // total — every path carries the prefix, so nothing works. A minor that is too
  // low is PARTIAL: most of the app works and the calls added since that minor
  // 404 one screen at a time, which is the harder failure to diagnose and the
  // one nothing used to catch.
  if (hs.apiVersion !== undefined && hs.apiVersion < MIN_API) {
    throw { kind: 'too-old', message: String(hs.apiVersion) } satisfies BootProblem;
  }
  if (
    hs.apiVersion === MIN_API &&
    hs.apiMinor !== undefined &&
    hs.apiMinor < MIN_API_MINOR
  ) {
    throw {
      kind: 'too-old',
      message: `${hs.apiVersion}.${hs.apiMinor}`,
    } satisfies BootProblem;
  }

  // ⚠️ The other direction, which used to be silent. A backend on a newer major
  // still serves ours (that is the promise of a versioned path), so this keeps
  // working — but "keeps working" and "is fine" are different claims, and the
  // difference is what nothing was reporting.
  //
  // ⚠️ It compares the backend's OWN prefix when it sends one, rather than
  // inferring from apiVersion. A deployment can mount the surface somewhere
  // this build would not have guessed, and the guess failing is exactly the
  // case worth catching.
  const backendAhead =
    (hs.apiVersion !== undefined && hs.apiVersion > MIN_API) ||
    (hs.apiPrefix !== undefined && hs.apiPrefix !== apiPrefix());

  const session = await api.initSession();
  markSetupDone();

  // ⚠️ The language list comes from the HANDSHAKE, which is why the catalogue
  // is built here and not at module load. A frontend that picked its language
  // before asking the deployment what it can render would be choosing from a
  // list it made up — rule ② of docs/specs/frontend-manifest.md, and the one
  // place it is easy to get wrong.
  const available = hs.locales?.available ?? ['zh-CN'];
  const fallback = hs.locales?.defaultPrimary ?? available[0] ?? 'zh-CN';
  const catalog = await loadCatalog(preferredLocale(available, fallback), available, fallback);
  if (typeof document !== 'undefined') document.documentElement.lang = catalog.locale;

  return {
    session,
    handshake: hs,
    catalog,
    availableLocales: available,
    deferred: hs.deferredTokens ?? [],
    backendAhead,
    buildHash: hash,
  };
}
