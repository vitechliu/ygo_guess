/** Edit this list to change the music card's pool. Only entries with a NetEase song ID can play. */
export const MUSIC_TRACKS = [
  // Song ID supplied by the user; title and external playback availability need live confirmation.
  { title: '游戏王经典曲', artist: '待核对', neteaseId: '4998139' },
  { title: '熱き決闘者たち', artist: '光宗信吉', neteaseId: '' },
  { title: 'Shuffle', artist: '奥井雅美', neteaseId: '' },
  { title: 'OVERLAP', artist: 'Kimeru', neteaseId: '' },
  { title: '99%', artist: 'BOWL', neteaseId: '' },
] as const;

export const PLAYABLE_MUSIC_TRACKS = MUSIC_TRACKS.filter(track => /^\d+$/.test(track.neteaseId));

export function musicCandidates<T extends { neteaseId: string }>(tracks: readonly T[], previousId?: string): T[] {
  const alternatives = tracks.filter(track => track.neteaseId !== previousId);
  return alternatives.length ? alternatives : [...tracks];
}
