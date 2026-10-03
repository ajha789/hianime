import test from 'node:test';
import assert from 'node:assert/strict';
import { vttToAss } from './vtt-to-ass.js';

const header = `WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello <b>world</b>!`;

test('creates an ASS document with the fansub style profile', () => {
  const ass = vttToAss(header);
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /PlayResY: 1080/);
  assert.match(ass, /Style: Default,Trebuchet MS,72,/);
  assert.match(ass, /,1,4,1\.5,2,60,60,48,1$/m);
});

test('converts cue times and preserves bold, italic, and line breaks', () => {
  const ass = vttToAss(`WEBVTT\n\n00:00:01.000 --> 00:00:03.555\n<b>Bold</b> and <i>italic</i><br>next line`);
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:03\.56,Default,,0,0,0,,\{\\b1\}Bold/);
  assert.match(ass, /\\b1\}Bold\{\\b0\}/);
  assert.match(ass, /\\i1\}italic\{\\i0\}/);
  assert.match(ass, /\\Nnext line/);
});

test('supports cue identifiers and top/left alignment settings', () => {
  const ass = vttToAss(`WEBVTT\n\nintro\n00:00:00.000 --> 00:00:02.000 align:start line:10%\nTop left`);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:02\.00,Default,,0,0,0,,\{\\an7\}Top left/);
});

test('ignores notes and malformed cues and escapes literal ASS override braces', () => {
  const ass = vttToAss(`WEBVTT\n\nNOTE internal note\nnot a cue\n\n00:00:00.000 --> 00:00:01.000\nLiteral {text}`);
  assert.doesNotMatch(ass, /internal note/);
  assert.match(ass, /Literal \\{text\\}/);
});

test('decodes WebVTT entities and maps standard color classes', () => {
  const ass = vttToAss(`WEBVTT\n\n00:00.000 --> 00:01.000\n<c.yellow>Tom &amp; Jerry</c>`);
  assert.match(ass, /\\c&H00FFFF&\}Tom & Jerry\{\\c&HFFFFFF&/i);
});
