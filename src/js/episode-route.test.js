import test from 'node:test';
import assert from 'node:assert/strict';
import { createEpisodeStreamUrl, parseEpisodePath } from './episode-route.js';

test('parses a MAL ID and episode number from the embed path', () => {
  assert.deepEqual(parseEpisodePath('/62001/12'), { malId: '62001', episodeNumber: '12' });
  assert.deepEqual(parseEpisodePath('/62001/12/'), { malId: '62001', episodeNumber: '12' });
});

test('rejects paths that are not exactly two positive integer segments', () => {
  for (const path of ['/', '/62001', '/62001/0', '/0/1', '/x/1', '/62001/1/extra', '/62001/01']) {
    assert.equal(parseEpisodePath(path), null, path);
  }
});

test('builds the expected index.txt HLS URL', () => {
  assert.equal(
    createEpisodeStreamUrl(195600, '1'),
    'https://cdn.animetvplus.xyz/195600/hls/1/index.txt',
  );
});

test('builds the episode URL for a second resolved AID', () => {
  assert.equal(
    createEpisodeStreamUrl(195518, '1'),
    'https://cdn.animetvplus.xyz/195518/hls/1/index.txt',
  );
});

test('rejects invalid AIDs and episode numbers when building a URL', () => {
  assert.throws(() => createEpisodeStreamUrl('1/2', '1'), TypeError);
  assert.throws(() => createEpisodeStreamUrl('100', '0'), TypeError);
});
