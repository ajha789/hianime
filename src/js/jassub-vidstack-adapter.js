import JASSUB from 'jassub';

const EMPTY_ASS = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Trebuchet MS,72,&H00FFFFFF,&H000000FF,&H00101010,&H00000000,1,0,0,0,100,100,0,0,1,4,1.5,2,60,60,48,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

/**
 * Vidstack 1.x's LibASSTextRenderer expects its JASSUB instance to be an
 * EventTarget and to expose setTrackByUrl/freeTrack directly. JASSUB 2.x
 * exposes renderer methods through its worker proxy instead, so bridge the
 * two APIs. Fetching subtitle URLs here also lets Blob-backed VTT conversions
 * work reliably across the worker boundary.
 */
export default class JASSUBVidstackAdapter extends EventTarget {
  constructor(options) {
    super();
    this.instance = null;
    this.ready = this.#initialize(options).then(
      () => this.dispatchEvent(new Event('ready')),
      (error) => {
        const event = new Event('error');
        Object.defineProperty(event, 'error', { value: error });
        this.dispatchEvent(event);
      },
    );
  }

  async #readSubtitle(url) {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`Subtitle request failed (${response.status}): ${url}`);
    return response.text();
  }

  async #initialize(options) {
    const subContent = options.subUrl ? await this.#readSubtitle(options.subUrl) : (options.subContent || EMPTY_ASS);
    this.instance = new JASSUB({ ...options, subUrl: undefined, subContent });
    await this.instance.ready;
  }

  get _canvas() {
    return this.instance?._canvas;
  }

  async setTrackByUrl(url) {
    await this.ready;
    if (!this.instance) throw new Error('JASSUB failed to initialize');
    const content = await this.#readSubtitle(url);
    return this.instance.renderer.setTrack(content);
  }

  async freeTrack() {
    await this.ready;
    if (!this.instance) return;
    return this.instance.renderer.freeTrack();
  }

  destroy() {
    return this.instance?.destroy();
  }
}
