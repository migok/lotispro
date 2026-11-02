// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { STATUS_COLORS, STATUS_HEX_COLORS } from '../constants';

const tokenFile = new URL('../../styles/tokens.css', import.meta.url);
const css = readFileSync(existsSync(tokenFile) ? tokenFile : new URL('../../styles.css', import.meta.url), 'utf8');
const declarations = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const dark = declarations(css.match(/:root\s*\{([^}]+)\}/s)[1]);
const light = { ...dark, ...declarations(css.match(/\[data-theme="light"\]\s*\{([^}]+)\}/s)[1]) };
const resolve = (tokens, key) => {
  const value = tokens[key];
  return value?.startsWith('var(') ? resolve(tokens, value.slice(4, -1)) : value;
};
const luminance = (hex) => {
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
// CIELAB (D65): protect against near-identical pastels, not just duplicate hex strings.
const lab = (hex) => {
  const [r, g, b] = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const f = (v) => v > 216 / 24389 ? Math.cbrt(v) : v * 841 / 108 + 4 / 29;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const statusPalette = (tokens) => Object.fromEntries(Object.entries(STATUS_COLORS)
  .map(([status, reference]) => [status, resolve(tokens, reference.slice(4, -1))]));
it.each([['map', STATUS_HEX_COLORS], ['dark', statusPalette(dark)], ['light', statusPalette(light)]])(
  'separates every status pair by at least 20 CIELAB units in %s', (_theme, palette) => {
    const entries = Object.entries(palette);
    entries.forEach(([status, hex], i) => entries.slice(i + 1).forEach(([other, otherHex]) => {
      const a = lab(hex);
      const b = lab(otherHex);
      const distance = Math.hypot(...a.map((v, axis) => v - b[axis]));
      expect(distance, `${status} / ${other}`).toBeGreaterThanOrEqual(20);
    }));
  },
);
it('keeps map outlines and legend dots visible on the pale basemap', () => {
  for (const [status, hex] of Object.entries(STATUS_HEX_COLORS)) {
    expect(1.05 / (luminance(hex) + 0.05), status).toBeGreaterThanOrEqual(3);
  }
});
it.each([['dark', dark], ['light', light]])('keeps all 12 status tokens distinct in %s', (_theme, tokens) => {
  const values = Object.values(STATUS_COLORS).map((reference) => resolve(tokens, reference.slice(4, -1)));
  expect(new Set(values).size).toBe(12);
});
describe.each([['dark', dark], ['light', light]])('%s text contrast', (_theme, tokens) => {
  for (const surface of ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-surface', '--bg-sidebar']) {
    it.each(['--text-primary', '--text-secondary', '--text-muted', '--color-primary', '--text-gold'])(`%s on ${surface} meets WCAG AA`, (text) => {
      const values = [luminance(resolve(tokens, text)), luminance(resolve(tokens, surface))].sort((a, b) => b - a);
      expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
