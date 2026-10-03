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
}

main();
