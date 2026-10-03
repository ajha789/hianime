const ASS_STYLES = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Trebuchet MS,72,&H00FFFFFF,&H000000FF,&H00101010,&H00000000,1,0,0,0,100,100,0,0,1,4,1.5,2,60,60,48,1`;

const ASS_HEADER = `[Script Info]
Title: WebVTT converted for Hianime
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

${ASS_STYLES}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

const VTT_COLOR_CLASSES = {
  white: '#ffffff',
  lime: '#00ff00',
  cyan: '#00ffff',
  red: '#ff0000',
  yellow: '#ffff00',
  magenta: '#ff00ff',
  blue: '#0000ff',
  black: '#000000',
};

function decodeEntities(text) {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&lrm;/gi, '\u200e')
    .replace(/&rlm;/gi, '\u200f')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function escapeAssText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}');
}

function cssColorToAss(cssColor) {
  const match = cssColor.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return null;
  let rgb = match[1];
  if (rgb.length === 3) rgb = [...rgb].map((digit) => digit + digit).join('');
  const red = rgb.slice(0, 2);
  const green = rgb.slice(2, 4);
  const blue = rgb.slice(4, 6);
  return `&H${blue}${green}${red}&`;
}

function convertInlineMarkup(text) {
  const parts = text.replace(/<br\s*\/?>/gi, '\n').split(/(<[^>]*>)/g);
  return parts.map((part) => {
    if (!part.startsWith('<') || !part.endsWith('>')) {
      return escapeAssText(decodeEntities(part));
    }

    const tag = part.slice(1, -1).trim();
    if (/^b$/i.test(tag)) return '{\\b1}';
    if (/^\/b$/i.test(tag)) return '{\\b0}';
    if (/^u$/i.test(tag)) return '{\\u1}';
    if (/^\/u$/i.test(tag)) return '{\\u0}';

    const classTag = tag.match(/^c\.([\w-]+)$/i);
    if (classTag) {
      const color = VTT_COLOR_CLASSES[classTag[1].toLowerCase()];
      const assColor = color && cssColorToAss(color);
      return assColor ? `{\\c${assColor}}` : '';
    }
    if (/^\/c$/i.test(tag)) return '{\\c&HFFFFFF&}';

    const fontTag = tag.match(/^font\s+[^>]*color=["']?(#[\da-f]{3,6})["']?/i);
    if (fontTag) {
      const assColor = cssColorToAss(fontTag[1]);
      return assColor ? `{\\c${assColor}}` : '';
    }
    if (/^\/font$/i.test(tag)) return '{\\c&HFFFFFF&}';

    // Speaker, language, ruby, and unknown WebVTT tags do not affect the
    // visual style we can represent in ASS; retain their text, not markup.
    return '';
  }).join('').replace(/\n/g, '\\N');
}

function parseTimestamp(timestamp) {
  let match = timestamp.match(/^(\d+):([0-5]\d):([0-5]\d)[.,](\d{1,3})$/);
  let hours;
  let minutes;
  let seconds;
  let milliseconds;

  if (match) {
    [, hours, minutes, seconds, milliseconds] = match;
  } else {
    match = timestamp.match(/^([0-5]?\d):([0-5]\d)[.,](\d{1,3})$/);
    if (!match) return null;
    hours = '0';
    [, minutes, seconds, milliseconds] = match;
  }

  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds.padEnd(3, '0')) / 1000;
}

function formatAssTime(time) {
  let centiseconds = Math.round(time * 100);
  const hours = Math.floor(centiseconds / 360000);
  centiseconds %= 360000;
  const minutes = Math.floor(centiseconds / 6000);
  centiseconds %= 6000;
  const seconds = Math.floor(centiseconds / 100);
  const fraction = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function cueAlignment(settings) {
  const alignMatch = settings.match(/(?:^|\s)align:(start|left|center|middle|end|right)(?:\s|$)/i);
  const align = alignMatch?.[1]?.toLowerCase() ?? 'center';
  const horizontal = align === 'start' || align === 'left' ? 'left' :
    align === 'end' || align === 'right' ? 'right' : 'center';

  const lineMatch = settings.match(/(?:^|\s)line:([^\s]+)/i);
  const line = lineMatch?.[1];
  let vertical = 'bottom';
  if (line) {
    if (line.endsWith('%')) vertical = Number.parseFloat(line) < 50 ? 'top' : 'bottom';
    else if (Number.parseInt(line, 10) >= 0) vertical = 'top';
  }

  const row = vertical === 'top' ? { left: 7, center: 8, right: 9 } :
    { left: 1, center: 2, right: 3 };
  const alignment = row[horizontal];
  return alignment === 2 ? '' : `{\\an${alignment}}`;
}

function parseCueBlocks(input) {
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index >= lines.length) break;

    const firstLine = lines[index].trim();
    if (/^(WEBVTT|NOTE\b|STYLE\b|REGION\b)/i.test(firstLine)) {
      while (index < lines.length && lines[index].trim()) index += 1;
      continue;
    }

    let timingLine = firstLine;
    if (!timingLine.includes('-->') && lines[index + 1]?.includes('-->')) {
      index += 1; // Optional cue identifier precedes the timing line.
      timingLine = lines[index].trim();
    }

    const timing = timingLine.match(/^([^\s]+)\s+-->\s+([^\s]+)(?:\s+(.*))?$/);
    if (!timing) {
      index += 1;
      continue;
    }

    const start = parseTimestamp(timing[1]);
    const end = parseTimestamp(timing[2]);
    const settings = timing[3] ?? '';
    index += 1;
    const textLines = [];
    while (index < lines.length && lines[index].trim()) {
      textLines.push(lines[index]);
      index += 1;
    }

    if (start === null || end === null || end <= start || textLines.length === 0) continue;
    const text = convertInlineMarkup(textLines.join('\n'));
    cues.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${cueAlignment(settings)}${text}`);
  }

  return cues;
}

/** Convert WebVTT cue text into an ASS subtitle document for libass/JASSUB. */
export function vttToAss(vttText) {
  const input = typeof vttText === 'string' ? vttText : String(vttText ?? '');
  const cues = parseCueBlocks(input);
  return `${ASS_HEADER}\n${cues.join('\n')}${cues.length ? '\n' : ''}`;
}
