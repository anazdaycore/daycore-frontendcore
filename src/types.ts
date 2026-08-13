// The wire types. Every one of them is a shape api/openapi.yaml defines — this
// file is a hand-maintained mirror, so a field added there and not here is a
// field the frontends silently cannot see.

export interface TimeBlock {
  id: string;
  date?: string;
  time: string | null;
  title: string;
  type: 'task' | 'appointment' | 'break' | 'relax' | 'meal';
  duration_min: number | null;
  completed?: boolean;
  isAchievement?: boolean;
  origin?: 'auto' | 'manual' | 'rule';
  hidden?: boolean;
  /** ⚠️ Wire names are snake_case — lock_level, not lockLevel. The camelCase
   *  mirror that used to live here matched NOTHING the backend sends, so every
   *  hard-lock pin in every frontend was permanently dark. "" means "never
   *  derived yet"; none means derived and free to move. */
  lock_level?: '' | 'none' | 'soft' | 'hard';
  lock_reason?: string;
  lock_source?: '' | 'derived' | 'user' | 'agent';
  /** How the time reads: floating=wall clock (no utc_time); fixed/local carry
   *  an RFC3339 utc_time anchor. See api/FRONTEND_HANDOFF.md §C. */
  time_mode?: 'floating' | 'fixed' | 'local';
  timezone?: string;
  utc_time?: string | null;
  offset_min?: number | null;
  offset_ref?: string;
  rule_id?: string;
  /** Retry chain, filled by the SERVER on an add that names rescheduled_from —
   *  see internal/server/plan_guard.go. Past the cap the add is refused with
   *  409 refish_capped. */
  rescheduled_from?: string;
  reschedule_count?: number;
  note?: string;
}

export interface DayPlan {
  date: string;
  blocks: TimeBlock[];
  note?: string;
}

