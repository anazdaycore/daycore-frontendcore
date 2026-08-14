// One function per call. The comments here are the ones that cost somebody an
// afternoon to learn — a wrapper whose only job is remembering that `choice: ""`
// means REJECT earns its existence.

import { del, get, patch, post, postStream, rememberSession } from './http';
import type {
  AIResult,
  Assignment,
  ChannelBinding,
  ChatMessage,
  ChatThread,
  CompanionFrame,
  Course,
  CustomTheme,
  DayPlan,
  DecisionCardFrame,
  Handshake,
  Material,
  MaterialCategory,
  MemoryFact,
  MoodCheckin,
  MoodKind,
  OperationLog,
  Proposal,
  Rhythm,
  ScheduleRule,
  Session,
  SessionPrefs,
  ToolResultFrame,
  ToolStartFrame,
  User,
  Wish,
} from './types';

export async function initSession(): Promise<Session> {
  // tokenInBody, because a separately-deployed frontend is cross-origin and
  // cannot rely on the cookie. See http.ts for the trade that carries.
  const s = await post<Session>('/api/session/init', { tokenInBody: true });
  if (s.sessionToken) rememberSession(s.sessionToken);
  return s;
}

export const handshake = (m: unknown) => post<Handshake>('/api/version', m);

/**
 * One day's plan. Null when the day is empty — a real answer, not an error.
 *
 * ⚠️ There is no /api/plan/today. An early draft of this client had one, copied
 * out of a grep that had picked the string up from a TEST FIXTURE
 * (internal/server/admin_gate_test.go). docs/API_SURFACE.md is generated from
 * the real route table and is the thing to check against.
 */
export const planForDate = (date: string) =>
  get<DayPlan | null>(`/api/plan?date=${encodeURIComponent(date)}`);

/** Today in the browser's own zone, as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * One incremental block edit.
 *
 * ⚠️ Can be REFUSED with 409 by the plan gate — the block is locked or has
 * petrified. That is why none of the four frontends updates its own state
 * optimistically on this call: a completion that silently bounced would leave
 * the screen showing a finished task the server still considers open. Each
 * paradigm pays for that differently — 汀 would be answering "what now" with a
 * lie, 长卷 would be drawing the block at coordinates it no longer has — and
 * none of them can afford it.
 */
export const patchPlan = (date: string, action: unknown) =>
  patch<DayPlan>('/api/plan', { date, action });

/**
 * Pin a block's time by hand, or let it go — one of the three ways out of a
 * 409 locked refusal (the others: take leave via patchPlan remove, or
 * markConflict). level "none" unlocks. Answers the full updated DayPlan.
 * 409 petrified means the block's lock is history too.
 */
export const lockPlanBlock = (date: string, blockId: string, level: 'none' | 'soft' | 'hard', reason?: string) =>
  post<DayPlan>('/api/plan/lock', { date, blockId, level, ...(reason ? { reason } : {}) });

/**
 * 标记冲突 — the third way out of a lock refusal: the class really is
 * colliding with something, so say so instead of moving or unlocking.
 */
export const markConflict = (date: string, blockId: string) =>
  post<DayPlan>('/api/plan/conflict', { date, blockId });

/**
 * 重新安排 (refish): an add whose block names the original in
 * rescheduled_from. The SERVER fills the chain root and count and refuses
 * with 409 refish_capped past the cap — never send reschedule_count from the
 * client; a counter the client controls is a cap that does not exist
 * (internal/server/plan_guard.go).
 */
export const refishBlock = (
  date: string,
  block: { id?: string; title: string; type: string; time?: string | null; duration_min?: number | null; rescheduled_from: string },
) => patchPlan(date, { action: 'add', block });

export const proposals = () => get<{ proposals: Proposal[] }>('/api/proposals');

/**
 * Answer a proposal.
 *
 * ⚠️ The field is `choice`, and the server reads ANY value other than "reject"
 * or "" as an acceptance (internal/server/proposals.go). So a client that sends
 * `{}` meaning "accept" gets a REJECTION — silently, with a 200. That asymmetry
 * is deliberate on the server's side (silence must never accept anything), and
 * this wrapper exists so no caller here has to remember it.
 *
 * ⚠️ SIMPLE cards only. A card with `rows` is answered by naming one of them —
 * see respondToProposalRow. Sending "accept" for a compound card flips its state
 * while matching no row, so the ops hanging off the rows never run: the reader
 * presses yes and nothing happens, silently, with a 200.
 */
