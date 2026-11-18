/* Folio desktop window (pure data): one tinted style only, no external tools */
module.exports = {
  appId: 'folio',
  name: 'Folio',
  scheme: 'folio',
  icon: 'assets/icon/icon.png',
  packageIcon: 'assets/icon/icon.icns',
  window: { width: 1280, height: 820, translucent: false, styles: {
    tinted: { background: { dark: 'rgb(30 32 30)', light: 'rgb(246 245 241)' } },
  } },
  tools: [],
};
