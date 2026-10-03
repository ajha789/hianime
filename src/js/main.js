// Hianime Player bootstrap. WebVTT subtitle files are converted to ASS cue
// documents in-browser and rendered through the existing JASSUB/libass WASM.
import 'vidstack/player';
import 'vidstack/player/ui';
import { LibASSTextRenderer, TextTrack } from 'vidstack';
import jassubWorkerUrl from 'jassub/dist/worker/worker.js?worker&url';
import { vttToAss } from './vtt-to-ass.js';

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

  // Resolve static WASM assets from the app root (not relative to this JS
  // module, which Vite serves from /src/js or /assets).
  const jassubAssetUrl = (path) => new URL(`vendor/jassub/${path}`, document.baseURI).href;
  player.textRenderers.add(
    new LibASSTextRenderer(() => import('./jassub-vidstack-adapter.js'), {
      workerUrl: jassubWorkerUrl,
      wasmUrl: jassubAssetUrl('wasm/jassub-worker.wasm'),
      modernWasmUrl: jassubAssetUrl('wasm/jassub-worker-modern.wasm'),
    }),
  );

  const controlsIdleDelay = 800;
  let controlsIdleTimer;
  const resetControlsIdle = () => {
    clearTimeout(controlsIdleTimer);
    player.removeAttribute('data-hn-controls-idle');
    controlsIdleTimer = setTimeout(() => {
      player.setAttribute('data-hn-controls-idle', '');
    }, controlsIdleDelay);
  };
  for (const eventName of ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'focusin']) {
    player.addEventListener(eventName, resetControlsIdle, { passive: true });
  }
  resetControlsIdle();

  let subtitleTracks = [];
  let subtitleBlobUrls = new Set();
  let subtitleRequest = 0;

  const clearSubtitleTracks = () => {
    for (const track of subtitleTracks) player.textTracks.remove(track);
    subtitleTracks = [];

    // Let JASSUB finish releasing its active URL before revoking old blobs.
    for (const blobUrl of subtitleBlobUrls) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
    subtitleBlobUrls = new Set();
  };

  const addSubtitleTrack = async ({ src, label, language = '', isDefault = false }, request) => {
    const sourceUrl = new URL(src, document.baseURI).href;
    const sourcePath = new URL(sourceUrl).pathname.toLowerCase();
    const isAssFile = /\.(?:ass|ssa)$/.test(sourcePath);
    let trackSrc = sourceUrl;

    if (!isAssFile) {
      // Fetch WebVTT now, convert its cues into a Blob-backed ASS document,
      // then let Vidstack select LibASSTextRenderer for type="ass".
      const response = await fetch(sourceUrl, { credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`Subtitle request failed (${response.status}): ${sourceUrl}`);
      }
      const vttText = await response.text();
      if (request !== subtitleRequest) return null;

      trackSrc = URL.createObjectURL(new Blob([vttToAss(vttText)], { type: 'text/plain' }));
      subtitleBlobUrls.add(trackSrc);
    }

    if (request !== subtitleRequest) {
      if (!isAssFile) {
        URL.revokeObjectURL(trackSrc);
        subtitleBlobUrls.delete(trackSrc);
      }
      return null;
    }

    const track = new TextTrack({
      kind: 'subtitles',
      label,
      language,
      type: 'ass',
      src: trackSrc,
      default: isDefault,
    });
    player.textTracks.add(track);
    subtitleTracks.push(track);
    if (isDefault) track.mode = 'showing';
    return track;
  };

  const loadMetadataSubtitles = async (url) => {
    clearSubtitleTracks();
    const request = ++subtitleRequest;
    if (!isHlsUrl(url)) return;

    try {
      const metadataUrl = new URL('meta.json', url).href;
      const response = await fetch(metadataUrl, { credentials: 'omit' });
      if (!response.ok) {
        console.warn(`Subtitle metadata request failed (${response.status}): ${metadataUrl}`);
        return;
      }
      const metadata = await response.json();
      if (request !== subtitleRequest || !Array.isArray(metadata.subs)) return;

      for (const [index, subtitle] of metadata.subs.entries()) {
        if (!subtitle?.file) continue;
        try {
          await addSubtitleTrack({
            src: new URL(subtitle.file, metadataUrl).href,
            label: subtitle.label || `Subtitle ${index + 1}`,
            language: subtitle.label?.toLowerCase().includes('english') ? 'en' : '',
            isDefault: subtitle.default === true || index === 0,
          }, request);
        } catch (error) {
          console.warn(`Could not load subtitle ${subtitle.file}:`, error);
        }
        if (request !== subtitleRequest) return;
      }
    } catch (error) {
      // Subtitle metadata is optional; video playback should continue without it.
      console.warn('Could not load subtitle metadata:', error);
    }
  };

  // Start the sample VTT conversion on load. A user-submitted source will
  // invalidate this request and replace the demo subtitle with its own tracks.
  const demoRequest = ++subtitleRequest;
  addSubtitleTrack({
    src: './sample/sample.vtt',
    label: 'English (WebVTT → libass)',
    language: 'en',
    isDefault: true,
  }, demoRequest).catch((error) => console.warn('Could not load the sample VTT subtitle:', error));

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

  // Lets anyone load an arbitrary source URL into the player at runtime. If
  // the URL's extension doesn't give away its type, use the type dropdown.
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
