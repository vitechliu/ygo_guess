import type {PlayerReaction} from '../shared/types';

export const PLAYER_REACTION_EVENT='ygo-player-reaction';
export function playPlayerReaction(reaction:PlayerReaction):void {
  window.dispatchEvent(new CustomEvent(PLAYER_REACTION_EVENT,{detail:reaction}));
}
