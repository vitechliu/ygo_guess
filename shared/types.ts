export interface Card { id: number; cid: number; name: string; types: string; description: string; image: string }
export type Phase = 'lobby' | 'setting' | 'guessing' | 'round-end' | 'match-end' | 'closed';
export interface Settings { mode: 'custom' | 'random'; attempts: number; itemCards?: boolean }
export type ItemCardId = 'test-card' | 'prohibition-card' | 'maxx-c-card' | 'mask-change-card' | 'changeover-card' | 'chance-card' | 'lightning-card' | 'fireball-card' | 'outer-entity-card' | 'god-rage-card' | 'crossout-card' | 'scanner-card' | 'moon-book-card' | 'reborn-card' | 'void-card' | 'reversal-card' | 'puzzle-card' | 'combo-card' | 'hint-card' | 'stockings-card' | 'clown-card' | 'friendship-card' | 'unity-card' | 'countdown-card' | 'snatch-card' | 'flower-card' | 'mind-eye-card' | 'time-magic-card' | 'cyclone-card' | 'storm-card' | 'meteor-card' | 'ground-break-card' | 'eclipse-book-card' | 'convulsion-card' | 'music-card' | 'ecole-card';
export interface ItemCard { id: ItemCardId; name: string; category: 'spell' | 'trap' | 'monster' | 'xyz' | 'synchro'; reference: string; image: string; description: string; timing: 'own-turn'; weight: number }
export interface ItemCardInstance { instanceId: string; cardId: ItemCardId }
export interface MaskAppearance { id: number; name: string; image: string }
export interface TimedVisualEffect { id: string; endsAt: number }
export interface MaskVisualEffect extends TimedVisualEffect { appearances: Record<string,MaskAppearance> }
export interface TimedCardAppearance extends TimedVisualEffect { appearance: MaskAppearance }
export interface VisualEffects { roaches?: TimedVisualEffect; masks?: MaskVisualEffect; dragonmaidOutfits?: Record<string,TimedCardAppearance>; lightning?: TimedVisualEffect; fireballs?: Record<string,TimedVisualEffect>; distortion?: TimedVisualEffect; obscuredPlayerIds?: string[]; faceDown?: Record<string,TimedVisualEffect>; clownNames?: Record<string,TimedVisualEffect>; flowers?: TimedVisualEffect; cyclones?: Record<string,TimedVisualEffect>; storm?: TimedVisualEffect; meteors?: Record<string,TimedVisualEffect>; cracks?: Record<string,TimedVisualEffect> }
export interface FinalCountdown { remainingTurns: number; activatedTurnId: string }
export interface Player { id: string; name: string; seat: number; score: number; ready: boolean; left: boolean }
export interface Entry { playerId: string; card?: Card; submitted: boolean; status: 'playing' | 'solved' | 'failed' | 'left'; attempts: number; turns: number; points: number; itemCards?: ItemCardInstance[]; skipNextTurns?: number; failedByGuess?: boolean; reversalTurnId?: string }
export interface Chat { id: string; name: string; playerId?: string; recipientPlayerId?: string; text: string; time: number; system?: boolean; kind?: 'guess-correct' | 'guess-wrong' | 'item-card' }
export interface RoundResult { round: number; entries: Entry[] }
export interface RoomMusic { activationId: string; trackId: string }
export interface DrawingSession { id: string; userId: string; drawerId: string }
export type DrawingPoint = [number, number];
export interface DrawingStroke { points: DrawingPoint[] }
export interface RoomState { code: string; hostId: string; settings: Settings; phase: Phase; round: number; players: Player[]; entries: Entry[]; turnPlayerId: string | null; turnId: string; setupId: string; version: number; chat: Chat[]; history: RoundResult[]; processed: { key: string; at: number }[]; createdAt: number; lastActivityAt?: number; visualEffects?: VisualEffects; finalCountdown?: FinalCountdown; music?: RoomMusic; drawing?: DrawingSession }
export interface PlayerView extends Player { online: boolean; waiting: boolean; status?: Entry['status']; attempts: number; turns: number; points: number; card?: Card; submitted: boolean; failedByGuess?: boolean }
export interface RoomView { code: string; hostId: string; settings: Settings; phase: Phase; round: number; players: PlayerView[]; turnPlayerId: string | null; turnId: string; setupId: string; version: number; chat: Chat[]; selfId: string; nextPlayerName?: string; mySubmittedCard?: Card; myItemCards: ItemCardInstance[]; history: RoundResult[]; visualEffects?: VisualEffects; reversalActive?: boolean; finalCountdownRemainingTurns?: number; debugEnabled?: boolean; music?: RoomMusic; drawing?: DrawingSession; drawingStrokes?: DrawingStroke[] }
export interface AdminRoom { code: string; phase: Phase; round: number; hostId: string; turnId: string; turnPlayerId: string | null; players: { id: string; name: string; online: boolean }[] }
export interface Session { playerId: string; name: string; admin: boolean; expiresAt: number }
export type Command =
  | { id: string; type: 'create'; settings: Settings }
  | { id: string; type: 'update-settings'; settings: Settings }
  | { id: string; type: 'join'; code: string }
  | { id: string; type: 'ready'; ready: boolean }
  | { id: string; type: 'start' | 'next' | 'leave' | 'admin-list' | 'shuffle' }
  | { id: string; type: 'set-card'; cardId: number; setupId: string }
  | { id: string; type: 'guess'; cardId: number; turnId: string }
  | { id: string; type: 'use-item-card'; instanceId: string; turnId: string; targetPlayerId?: string }
  | { id: string; type: 'drawing-close'; drawingId: string }
  | { id: string; type: 'drawing-stroke'; drawingId: string; points: DrawingPoint[]; continuation: boolean }
  | { id: string; type: 'give-up'; turnId: string }
  | { id: string; type: 'skip'; turnId: string }
  | { id: string; type: 'kick'; playerId: string }
  | { id: string; type: 'chat'; text: string }
  | { id: string; type: 'debug'; action: 'start-solo' | 'expire-effects' | 'countdown-to-one' }
  | { id: string; type: 'debug'; action: 'grant-card'; playerId: string; cardId: ItemCardId; makeTurn?: boolean }
  | { id: string; type: 'debug'; action: 'set-turn' | 'fail-by-guess' | 'clear-hand'; playerId: string }
  | { id: string; type: 'debug'; action: 'set-attempts'; playerId: string; attempts: number }
  | { id: string; type: 'admin-skip'; code: string; turnId: string }
  | { id: string; type: 'admin-kick' | 'admin-transfer'; code: string; playerId: string }
  | { id: string; type: 'admin-close'; code: string };
export type ServerMessage = { type: 'snapshot'; room: RoomView | null } | { type: 'drawing-stroke'; drawingId: string; points: DrawingPoint[]; continuation: boolean } | { type: 'ack'; id: string } | { type: 'error'; id?: string; message: string } | { type: 'admin-rooms'; rooms: AdminRoom[] };
