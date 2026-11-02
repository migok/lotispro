// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';

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
describe.each([['dark', dark], ['light', light]])('%s text contrast', (_theme, tokens) => {
  for (const surface of ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-surface', '--bg-sidebar']) {
    it.each(['--text-primary', '--text-secondary', '--text-muted', '--color-primary', '--text-gold'])(`%s on ${surface} meets WCAG AA`, (text) => {
      const values = [luminance(resolve(tokens, text)), luminance(resolve(tokens, surface))].sort((a, b) => b - a);
      expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
