import type { RoomState } from '../shared/types.js';

export interface OpsEvent {
  level: 'info' | 'success' | 'warning';
  event: 'game.started' | 'game.ended';
  message: string;
  metadata: {
    eventId: string;
    occurredAt: number;
    gameId: string;
    roomCode: string;
    round: number;
    mode: string;
    initialDrawing: boolean;
    playerCount: number;
    playerNames: string[];
    reason?: string;
    results?: { playerName: string; status: string; points: number; turns: number }[];
  };
}

export interface OpsReporter {
  report(event: OpsEvent): void;
  close(): Promise<void>;
}

const active = (room?: RoomState): boolean =>
  Boolean(room && room.round > 0 && ['setting', 'drawing', 'guessing'].includes(room.phase));

// Compare committed states, rather than commands: leaving or switching rooms can also end a game.
export function gameEvents(before: RoomState | undefined, after: RoomState, reason: string): OpsEvent[] {
  const started = after.round > (before?.round ?? 0) && active(after);
  const ended = active(before) && !active(after);
  if (!started && !ended) return [];
  const event = started ? 'game.started' : 'game.ended';
  const gameId = `${after.code}:${after.createdAt}:${after.round}`;
  const playerName = (id: string) => after.players.find(p => p.id === id)?.name
    ?? before?.players.find(p => p.id === id)?.name ?? '';
  const participants = started ? after.entries : before!.entries;
  return [{
    level: started ? 'info' : after.phase === 'round-end' ? 'success' : 'warning',
    event,
    message: started ? '对局开始' : '对局结束',
    metadata: {
      eventId: `${gameId}:${event}`,
      occurredAt: Date.now(),
      gameId,
      roomCode: after.code,
      round: after.round,
      mode: after.settings.mode,
      initialDrawing: Boolean(after.settings.initialDrawing),
      playerCount: participants.length,
      playerNames: participants.map(e => playerName(e.playerId)),
      ...(ended ? { reason, results: after.entries.map(e => ({ playerName: playerName(e.playerId), status: e.status, points: e.points, turns: e.turns })) } : {}),
    },
  }];
}

// Best effort telemetry. Never hold the game's commit queue on network I/O.
export class HttpOpsReporter implements OpsReporter {
  private pending = new Set<Promise<void>>();
  private closed = false;

  constructor(private url: string, private source = 'ygo_guess', private timeoutMs = 2000) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('OPS_LOG_REPORT_URL must be an HTTP(S) URL without credentials');
    }
    if (!source.trim() || source.length > 80) throw new Error('OPS_LOG_SOURCE must contain 1–80 characters');
  }

  report(event: OpsEvent): void {
    if (this.closed || this.pending.size >= 20) {
      console.warn('Ops log dropped: reporter closed or at capacity');
      return;
    }
    const task = this.send(event);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  private async send(event: OpsEvent): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...event, source: this.source }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== 'object' || !('status' in body) || body.status !== 'success') {
        console.warn('Ops log rejected:', response.status);
      }
    } catch {
      // Do not print the URL, response body, or network exception (may contain credentials).
      console.warn('Ops log request failed');
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.pending);
  }
}

export function configuredOpsReporter(): OpsReporter | undefined {
  const url = process.env.OPS_LOG_REPORT_URL?.trim();
  return url ? new HttpOpsReporter(url, process.env.OPS_LOG_SOURCE ?? 'ygo_guess') : undefined;
}
