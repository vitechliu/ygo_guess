/** Edit this list to change the music card's pool. Only entries with a NetEase song ID can play. */
export const MUSIC_TRACKS = [
  // Song IDs supplied by the user; titles and external playback availability need live confirmation.
  { title: '游戏王经典曲', artist: '待核对', neteaseId: '4998139' },
  { title: '游戏王曲目 4981014', artist: '待核对', neteaseId: '4981014' },
  { title: '游戏王曲目 4941629', artist: '待核对', neteaseId: '4941629' },
  { title: '游戏王曲目 4992324', artist: '待核对', neteaseId: '4992324' },
  { title: '游戏王曲目 4998138', artist: '待核对', neteaseId: '4998138' },
  { title: '游戏王曲目 1331144098', artist: '待核对', neteaseId: '1331144098' },
  { title: '游戏王曲目 29482285', artist: '待核对', neteaseId: '29482285' },
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
