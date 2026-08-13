/**
 * This build's fingerprint.
 *
 * ⚠️ NOT a hash for security — a plain FNV-1a, and deliberately so. buildHash
 * identifies a build so the console can say "汀 has three builds connected"; the
 * backend states outright that the header carrying it is not a credential
 * (internal/server/themes.go). Reaching for SubtleCrypto here would buy nothing
 * and cost the case that matters most: it requires a secure context, so a
 * self-hosted deployment on plain http over a LAN — the normal case for this
 * project — would have no hash at all.
 *
 * It is derived rather than declared for the same reason the spec gives: a
 * declared build id can lie about being a different build. This one changes
 * exactly when the manifest or the version changes, which is when it should.
 */
export function buildHash(manifestJSON: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < manifestJSON.length; i++) {
    h ^= manifestJSON.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // The prefix is the family the manifest declares, so the console can tell
  // four frontends' builds apart at a glance — it used to be a hardcoded
  // 'ting-', which labelled every build of every frontend as 汀's. Cosmetic
  // only: the hash above is what actually distinguishes one build from another.
  let prefix = 'dc';
  try {
    const fam = (JSON.parse(manifestJSON) as { familyId?: unknown }).familyId;
    if (typeof fam === 'string') {
      const clean = fam.toLowerCase().replace(/[^a-z0-9-]+/g, '');
      if (clean) prefix = clean;
    }
  } catch {
    /* a manifest that does not parse still gets a hash, under 'dc' */
  }
  return prefix + '-' + h.toString(16).padStart(8, '0');
}