export const respondToProposal = (id: string, accept: boolean) =>
  post<unknown>(`/api/proposals/${encodeURIComponent(id)}/respond`, {
    choice: accept ? 'accept' : 'reject',
  });

/**
 * Answer a compound card by taking one of its rows.
 *
 * ⚠️ A second function rather than an optional argument on the one above, which
 * is what the note there prescribed before there was anything to answer: the two
 * calls carry different meanings in the same field, and one signature that could
 * express both is one a caller can get wrong by omission.
 *
 * Every other row is rejected by the server — a compound card is a menu, not a
 * checklist.
 */
export const respondToProposalRow = (id: string, rowID: string) =>
  post<unknown>(`/api/proposals/${encodeURIComponent(id)}/respond`, { choice: rowID });

/** The field is `mood`, not `kind` — see internal/server/handlers_mood.go. */
export const recordMood = (mood: string, note = '') =>
  post<{ id: string }>('/api/mood', { mood, note });

export const ops = (limit = 5) => get<{ ops: OperationLog[] }>(`/api/ops?limit=${limit}`);

export const revertOp = (id: string) => post<unknown>(`/api/ops/${encodeURIComponent(id)}/revert`);

export const setTheme = (theme: string) => post<unknown>('/api/session/theme', { theme });

/** GET /api/version without introducing ourselves — used by the setting screen
 *  to check an address before committing to it. */
export const probe = () => get<{ version?: string; apiVersion?: number }>('/api/version');

// ── a whole range of days ───────────────────────────────────────────────────

/**
 * Every plan between two dates, inclusive.
 *
 * ⚠️ This returns FULL DayPlans, blocks and all — there is no summary endpoint,
 * so a month grid costs 31 days of blocks. That is a deliberate one-endpoint
 * trade rather than an omission, and it is written down here because the first
 * instinct on seeing a calendar is to go looking for `/api/plan/summary`, which
 * has never existed.
 *
 * ⚠️ Days with nothing stored are simply ABSENT from the array — they are not
 * returned as empty plans. A caller drawing a fixed grid has to fill the gaps
 * itself, and one that maps over the response instead will draw a week with
 * some of its columns missing.
 */
