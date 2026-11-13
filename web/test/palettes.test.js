import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTES, DEFAULT_PALETTE, isPalette, contrastRatio } from '../src/lib/palettes.js';

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

// The tokens declared in the block of one palette, as { '--bg': '#0b0b0c', ... }.
function tokensOf(id) {
  const selector = id === DEFAULT_PALETTE ? ':root {' : `:root[data-palette='${id}'] {`;
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `global.css has no block for the "${id}" palette`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}

const REQUIRED = ['--bg', '--surface', '--surface-2', '--border', '--text', '--muted', '--gold', '--gold-soft', '--red', '--red-strong', '--footer-bg', '--on-gold', '--soft', '--danger', '--alert-text'];

test('there are several palettes and the default one is among them', () => {
  assert.ok(PALETTES.length >= 3);
  assert.ok(isPalette(DEFAULT_PALETTE));
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length, 'ids are unique');
  assert.equal(isPalette('inventada'), false);
  assert.equal(isPalette(undefined), false);
});

test('every palette declares every color token in global.css', () => {
  for (const { id } of PALETTES) {
    const tokens = tokensOf(id);
    for (const name of REQUIRED) assert.ok(tokens[name], `${id} is missing ${name}`);
  }
});

test('the swatches shown in the picker match the colors of each palette', () => {
  for (const { id, swatches } of PALETTES) {
    const tokens = tokensOf(id);
    assert.deepEqual(swatches, [tokens['--bg'], tokens['--gold'], tokens['--red']].map((c) => c.toLowerCase()), id);
  }
});

test('contrast ratio follows WCAG: black on white is 21 and a color on itself is 1', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#336699', '#336699'), 1);
});

test('text stays readable in every palette (WCAG AA, 4.5:1)', () => {
  const pairs = [
    ['--text', '--bg'], ['--text', '--surface'], ['--text', '--surface-2'],
    ['--muted', '--bg'], ['--muted', '--surface'], ['--muted', '--surface-2'],
    ['--gold', '--bg'], ['--gold', '--surface'], ['--gold', '--surface-2'],
    ['--gold-soft', '--surface'],
    ['--soft', '--bg'],
    ['--on-gold', '--gold'],
    ['--alert-text', '--surface'],
    ['#ffffff', '--red'], ['#ffffff', '--red-strong'], // text of the red buttons
    ['--text', '--footer-bg'], ['--muted', '--footer-bg'], ['--gold', '--footer-bg'],
  ];
  for (const { id } of PALETTES) {
    const tokens = tokensOf(id);
    for (const [fg, bg] of pairs) {
      const ratio = contrastRatio(tokens[fg] ?? fg, tokens[bg]);
      assert.ok(ratio >= 4.5, `${id}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, below 4.5:1`);
    }
  }
});
