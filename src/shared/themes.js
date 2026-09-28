'use strict';
// Named themes layered on top of the light/dark base. "Those guys" copies Claude Code and "The
// Other guys" copies Codex; both live in a dark terminal, so each runs the window, native
// controls and CodeMirror in dark mode. The palettes themselves are in styles.css under
// html[data-skin="<id>"].
const THEMES = {
  'those-guys': { scheme: 'dark', background: '#262624', label: 'menu.themeThoseGuys' },
  'other-guys': { scheme: 'dark', background: '#111111', label: 'menu.themeOtherGuys' }
};

/** What Electron's nativeTheme.themeSource should be for a theme setting. */
function themeSource(theme) {
  if (isNamed(theme)) return THEMES[theme].scheme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

/** The named theme id to put on <html data-skin>, or '' for the plain light/dark base. */
function skinOf(theme) {
  return isNamed(theme) ? theme : '';
}

function isNamed(theme) {
  return typeof theme === 'string' && Object.hasOwn(THEMES, theme);
}

module.exports = { THEMES, themeSource, skinOf };