/** One line of a compound card, accepted or rejected on its own. */
export interface ProposalRow {
  id: string;
  label: string;
  state: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export interface Proposal {
  id: string;
  state: 'pending' | 'accepted' | 'rejected' | 'expired';
  level: 'L1' | 'L2' | 'L3';
  kind: 'timed' | 'card' | 'decision';
  title: string;
  summary?: string;
  reason?: string;
  evidence?: string;
  date?: string;
  start?: string;
  dur?: number | null;
  btype?: string;
  expiresAt?: string;
  /** What silence means when it expires: silence_accepts | silence_rejects.
   *  The TTL line on a card says which — ignoring a card is always safe, so
   *  the reader has to know which default their silence signs. */
  ttlPolicy?: 'silence_accepts' | 'silence_rejects';
  /**
   * The lines of a compound card.
   *
   * ⚠️ Absent for a simple card, and the two are answered DIFFERENTLY — see
   * respondToProposal / respondToProposalRow. Rendering a compound card with a
   * plain accept/reject pair sends a `choice` that matches no row, which the
   * server reads as an acceptance whose chosen row is none of them: the state
   * flips, the ops attached to the rows do not run, and nothing reports it.
   *
   * Every card the daemon producers emit has rows.
   */
  rows?: ProposalRow[];
}

export interface Session {
  id: string;
  assistantName: string;
  currentTheme: string;
  language?: string;
  sessionToken?: string;
}

// ── the shapes only the page-based frontend needs (so far) ─────────────────
//
// ⚠️ These arrived with 琉璃初版, the fourth caller, and they roughly TRIPLED
// this file. That is not a smell: the first three frontends each answer "what
// now" on one surface, so between them they needed the plan, proposals and the
// operation log — six shapes. A five-page app is the first one to have a place
// to put rules, materials, coursework, threads and settings, so it is the first
// to need their shapes.
//
// The line that did NOT move is the important one: still no UI here, and still
// nothing that derives what "now" means. Adding `Assignment` is mirroring a wire
// shape the backend already publishes; adding "which assignment is urgent" would
// be one frontend's product decision imposed on the other three.

/** A standing schedule commitment. Expanded into blocks BY THE BACKEND. */
export interface ScheduleRule {
  id: string;
  title: string;
  type: TimeBlock['type'];
  time: string | null;
  duration_min?: number | null;
  timezone?: string;
  time_mode?: 'fixed' | 'floating';
  /** "once" | "recurring" */
  kind: string;
  /** YYYY-MM-DD; required when kind === "once" */
  date?: string;
  /** "daily" | "weekly" | "monthly" | "every_n_days" */
  freq?: string;
  interval?: number;
  /** 0 = Sunday … 6 = Saturday */
  by_weekday?: number[];
  start_date?: string;
  until?: string | null;
  active: boolean;
  source?: string;
  note?: string | null;
}

export interface Material {
  id: string;
  category: string;
  title: string;
  summary: string;
  body: string;
  source: string;
  tags: string[];
  created_at: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  default: boolean;
}

export interface Assignment {
  id: string;
  courseId?: string;
  title: string;
  dueAt?: string;
  pointsPossible?: number;
  score?: number;
  submitted: boolean;
  graded: boolean;
  source: string;
  /** "pending" | "planned" | "done" | "dismissed" */
  status: string;
}

export interface Course {
  id: string;
  name: string;
  courseCode?: string;
  currentScore?: number;
  currentGrade?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  /** A JSON array of SSE v2 frames, as a STRING. Parse before use. */
  toolEvents?: string;
  /** "" ≡ done | pending | done | error */
  status?: string;
  createdAt: string;
}

/** ⚠️ No valence. internal/domain/mood_kind.go marks it `json:"-"` deliberately
 *  — see docs/DATA.md. A frontend that wants "is this a bad mood" is asking for
 *  a judgement the product refuses to render. */
export interface MoodKind {
  id: string;
  emoji: string;
  name: string;
}

export interface MoodCheckin {
  id: string;
  mood: string;
  aiResponse?: string;
  exerciseOffered?: string;
  exerciseCompleted: boolean;
  note?: string;
  createdAt: string;
}

export interface MemoryFact {
  id: string;
  fact: string;
  source: string;
  type?: string;
  createdAt: string;
}

export interface CustomTheme {
  id: string;
  familyId: string;
  name: string;
  base?: string;
  dark: boolean;
  variables: Record<string, string>;
}

export interface ChannelBinding {
  id: string;
  channel: string;
  externalId: string;
  verified?: boolean;
}

export interface SessionPrefs {
  morningBrief: boolean;
  eveningReview: boolean;
  deadlineAlerts: boolean;
  rollingReplan: boolean;
  gapSuggestions: boolean;
  doNotDisturb: boolean;
  autoPlan: boolean;
  materialCategories?: Record<string, boolean>;
  primaryLocale?: string;
  secondaryLocale?: string;
  timezone?: string;
  location?: string;
}

export interface User {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  isAnonymous: boolean;
  /** The super-administrator mark. ⚠️ NOT "can reach the console" — see
   *  internal/domain/user.go. Roles are not in this shape at all. */
  isOwner: boolean;
}

/**
 * What the AI planning endpoints answer.
 *
 * ⚠️ `error` arrives with **HTTP 200**. `no_material` in particular is the model
 * saying "there is nothing here to plan from", which is an answer rather than a
 * fault — see internal/server/handlers_autoplan.go. A client that only checks
 * `res.ok` renders a successful empty plan and the reader never learns why.
 */
export interface AIResult {
  error?: string;
  message?: string;
  note?: string;
  blocks?: TimeBlock[];
  [k: string]: unknown;
}

export interface OperationLog {
  id: string;
  action: string;
  summary?: string;
  /** schedule | habit | archive | care | system — the river colours its bands
   *  by this, and rapport is scored per domain. */
  domain?: string;
  actor?: 'user' | 'agent' | 'system';
  targetId?: string;
  date?: string;
  /** ok | failed */
  status?: string;
  createdAt: string;
  /* ⚠️ There is NO reverted flag on the wire — openapi's OperationLog never
   * had one. A guard reading op.reverted compiles against a phantom and
   * silently always passes; "was this undone" is answered by attempting the
   * revert and reading already_reverted, not by a field. */
}

/** What POST /api/version answers. Fields the backend may omit are optional. */
export interface Handshake {
  apiVersion?: number;
  apiMinor?: number;
  /** Where the backend mounts its versioned surface, e.g. "/api/v2".
   *  ⚠️ Optional: a backend older than this field simply does not send it, and
   *  its absence must never be read as "no prefix". */
  apiPrefix?: string;
  version?: string;
  assignedFamilyId: string;
  handshakeRecorded: boolean;
  rulesAccepted?: boolean;
  newTokens?: string[];
  /** Kinds this build proposed that are waiting on a human — see its manifest.ts. */
  pendingKinds?: string[];
  /** Tokens held back because their kind is still pending. */
  deferredTokens?: string[];
  pendingThemeBackfill?: number;
  note?: string;
  /** Every language this INSTALLATION can render — not a compile-time list.
   *  An operator dropping a file into LOCALES_DIR extends it. */
  locales?: { available: string[]; defaultPrimary: string; defaultSecondary?: string };
}

export interface Wish {
  id: string;
  title: string;
  note?: string;
  effortMin?: number;
  status: 'active' | 'done' | 'archived';
  createdAt?: string;
  updatedAt?: string;
}

// ── SSE v2 frames (POST /api/ai/companion) ───────────────────────────────────
// The protocol of api/FRONTEND_HANDOFF.md §B. Every frame is one "data: {json}"
// event; ": ping" heartbeats are comments and never reach these types.

export interface DeltaFrame {
  type: 'delta';
  text: string;
}
export interface ReasoningFrame {
  type: 'reasoning';
  text: string;
}
export interface ToolStartFrame {
  type: 'tool_start';
  callId: string;
  tool: string;
  args?: Record<string, unknown>;
}
export interface ToolResultFrame {
  type: 'tool_result';
  callId: string;
  tool: string;
  ok: boolean;
  summary?: string;
  data?: unknown;
  /** Store this for the undo affordance — POST /api/ops/{opId}/revert. */
  opId?: string;
  error?: string;
}
export interface DecisionCardFrame {
  type: 'decision_card';
  id: string;
  title: string;
  summary?: string;
  options: { id: string; label: string }[];
}
export interface ErrorFrame {
  type: 'error';
  code?: string;
  message?: string;
}
export interface DoneFrame {
  type: 'done';
}

export type CompanionFrame =
  | DeltaFrame
  | ReasoningFrame
  | ToolStartFrame
  | ToolResultFrame
  | DecisionCardFrame
  | ErrorFrame
  | DoneFrame;
