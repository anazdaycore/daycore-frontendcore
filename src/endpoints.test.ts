import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHash } from './build';
import {
  createWish,
  deleteWish,
  lockPlanBlock,
  markConflict,
  refishBlock,
  respondToDecision,
  streamCompanion,
  updateWish,
  wishes,
} from './endpoints';

// What the wire shapes pinned here cost when they drift: a frontend rendering
// against lockLevel (camelCase) draws every hard lock as unlocked, and an SSE
// frame that lands split across two chunks must not be dropped — a dropped
// tool_result is an undo handle that never existed.

type FetchCall = { url: string; method: string; body: unknown };

function stubJsonFetch(payload: unknown): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
      return { ok: true, text: async () => JSON.stringify(payload ?? {}) } as Response;
    }),
  );
  return calls;
}

function stubStreamFetch(events: string[]): void {
  // Each string is one network chunk — deliberately NOT one frame per chunk.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const enc = new TextEncoder();
      let i = 0;
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () =>
              i < events.length
                ? { done: false, value: enc.encode(events[i++]) }
                : { done: true, value: undefined },
          }),
        },
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('buildHash', () => {
  it('prefixes with the manifest familyId, not a hardcoded frontend name', () => {
    const h = buildHash(JSON.stringify({ familyId: 'liuli', theme: { tokens: [] } }));
    expect(h.startsWith('liuli-')).toBe(true);
    expect(buildHash(JSON.stringify({ familyId: 'zhiyu' })).startsWith('zhiyu-')).toBe(true);
    expect(buildHash(JSON.stringify({ familyId: 'zhiyu' })).startsWith('ting-')).toBe(false);
  });

  it('falls back to dc when the family is missing or unparseable', () => {
    expect(buildHash('not json').startsWith('dc-')).toBe(true);
    expect(buildHash('{}').startsWith('dc-')).toBe(true);
  });

  it('keeps the hash itself stable for a stable manifest', () => {
    const m = JSON.stringify({ familyId: 'ting', theme: { tokens: [{ name: '--a' }] } });
    expect(buildHash(m)).toBe(buildHash(m));
  });
});

describe('wishes endpoints', () => {
  it('CRUD maps to /api/wishes with the wire field names', async () => {
    const calls = stubJsonFetch({ wishes: [] });
    await wishes();
    await wishes('done');
    await createWish({ title: 't', note: 'n', effortMin: 30 });
    await updateWish('w1', { status: 'archived' });
    await deleteWish('w1');
    expect(calls[0]!.url.endsWith('/api/v2/wishes')).toBe(true);
    expect(calls[1]!.url.endsWith('/api/v2/wishes?status=done')).toBe(true);
    expect(calls[2]!).toMatchObject({ method: 'POST', body: { title: 't', note: 'n', effortMin: 30 } });
    expect(calls[3]!).toMatchObject({ method: 'PATCH', body: { status: 'archived' } });
    expect(calls[4]!.method).toBe('DELETE');
  });
});

describe('plan gate endpoints', () => {
  it('lockPlanBlock posts date/blockId/level and omits an empty reason', async () => {
    const calls = stubJsonFetch({});
    await lockPlanBlock('2026-08-13', 'b1', 'hard');
    await lockPlanBlock('2026-08-13', 'b1', 'none', '和教练约好了');
    expect(calls[0]!.url.endsWith('/api/v2/plan/lock')).toBe(true);
    expect(calls[0]!.body).toEqual({ date: '2026-08-13', blockId: 'b1', level: 'hard' });
    expect(calls[1]!.body).toEqual({ date: '2026-08-13', blockId: 'b1', level: 'none', reason: '和教练约好了' });
  });

  it('markConflict posts date/blockId to /api/plan/conflict', async () => {
    const calls = stubJsonFetch({});
    await markConflict('2026-08-13', 'b1');
    expect(calls[0]!.url.endsWith('/api/v2/plan/conflict')).toBe(true);
    expect(calls[0]!.body).toEqual({ date: '2026-08-13', blockId: 'b1' });
  });

  it('refishBlock is an add that names the original — and never sends a count', async () => {
    const calls = stubJsonFetch({});
    await refishBlock('2026-08-14', { title: '读书', type: 'task', time: '19:00', duration_min: 60, rescheduled_from: 'b1' });
    expect(calls[0]!.url.endsWith('/api/v2/plan')).toBe(true);
    const body = calls[0]!.body as { date: string; action: { action: string; block: Record<string, unknown> } };
    expect(body.action.action).toBe('add');
    expect(body.action.block.rescheduled_from).toBe('b1');
    // The server fills the chain; a client-sent count would be the cap
    // defeating itself (internal/server/plan_guard.go).
    expect('reschedule_count' in body.action.block).toBe(false);
  });

  it('respondToDecision carries the free-text answer only when given', async () => {
    const calls = stubJsonFetch({});
    await respondToDecision('d1', 'ok');
    await respondToDecision('d1', 'custom', '都不合适，周三再说');
    expect(calls[0]!.body).toEqual({ choice: 'ok' });
    expect(calls[1]!.body).toEqual({ choice: 'custom', text: '都不合适，周三再说' });
  });
});

describe('streamCompanion', () => {
  it('dispatches every SSE v2 frame and ignores heartbeats', async () => {
    stubStreamFetch([
      ': ping\n\ndata: {"type":"delta","text":"你"}\n\ndata: {"type":"delta","text":"好"}\n\n',
      'data: {"type":"tool_start","callId":"c1","tool":"plan_add","args":{}}\n\n',
      'data: {"type":"tool_result","callId":"c1","tool":"plan_add","ok":true,"opId":"op9"}\n\n: ping\n\n',
      'data: {"type":"decision_card","id":"d1","title":"选","summary":"","options":[{"id":"a","label":"A"}]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const got: string[] = [];
    await streamCompanion(
      { message: 'hi', timezone: 'Asia/Shanghai' },
      {
        onDelta: (t) => got.push('delta:' + t),
        onToolStart: (f) => got.push('start:' + f.tool),
        onToolResult: (f) => got.push('result:' + f.opId),
        onDecisionCard: (f) => got.push('card:' + f.id),
        onDone: () => got.push('done'),
      },
    );
    expect(got).toEqual(['delta:你', 'delta:好', 'start:plan_add', 'result:op9', 'card:d1', 'done']);
  });

  it('reassembles a frame split across network chunks', async () => {
    stubStreamFetch(['data: {"type":"de', 'lta","text":"拼"}', '\n\ndata: {"type":"done"}\n\n']);
    const got: string[] = [];
    await streamCompanion({ message: 'hi', timezone: 'UTC' }, { onDelta: (t) => got.push(t) });
    expect(got).toEqual(['拼']);
  });

  it('skips a malformed frame instead of throwing into the stream', async () => {
    stubStreamFetch(['data: {oops\n\ndata: {"type":"delta","text":"在"}\n\n']);
    const got: string[] = [];
    await streamCompanion({ message: 'hi', timezone: 'UTC' }, { onDelta: (t) => got.push(t) });
    expect(got).toEqual(['在']);
  });

  it('posts the request body with message and timezone', async () => {
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: init.method ?? 'GET', body: JSON.parse(String(init.body)) });
        return {
          ok: true,
          body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
        } as unknown as Response;
      }),
    );
    await streamCompanion({ message: '陪我', timezone: 'Asia/Shanghai', threadId: 't1' }, {});
    expect(calls[0]!.url.endsWith('/api/v2/ai/companion')).toBe(true);
    expect(calls[0]!.body).toEqual({ message: '陪我', timezone: 'Asia/Shanghai', threadId: 't1' });
  });
});