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

async function main() {
  await customElements.whenDefined('media-player');

  const player = document.querySelector('.hn-player');
  if (!player) return;

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
  // extension doesn't give away its type (e.g. an HLS manifest served as
  // `.txt`, or segments served with a disguised `.jpg` extension), the
  // type dropdown forces it explicitly. hls.js itself doesn't care what
  // extension the manifest or its segments have -- it just fetches
  // whatever URI each #EXTINF line names and treats the bytes as MPEG-TS
  // -- so no provider changes are needed for the segments themselves;
  // only the *manifest's* type needs to be known up front, since that's
  // what tells Vidstack which provider (hls.js vs native video/mp4/etc.)
  // to hand the src to.
  const KNOWN_EXTENSIONS = /\.(m3u8|mpd|mp4|webm|mov|m4v)(\?|#|$)/i;

  async function sniffManifestType(url) {
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-2048' } });
      if (!res.ok) return undefined;
      const text = await res.text();
      if (/^#EXTM3U/m.test(text)) return 'application/x-mpegurl';
      if (/<MPD[\s>]/.test(text)) return 'application/dash+xml';
    } catch {
      // Cross-origin manifest without permissive CORS, network error, etc.
      // Fall through and let the caller fall back to manual selection.
    }
    return undefined;
  }

  const sourceForm = document.querySelector('[data-hn-source-form]');
  const sourceInput = document.querySelector('[data-hn-source-input]');
  const sourceType = document.querySelector('[data-hn-source-type]');
  const sourceLoadButton = sourceForm?.querySelector('.hn-source-load');

  sourceForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = sourceInput?.value.trim();
    if (!url) return;

    let type = sourceType?.value || undefined;

    // Only bother sniffing when the user didn't force a type AND the URL's
    // extension is ambiguous (e.g. the manifest is served as `index.txt`).
    // A recognizable extension is trusted as-is to avoid an extra request.
    if (!type && !KNOWN_EXTENSIONS.test(url)) {
      if (sourceLoadButton) sourceLoadButton.disabled = true;
      type = await sniffManifestType(url);
      if (sourceLoadButton) sourceLoadButton.disabled = false;
    }

    player.src = type ? { src: url, type } : url;
  });
}

main();
