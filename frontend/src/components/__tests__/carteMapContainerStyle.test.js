import { getCarteMapContainerStyle } from '../carteMapContainerStyle';

test('fullscreen: no fixed height, min-height 0 (CSS flex takes over)', () => {
  expect(getCarteMapContainerStyle(true)).toEqual({ padding: 0, overflow: 'hidden', height: undefined, minHeight: 0 });
});

test('normal mode: unchanged sizing', () => {
  expect(getCarteMapContainerStyle(false)).toEqual({ padding: 0, overflow: 'hidden', height: 'calc(100vh - 300px)', minHeight: 500 });
});
