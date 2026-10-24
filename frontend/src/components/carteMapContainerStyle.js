// Inline style of the carte map container.
// In fullscreen the height is left to CSS (flex: 1 in .carte-fullscreen) so the map
// fills whatever space remains after the filters, selection bar and bulk-edit panel.
// Inline styles beat CSS classes, hence no fixed height / min-height there.
export function getCarteMapContainerStyle(isFullscreen) {
  return {
    padding: 0,
    overflow: 'hidden',
    height: isFullscreen ? undefined : 'calc(100vh - 300px)',
    minHeight: isFullscreen ? 0 : 500,
  };
}
