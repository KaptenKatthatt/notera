// Renders build/icon.png (256px) and build/icon.ico from an inline SVG using Electron itself.
// Run: npm run icon   (on Linux: xvfb-run -a npm run icon)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b8ce0"/><stop offset="1" stop-color="#004f9e"/></linearGradient></defs>
  <rect x="8" y="8" width="240" height="240" rx="52" fill="url(#g)"/>
  <path d="M72 44h80l40 40v128a12 12 0 0 1-12 12H72a12 12 0 0 1-12-12V56a12 12 0 0 1 12-12z" fill="#ffffff"/>
  <path d="M152 44v40h40z" fill="#cfe4f7"/>
  <text x="128" y="182" text-anchor="middle" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="120" fill="#004f9e">N</text>
</svg>`;

app.whenReady().then(async () => {
  console.log('ready');
  // transparent: true gör fönsterbakgrunden genomskinlig — annars komponerar
  // Chromium på en opak (vit) bakgrund och ikonens hörn blir vita.
  const win = new BrowserWindow({ width: 256, height: 256, show: true, frame: false, transparent: true, backgroundColor: '#00000000', useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(10);
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:#00000000">${svg}</body></html>`));
  console.log('loaded');
  // Wait for the page to settle, then take the last paint in a short window (first paints can be blank).
  await new Promise((r) => setTimeout(r, 800));
  // capturePage på transparen-fönstret bevarar alfakanalen (paint-events gör det inte).
  const img = await win.webContents.capturePage();
  console.log('painted', img.getSize());
  const out = path.join(__dirname, '..', 'build');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.png'), img.toPNG());
  const pngToIcoMod = require('png-to-ico'); const pngToIco = pngToIcoMod.default || pngToIcoMod;
  fs.writeFileSync(path.join(out, 'icon.ico'), await pngToIco(path.join(out, 'icon.png')));
  console.log('wrote build/icon.png + build/icon.ico');
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
