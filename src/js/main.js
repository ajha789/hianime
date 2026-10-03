// Hianime Player bootstrap.
//
// Registers all `media-*` custom elements used in index.html, then wires
// up pixel-accurate `.ass` fansub subtitle rendering via Vidstack's built-in
// `LibASSTextRenderer`, backed by our vendored copy of JASSUB (a WASM build
// of libass) at /vendor/jassub. Vidstack automatically prefers this
// renderer over its plain-text caption renderer for any track whose type
// or filename matches `.ass`/`.ssa` — so a fansub track renders with full
// positioning, styles, and effects, while ordinary WebVTT tracks still go
// through Vidstack's own (CSS-styled) caption renderer.
import 'vidstack/player';
import 'vidstack/player/ui';
import { LibASSTextRenderer } from 'vidstack';

const ASS_TRACK = {
  kind: 'subtitles',
  label: 'Fansub (ASS)',
  language: 'en',
  type: 'ssa',
  src: './sample/sample.ass',
};

const HLS_MIME = 'application/x-mpegurl';

function isHlsUrl(url) {
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  return path.endsWith('.m3u8') || path.endsWith('.txt');
}

// Some HLS origins expose playlists as `index.txt` instead of `.m3u8` and
// may use misleading extensions for MPEG-TS segments. Vidstack can play
// these playlists when the HLS MIME type is supplied explicitly.
function sourceForPlayer(url, type = '') {
  if (type) return { src: url, type };

  if (isHlsUrl(url)) {
    return { src: url, type: HLS_MIME };
  }

  return url;
}

async function main() {
  await customElements.whenDefined('media-player');

  const player = document.querySelector('.hn-player');
  if (!player) return;

  // Remove any stale poster property left by an older cached markup/build.
  player.removeAttribute('poster');
  player.poster = '';

  const jassubUrl = './vendor/jassub/jassub.js';

  player.textRenderers.add(
    new LibASSTextRenderer(() => import(/* @vite-ignore */ jassubUrl), {
      workerUrl: './vendor/jassub/wasm/jassub-worker.js',
      wasmUrl: './vendor/jassub/wasm/jassub-worker.wasm',
      modernWasmUrl: './vendor/jassub/wasm/jassub-worker-modern.wasm',
      defaultFont: './vendor/jassub/default.woff2',
    }),
  );

  // Demo track showing off the fansub renderer alongside the plain
  // WebVTT <track> already declared in the markup.
  player.textTracks.add(ASS_TRACK);

  let metadataTracks = [];
  let subtitleRequest = 0;
  const clearMetadataTracks = () => {
    for (const track of metadataTracks) player.textTracks.remove(track);
    metadataTracks = [];
  };
  const loadMetadataSubtitles = async (url) => {
    clearMetadataTracks();
    const request = ++subtitleRequest;
    if (!isHlsUrl(url)) return;

    try {
      const metadataUrl = new URL('meta.json', url).href;
      const response = await fetch(metadataUrl, { credentials: 'omit' });
      if (!response.ok) return;
      const metadata = await response.json();
      if (request !== subtitleRequest || !Array.isArray(metadata.subs)) return;

      for (const [index, subtitle] of metadata.subs.entries()) {
        if (!subtitle?.file) continue;
        const track = player.textTracks.add({
          kind: 'subtitles',
          label: subtitle.label || `Subtitle ${index + 1}`,
          language: subtitle.label?.toLowerCase().includes('english') ? 'en' : '',
          type: subtitle.file.toLowerCase().endsWith('.ass') ? 'ass' : 'vtt',
          src: new URL(subtitle.file, metadataUrl).href,
          default: subtitle.default === true || index === 0,
        });
        metadataTracks.push(track);
        if (subtitle.default === true || index === 0) track.mode = 'showing';
      }
    } catch {
      // Subtitle metadata is optional; video playback should continue without it.
    }
  };

  // Use the first second of the media as the idle preview instead of loading
  // a separate poster image. Reset this for every newly loaded source.
  let previewPending = true;
  player.addEventListener('load-start', () => {
    previewPending = true;
  });
  player.addEventListener('can-play', () => {
    if (!previewPending) return;
    previewPending = false;
    if (player.currentTime < 1) player.currentTime = 1;
    player.pause();
  });

  const speedLabel = player.querySelector('[data-hn-speed-label]');
  const updateSpeedLabel = () => {
    if (speedLabel) speedLabel.textContent = `${player.playbackRate}x`;
  };
  player.addEventListener('rate-change', updateSpeedLabel);
  updateSpeedLabel();

  // Autoplay-next-episode is a visual toggle only -- there's no multi-
  // episode queue in this demo, so it just persists its own on/off state.
  const autoplayToggle = player.querySelector('[data-hn-autoplay-toggle]');
  autoplayToggle?.addEventListener('click', () => {
    const next = autoplayToggle.getAttribute('aria-pressed') !== 'true';
    autoplayToggle.setAttribute('aria-pressed', String(next));
  });

  const volumeValue = player.querySelector('[data-hn-volume-value]');
  const updateVolumeValue = () => {
    if (volumeValue) {
      volumeValue.textContent = player.muted ? '0%' : `${Math.round(player.volume * 100)}%`;
    }
  };
  player.addEventListener('volume-change', updateVolumeValue);
  updateVolumeValue();

  // Lets anyone load an arbitrary source URL into the player at runtime
  // instead of only ever playing the bundled demo clip. If the URL's
  // extension doesn't give away its type (e.g. segments served with a
  // disguised extension), the type dropdown forces it explicitly rather
  // than guessing.
  const sourceForm = document.querySelector('[data-hn-source-form]');
  const sourceInput = document.querySelector('[data-hn-source-input]');
  const sourceType = document.querySelector('[data-hn-source-type]');
  sourceForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = sourceInput?.value.trim();
    if (!url) return;
    player.src = sourceForPlayer(url, sourceType?.value || '');
    loadMetadataSubtitles(url);
  });
}

export { isHlsUrl, sourceForPlayer };

main();
