const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function parseEpisodePath(pathname) {
  const match = /^\/(\d+)\/(\d+)\/?$/.exec(pathname);
  if (!match || !POSITIVE_INTEGER.test(match[1]) || !POSITIVE_INTEGER.test(match[2])) {
    return null;
  }
  return { malId: match[1], episodeNumber: match[2] };
}

export function createEpisodeStreamUrl(aid, episodeNumber) {
  const aidText = String(aid);
  const episodeText = String(episodeNumber);
  if (!POSITIVE_INTEGER.test(aidText) || !POSITIVE_INTEGER.test(episodeText)) {
    throw new TypeError('AID and episode number must be positive integers.');
  }
  return `https://cdn.animetvplus.xyz/${aidText}/hls/${episodeText}/index.txt`;
}
