export interface Card { id: number; cid: number; name: string; types: string; description: string; image: string }
export type Phase = 'lobby' | 'setting' | 'guessing' | 'round-end' | 'match-end' | 'closed';
export interface Settings { mode: 'custom' | 'random'; rounds: number; attempts: number }
export interface Player { id: string; name: string; seat: number; score: number; ready: boolean; left: boolean }
export interface Entry { playerId: string; card?: Card; submitted: boolean; status: 'playing' | 'solved' | 'failed' | 'left'; attempts: number; turns: number; points: number }
export interface Chat { id: string; name: string; text: string; time: number; system?: boolean; kind?: 'guess-correct' | 'guess-wrong' }
export interface RoundResult { round: number; entries: Entry[] }
export interface RoomState { code: string; hostId: string; settings: Settings; phase: Phase; round: number; players: Player[]; entries: Entry[]; turnPlayerId: string | null; turnId: string; setupId: string; version: number; chat: Chat[]; history: RoundResult[]; processed: { key: string; at: number }[]; createdAt: number }
export interface PlayerView extends Player { online: boolean; waiting: boolean; status?: Entry['status']; attempts: number; turns: number; points: number; card?: Card; submitted: boolean }
export interface RoomView { code: string; hostId: string; settings: Settings; phase: Phase; round: number; players: PlayerView[]; turnPlayerId: string | null; turnId: string; setupId: string; version: number; chat: Chat[]; selfId: string; nextPlayerName?: string; mySubmittedCard?: Card; history: RoundResult[] }
export interface AdminRoom { code: string; phase: Phase; round: number; hostId: string; turnId: string; turnPlayerId: string | null; players: { id: string; name: string; online: boolean }[] }
export interface Session { playerId: string; name: string; admin: boolean; expiresAt: number }
export type Command =
  | { id: string; type: 'create'; settings: Settings }
  | { id: string; type: 'update-settings'; settings: Settings }
  | { id: string; type: 'join'; code: string }
  | { id: string; type: 'ready'; ready: boolean }
  | { id: string; type: 'start' | 'next' | 'leave' | 'again' | 'admin-list' | 'shuffle' }
  | { id: string; type: 'set-card'; cardId: number; setupId: string }
  | { id: string; type: 'guess'; cardId: number; turnId: string }
  | { id: string; type: 'give-up'; turnId: string }
  | { id: string; type: 'skip'; turnId: string }
  | { id: string; type: 'kick'; playerId: string }
  | { id: string; type: 'chat'; text: string }
  | { id: string; type: 'admin-skip'; code: string; turnId: string }
  | { id: string; type: 'admin-kick' | 'admin-transfer'; code: string; playerId: string }
  | { id: string; type: 'admin-close'; code: string };
export type ServerMessage = { type: 'snapshot'; room: RoomView | null } | { type: 'ack'; id: string } | { type: 'error'; id?: string; message: string } | { type: 'admin-rooms'; rooms: AdminRoom[] };
