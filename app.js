/**
 * Download-Seite: liest die neueste Version aus den öffentlichen Releases und bietet den passenden Installer an.
 * Reine Funktionen sind exportiert und getestet (download-site/test); die Darstellung läuft nur im Browser.
 */

/** Ordnet die Release-Dateien den Systemen zu. Update-Dateien (.zip, .yml, .blockmap) erscheinen nicht. */
export function pickAssets(release) {
  const assets = release?.assets ?? [];
  const find = test => assets.find(a => test(a.name)) ?? null;
  return {
    mac: find(n => /-arm64\.dmg$/.test(n) && !/mit-KI/i.test(n)),
    macFull: find(n => /mit-KI.*\.dmg$/i.test(n)),
    win: find(n => /Setup.*\.exe$/i.test(n)),
    linux: find(n => /\.AppImage$/.test(n))
  };
}

/** Erkennt das Betriebssystem; iPad/iPhone/Android gelten als Mobilgerät (dort gibt es die Web-App). */
export function detectPlatform(nav) {
  const platform = String(nav?.userAgentData?.platform ?? nav?.platform ?? '').toLowerCase();
  const ua = String(nav?.userAgent ?? '').toLowerCase();
  if (/iphone|ipad|android|mobile/.test(ua)) return 'mobile';
  if (platform.includes('mac') || ua.includes('mac os')) return (nav?.maxTouchPoints ?? 0) > 1 ? 'mobile' : 'mac';
  if (platform.includes('win') || ua.includes('windows')) return 'win';
  if (platform.includes('linux') || ua.includes('linux') || ua.includes('x11')) return 'linux';
  return 'unknown';
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return bytes >= 1e9
    ? `${(bytes / 1e9).toLocaleString('de-CH', { maximumFractionDigits: 1 })} GB`
    : `${Math.round(bytes / 1e6).toLocaleString('de-CH')} MB`;
}

export const isUnsigned = release => /\[unsigniert\]/i.test(release?.body ?? '');

const LABELS = {
  mac: { name: 'macOS', detail: 'Mac mit Apple-Chip (M1 oder neuer), macOS 12 oder neuer' },
  win: { name: 'Windows', detail: 'Windows 10 oder 11, 64 Bit' },
  linux: { name: 'Linux', detail: 'AppImage, 64 Bit' }
};

const EXAMPLE = {
  tag_name: 'v0.4.0', published_at: '2026-10-22T12:00:00Z', html_url: '#', body: 'Beispieldaten [unsigniert]',
  assets: [
    { name: 'Steuerklar-0.4.0-arm64.dmg', size: 151e6, browser_download_url: '#' },
    { name: 'Steuerklar-0.4.0-arm64.zip', size: 146e6, browser_download_url: '#' },
    { name: 'Steuerklar-Setup-0.4.0.exe', size: 132e6, browser_download_url: '#' },
    { name: 'Steuerklar-0.4.0-x86_64.AppImage', size: 168e6, browser_download_url: '#' },
    { name: 'latest-mac.yml', size: 1e3, browser_download_url: '#' }
  ]
};

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function loadRelease(repo) {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && new URLSearchParams(location.search).has('beispiel')) return EXAMPLE;
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub antwortet mit ${response.status}`);
  return response.json();
}

function render(release, repo) {
  const assets = pickAssets(release);
  const platform = detectPlatform(navigator);
  const version = String(release.tag_name ?? '').replace(/^v/, '');
  const date = release.published_at ? new Date(release.published_at).toLocaleDateString('de-CH', { dateStyle: 'long', timeZone: 'Europe/Zurich' }) : '';
  document.getElementById('version').textContent = `Version ${version}${date ? ` · ${date}` : ''}`;

  const primary = document.getElementById('primary');
  const hint = document.getElementById('primary-hint');
  primary.replaceChildren();
  const main = assets[platform];
  if (main) {
    const link = el('a', { class: 'btn big', href: main.browser_download_url }, `Für ${LABELS[platform].name} herunterladen`);
    primary.append(link);
    hint.textContent = `${LABELS[platform].detail} · ${formatSize(main.size)}`;
  } else if (platform === 'mobile') {
    hint.textContent = 'Auf Smartphone und Tablet nutzt du Steuerklar im Browser. Die Desktop-App gibt es für Mac, Windows und Linux.';
  } else {
    hint.textContent = 'Wähle unten dein Betriebssystem.';
  }

  const list = document.getElementById('all');
  list.replaceChildren();
  for (const key of ['mac', 'win', 'linux']) {
    const asset = assets[key];
    const row = el('li', { class: 'row' });
    const text = el('div');
    text.append(el('strong', {}, LABELS[key].name), el('span', { class: 'muted' }, LABELS[key].detail));
    row.append(text);
    row.append(asset ? el('a', { class: 'btn secondary', href: asset.browser_download_url }, `Herunterladen · ${formatSize(asset.size)}`) : el('span', { class: 'muted' }, 'Noch nicht verfügbar'));
    list.append(row);
  }
  if (assets.macFull) {
    const row = el('li', { class: 'row' });
    const text = el('div');
    text.append(el('strong', {}, 'macOS – Vollinstaller mit KI'), el('span', { class: 'muted' }, 'Für Rechner ohne Internet: KI-Modell bereits enthalten'));
    row.append(text, el('a', { class: 'btn secondary', href: assets.macFull.browser_download_url }, `Herunterladen · ${formatSize(assets.macFull.size)}`));
    list.append(row);
  }
  document.getElementById('unsigned').hidden = !isUnsigned(release);
  document.getElementById('releases').href = release.html_url && release.html_url !== '#' ? release.html_url.replace(/\/tag\/.*/, '') : `https://github.com/${repo}/releases`;
}

if (typeof document !== 'undefined') {
  const repo = document.querySelector('meta[name="steuerklar-releases"]')?.content ?? '';
  const webApp = document.querySelector('meta[name="steuerklar-webapp"]')?.content ?? '';
  if (webApp && !webApp.startsWith('__')) {
    document.getElementById('webapp').href = webApp;
    document.getElementById('webapp-wrap').hidden = false;
  }
  loadRelease(repo).then(release => render(release, repo)).catch(() => {
    document.getElementById('primary-hint').textContent = 'Die Downloads konnten gerade nicht geladen werden.';
    document.getElementById('error').hidden = false;
    for (const id of ['releases', 'releases-fallback']) document.getElementById(id).href = `https://github.com/${repo}/releases`;
  });
}