export const planRange = (from: string, to: string) =>
  get<DayPlan[]>(`/api/plan/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

// ── the AI planning endpoints ───────────────────────────────────────────────
//
// ⚠️ All three answer 200 with `{error, message}` when the model declines. See
// AIResult. `res.ok` is not the question; `result.error` is.

export const autoPlan = (body: {
  from: string;
  to: string;
  date?: string;
  timezone?: string;
  instructions?: string;
  mode?: 'keep_manual' | 'replace_all';
}) => post<AIResult>('/api/ai/auto-plan', body);

export const planFromText = (body: {
  description: string;
  date?: string;
  timezone?: string;
  targetDate?: string;
}) => post<AIResult>('/api/ai/plan-text', body);

// ── rules ───────────────────────────────────────────────────────────────────
//
// ⚠️ Rules are a real backend entity with real recurrence expansion; the plan
// endpoints already merge their occurrences in. A frontend that expands them
// itself gets every occurrence twice — see docs/specs/plan-semantics.md.

export const rules = () => get<{ rules: ScheduleRule[] }>('/api/rules');
export const createRule = (r: Partial<ScheduleRule>) => post<ScheduleRule>('/api/rules', r);
export const patchRule = (id: string, r: Partial<ScheduleRule>) =>
  patch<ScheduleRule>(`/api/rules/${encodeURIComponent(id)}`, r);
export const deleteRule = (id: string) => del<unknown>(`/api/rules/${encodeURIComponent(id)}`);

// ── materials, coursework ───────────────────────────────────────────────────

export const materials = (category = '') =>
  get<{ materials: Material[] }>(
    '/api/materials' + (category ? `?category=${encodeURIComponent(category)}` : ''),
  );
/** ⚠️ 501 when the deployment has no searcher configured — an honest "this
 *  install cannot", not a failure to handle. */
export const searchMaterials = (q: string, category = '') =>
  get<{ results: Material[] }>(
    `/api/materials/search?q=${encodeURIComponent(q)}` +
      (category ? `&category=${encodeURIComponent(category)}` : ''),
  );
/** Hand a piece of material to the library manually — the "资料收好" gravity
 *  well and the materials panel's add form both write through this. Category
 *  must be one of the registry's ids (empty means "note"; unknown → 400
 *  bad_category) — read materialCategories() rather than guessing. */
export const createMaterial = (m: { title: string; body?: string; summary?: string; category?: string; tags?: string[]; source?: string }) =>
  post<Material>('/api/materials', m);
export const deleteMaterial = (id: string) => del<unknown>(`/api/materials/${encodeURIComponent(id)}`);
/** The registry plus this session's on/off flags. ⚠️ Not a constant in the
 *  frontend: an operator's categories would be invisible. */
export const materialCategories = () =>
  get<{ categories: MaterialCategory[] }>('/api/materials/categories');

export const assignments = (q: { from?: string; to?: string; status?: string } = {}) => {
  const p = new URLSearchParams();
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.status) p.set('status', q.status);
  const s = p.toString();
  return get<{ assignments: Assignment[] }>('/api/assignments' + (s ? `?${s}` : ''));
};
export const patchAssignment = (id: string, changes: { status?: string }) =>
  patch<Assignment>(`/api/assignments/${encodeURIComponent(id)}`, changes);
export const courses = () => get<{ courses: Course[] }>('/api/courses');

// ── imports (数据源) ────────────────────────────────────────────────────────

/** The session's current import token ("" when none). The browser extension
 *  pushes Canvas exports with it (X-Import-Token) because it has no cookie. */
export const importToken = () => get<{ token: string }>('/api/import/token');
/** Generate (or rotate) the import token; rotating invalidates the old one. */
export const rotateImportToken = () => post<{ token: string }>('/api/import/token');
/** Import an .ics export. preview=true returns candidates WITHOUT saving.
 *  ⚠️ 409 timezone_mismatch when the file names a zone ≠ the session's and has
 *  floating times — re-send with tzConfirmed (and timezone if the user chose). */
export const importICS = (icsText: string, opts: { preview?: boolean; timezone?: string; tzConfirmed?: boolean } = {}) =>
  post<unknown>('/api/import/ics', { icsText, ...opts });
/** Ingest a Canvas export JSON — the extension's own format, or a file the user
 *  uploaded. A web frontend POSTs this with its session; the extension pushes
 *  the same body with X-Import-Token. */
export const importCanvas = (p: {
  version: string;
  baseURL?: string;
  courses: { canvasId: string; name: string; courseCode?: string; currentScore?: number | null; currentGrade?: string | null }[];
  assignments: { canvasId: string; courseCanvasId?: string; title: string; dueAt?: string | null; pointsPossible?: number | null; submitted?: boolean; graded?: boolean; score?: number | null; htmlUrl?: string }[];
}) => post<unknown>('/api/import/canvas', p);

// ── wishes (许愿池) ─────────────────────────────────────────────────────────

export const wishes = (status?: 'active' | 'done' | 'archived') =>
  get<{ wishes: Wish[] }>('/api/wishes' + (status ? `?status=${status}` : ''));
export const createWish = (w: { title: string; note?: string; effortMin?: number }) =>
  post<Wish>('/api/wishes', w);
export const updateWish = (
  id: string,
  changes: { title?: string; note?: string; effortMin?: number; status?: 'active' | 'done' | 'archived' },
) => patch<unknown>(`/api/wishes/${encodeURIComponent(id)}`, changes);
export const deleteWish = (id: string) => del<unknown>(`/api/wishes/${encodeURIComponent(id)}`);

// ── the companion ───────────────────────────────────────────────────────────

export const threads = () => get<{ threads: ChatThread[] }>('/api/chat/threads');
export const createThread = (title = '') => post<ChatThread>('/api/chat/threads', { title });
export const deleteThread = (id: string) => del<unknown>(`/api/chat/threads/${encodeURIComponent(id)}`);
/** ⚠️ Newest first. Reverse before rendering a transcript. */
export const threadMessages = (id: string, limit = 50) =>
  get<{ messages: ChatMessage[] }>(
    `/api/chat/threads/${encodeURIComponent(id)}/messages?limit=${limit}`,
  );

/**
 * Ask the companion, without holding the connection open.
 *
 * ⚠️ Answers **202** with a message id, then the reply is written into the
 * thread by a background turn. The caller polls `chatMessage(id)` until `status`
 * leaves "pending". A client that treats the 202 body as the answer renders an
 * empty bubble.
 *
 * Chosen over the streaming endpoint here because a five-page app's whole point
 * is that you can walk away from a page — and a turn that dies when its tab
 * loses focus is a turn the reader has to sit and watch.
 */
export const askCompanion = (threadId: string, message: string) =>
  post<{ messageId: string }>('/api/ai/companion/async', { threadId, message });

export const chatMessage = (id: string) => get<ChatMessage>(`/api/chat/messages/${encodeURIComponent(id)}`);

/** ⚠️ At most one decision card is pending per session, and a new message
 *  supersedes any outstanding one (internal/server/agent.go). The optional
 *  text is the reader's own words when none of the options fit. */
export const respondToDecision = (id: string, choice: string, text?: string) =>
  post<unknown>(`/api/decisions/${encodeURIComponent(id)}/respond`, {
    choice,
    ...(text ? { text } : {}),
  });

// ── the companion, streaming ────────────────────────────────────────────────

/** Callbacks for the frames a companion turn emits — api/FRONTEND_HANDOFF.md §B. */
export interface CompanionStreamHandlers {
  /** Append to the assistant bubble. */
  onDelta?: (text: string) => void;
  /** Optional thinking — render greyed/collapsed. */
  onReasoning?: (text: string) => void;
  /** A tool call started: show the working-on-it action card. */
  onToolStart?: (f: ToolStartFrame) => void;
  /** A tool call settled: update the card; f.opId is the undo handle. */
  onToolResult?: (f: ToolResultFrame) => void;
  /** A card the agent is BLOCKED on (≤45s): pop it, then respondToDecision. */
  onDecisionCard?: (f: DecisionCardFrame) => void;
  /** Stream-level error; a done frame still follows it. */
  onError?: (code: string, message: string) => void;
  /** The terminal frame arrived — the turn is over either way. */
  onDone?: () => void;
}

/**
 * Ask the companion and watch it work — the ONE SSE endpoint of the API.
 *
 * The agent loop runs server-side (≤6 rounds, 15 tools); this client only
 * READS frames. Plan/rule/memory changes arrive as tool_start/tool_result —
 * never as XML tags to parse, and never as something the frontend PATCHes
 * itself. Undo is tool_result.opId → revertOp.
 *
 * Resolves when the stream ends (a done frame or the server closing the
 * body — both terminate a turn); rejects with ApiError when the stream could
 * not be started at all, and with the AbortError when signal fires.
 */
export async function streamCompanion(
  body: {
    message: string;
    timezone: string;
    assistantName?: string;
    threadId?: string;
    attachmentIds?: string[];
    conversationHistory?: { role: 'user' | 'assistant'; content: string }[],
  },
  handlers: CompanionStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await postStream('/api/ai/companion', body, signal);
  if (!res.body) {
    handlers.onDone?.();
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let cut: number;
    // Frames are separated by a blank line ("data: {json}" + two newlines); a
    // comment line (": ping") is a heartbeat and carries no frame.
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const rawEvent = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      for (const line of rawEvent.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        let frame: CompanionFrame;
        try {
          frame = JSON.parse(json) as CompanionFrame;
        } catch {
          continue; // a malformed frame is skipped, never thrown into the stream
        }
        switch (frame.type) {
          case 'delta':
            handlers.onDelta?.(frame.text);
            break;
          case 'reasoning':
            handlers.onReasoning?.(frame.text);
            break;
          case 'tool_start':
            handlers.onToolStart?.(frame);
            break;
          case 'tool_result':
            handlers.onToolResult?.(frame);
            break;
          case 'decision_card':
            handlers.onDecisionCard?.(frame);
            break;
          case 'error':
            handlers.onError?.(frame.code ?? 'error', frame.message ?? '');
            break;
          case 'done':
            handlers.onDone?.();
            break;
        }
      }
    }
  }
}

// ── mood ────────────────────────────────────────────────────────────────────

/** The registry, localized. ⚠️ Submit `id`, never the emoji or the label —
 *  a check-in the backend cannot resolve is invisible to the companion. */
export const moodKinds = () => get<{ kinds: MoodKind[] }>('/api/mood/kinds');
/** ⚠️ A BARE ARRAY, not an envelope — unlike every other list here. */
export const moodHistory = (limit = 6) => get<MoodCheckin[]>(`/api/mood?limit=${limit}`);
/** ⚠️ The reply arrives under `response`, including on failure. */
export const askMoodReply = (mood: string, note = '') =>
  post<{ response: string; error?: string }>('/api/ai/mood', { mood, note });
/** ⚠️ Takes only the id, and means exactly one thing: that check-in's exercise
 *  is done. There is no field to un-mark it — the endpoint is a verb, not a
 *  patch, whatever the method says. */
export const markExerciseDone = (id: string) => patch<{ ok: boolean }>('/api/mood', { id });

// ── rhythm ──────────────────────────────────────────────────────────────────

/** GET /api/rhythm — the session's rhythm. source: default (cold start) |
 *  learned (median of observed days) | pinned (user-set by hand). */
export const rhythm = () => get<Rhythm>('/api/rhythm');

// ── settings ────────────────────────────────────────────────────────────────

export const preferences = () => get<SessionPrefs>('/api/session/preferences');
export const patchPreferences = (p: Partial<SessionPrefs>) =>
  patch<SessionPrefs>('/api/session/preferences', p);
export const patchSettings = (s: { assistantName?: string; personaPrompt?: string; language?: string }) =>
  patch<Session>('/api/session/settings', s);

export const memory = () => get<{ facts: MemoryFact[] }>('/api/memory');
/** ⚠️ `source` defaults to "chat" server-side, so a fact the reader typed has
 *  to say so explicitly — otherwise the ledger claims the companion learned it,
 *  and provenance is the whole reason the field exists. */
export const addMemory = (fact: string) => post<MemoryFact>('/api/memory', { fact, source: 'user' });
export const deleteMemory = (id: string) => del<unknown>(`/api/memory/${encodeURIComponent(id)}`);
/** ⚠️ One call, not a loop over deleteMemory. */
export const clearMemory = () => del<{ ok: boolean; cleared: number }>('/api/memory');

/** ⚠️ `familyId` is which token space these were judged against — it lets a
 *  build tell "no themes yet" from "I am asking as the wrong family". */
export const themes = () =>
  // ⚠️ builtin is a plain id list (domain.BuiltinThemes = []string{"sky",…}),
  // not objects — an {id,name} mirror here compiles against a shape the wire
  // never sends, and the dark/base question is answered by themeAttribute in
  // each frontend, not by this payload.
  get<{ themes: CustomTheme[]; builtin: string[]; familyId: string }>('/api/themes');
export const deleteTheme = (id: string) => del<unknown>(`/api/themes/${encodeURIComponent(id)}`);
/** ⚠️ Partial update — name / dark / variables. `base` is create-only (POST),
 *  so it is not accepted here; the backend ignores it on PATCH. */
export const patchTheme = (id: string, changes: { name?: string; dark?: boolean; variables?: Record<string, string> }) =>
  patch<CustomTheme>(`/api/themes/${encodeURIComponent(id)}`, changes);
/** ⚠️ Generates against THIS build's token space — the X-Frontend-Build header
 *  http.ts sets is what selects it.
 *
 *  The plain-string form starts from scratch; pass an object with `base`
 *  (builtin id) or `themeId` (existing custom theme) to seed the generation
 *  from those variables instead — the backend supports both. */
export function generateTheme(description: string): Promise<AIResult & { variables?: Record<string, string> }>;
export function generateTheme(body: { description: string; base?: string; themeId?: string }): Promise<AIResult & { variables?: Record<string, string> }>;
export function generateTheme(arg: string | { description: string; base?: string; themeId?: string }) {
  const body = typeof arg === 'string' ? { description: arg } : arg;
  return post<AIResult & { variables?: Record<string, string> }>('/api/ai/theme', body);
}
export const saveTheme = (t: { name: string; base?: string; dark?: boolean; variables: Record<string, string> }) =>
  post<CustomTheme>('/api/themes', t);

export const channels = () =>
  get<{ channels: { name: string; label: string; available: boolean }[]; bindings: ChannelBinding[] }>(
    '/api/channels',
  );
/** ⚠️ Only `bind` and the listing are the frontend's. `/verify` is the BOT's
 *  endpoint — calling it from here is sending yourself your own confirmation. */
export const bindChannel = (channel: string) =>
  post<{ token: string; channel: string; note: string }>(
    `/api/channels/${encodeURIComponent(channel)}/bind`,
  );
export const unbindChannel = (channel: string) =>
  del<unknown>(`/api/channels/${encodeURIComponent(channel)}/unbind`);

/** ⚠️ `user` is null for an anonymous session — a normal state, not an error. */
export const me = () => get<{ user: User | null }>('/api/me');
