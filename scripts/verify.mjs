#!/usr/bin/env node
/**
 * Zero-dependency verification suite for Antigravity Tab Status (MV3).
 *
 * Checks:
 * 1. JavaScript syntax across all extension scripts via vm.Script
 * 2. Manifest V3 structure, strictly scoped permissions & content_scripts, script ordering
 * 3. All 10 _locales/<locale>/messages.json files and 132-char description limit
 * 4. 161-key 10-locale parity & placeholder parity in i18n.js + host guard behavior
 * 5. CSP compliance & postMessage origin-safety checks across JS/HTML
 * 6. PNG header/dimension/metadata-chunk/permission checks in icons/
 * 7. PII, local user path, email, and workspace-identifier leak checks
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LOCALES = ['en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt_BR', 'ru'];
const JS_FILES = [
  'background.js',
  'i18n.js',
  'page-bridge.js',
  'scanner.js',
  'content.js',
  'frame-detector.js',
  'popup.js'
];
const ALLOWED_HOSTS_RE =
  /^https:\/\/(\*\.)?(antigravity\.google(\.com)?|usercontent\.goog|gstatic\.com)\/\*$/i;
const EXPECTED_OPTIONAL_HOSTS = ['http://localhost/*', 'http://127.0.0.1/*'];
const EXPECTED_ICONS = {
  'icons/icon16.png': 16,
  'icons/icon32.png': 32,
  'icons/icon48.png': 48,
  'icons/icon128.png': 128
};
const ALLOWED_PNG_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);

const errors = [];
const checks = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function readRel(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

function existsRel(relPath) {
  return fs.existsSync(path.join(ROOT_DIR, relPath));
}

// 1. JS syntax & BOM/CRLF check across all scripts
for (const file of JS_FILES) {
  const fullPath = path.join(ROOT_DIR, file);
  const rawBuf = fs.readFileSync(fullPath);
  assert(
    !(rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf),
    `${file}: must not contain UTF-8 BOM`
  );
  const code = rawBuf.toString('utf8');
  assert(!code.includes('\r\n'), `${file}: must use LF line endings`);
  try {
    new vm.Script(code, { filename: file });
  } catch (err) {
    errors.push(`${file}: syntax error: ${err.message}`);
  }
}
checks.push(`JS syntax + LF/BOM checked (${JS_FILES.length} files)`);

// 2. Manifest V3 & permission scope verification
const manifest = JSON.parse(readRel('manifest.json'));
assert(manifest.manifest_version === 3, 'manifest.json: manifest_version must be 3');
assert(manifest.default_locale === 'en', 'manifest.json: default_locale must be "en"');
assert(
  Array.isArray(manifest.permissions) &&
    manifest.permissions.length === 3 &&
    manifest.permissions.includes('storage') &&
    manifest.permissions.includes('sidePanel') &&
    manifest.permissions.includes('scripting'),
  'manifest.json: permissions must strictly equal ["storage", "sidePanel", "scripting"]'
);
assert(
  Array.isArray(manifest.host_permissions) && manifest.host_permissions.length > 0,
  'manifest.json: host_permissions must be a non-empty array'
);
for (const hp of manifest.host_permissions || []) {
  assert(
    hp !== '<all_urls>' && ALLOWED_HOSTS_RE.test(hp),
    `manifest.json: unexpected host_permission "${hp}"`
  );
}
assert(
  Array.isArray(manifest.optional_host_permissions) &&
    manifest.optional_host_permissions.length === EXPECTED_OPTIONAL_HOSTS.length &&
    EXPECTED_OPTIONAL_HOSTS.every((h) => manifest.optional_host_permissions.includes(h)),
  'manifest.json: optional_host_permissions must strictly equal ["http://localhost/*", "http://127.0.0.1/*"]'
);
for (const ohp of manifest.optional_host_permissions || []) {
  assert(
    ohp !== '<all_urls>' && !/google\.com/i.test(ohp) && EXPECTED_OPTIONAL_HOSTS.includes(ohp),
    `manifest.json: unexpected optional_host_permission "${ohp}"`
  );
}
assert(
  typeof manifest.background?.service_worker === 'string' &&
    existsRel(manifest.background.service_worker),
  'manifest.json: background.service_worker file missing'
);
assert(
  typeof manifest.action?.default_popup === 'string' &&
    existsRel(manifest.action.default_popup),
  'manifest.json: action.default_popup file missing'
);
assert(
  manifest.side_panel?.default_path === 'sidepanel.html' &&
    existsRel(manifest.side_panel.default_path),
  'manifest.json: side_panel.default_path must point to existing sidepanel.html'
);
for (const cs of manifest.content_scripts || []) {
  assert(
    Array.isArray(cs.matches) && cs.matches.length > 0,
    'manifest.json: content_scripts entry missing matches'
  );
  const expectedContentMatchRe = cs.all_frames
    ? /^https:\/\/(\*\.)?(antigravity\.google(\.com)?|usercontent\.goog)\/\*$/i
    : /^https:\/\/(\*\.)?antigravity\.google(\.com)?\/\*$/i;
  for (const m of cs.matches || []) {
    assert(
      m !== '<all_urls>' && expectedContentMatchRe.test(m),
      `manifest.json: content_scripts match "${m}" exceeds allowed origin scope`
    );
  }
  for (const jsPath of cs.js || []) {
    assert(existsRel(jsPath), `manifest.json: missing content script ${jsPath}`);
  }
  if ((cs.world || 'ISOLATED') !== 'MAIN' && Array.isArray(cs.js)) {
    assert(
      cs.js[0] === 'i18n.js',
      `manifest.json: ISOLATED content script [${cs.js.join(', ')}] must load i18n.js first`
    );
  }
}
for (const iconPath of Object.values(manifest.icons || {})) {
  assert(existsRel(iconPath), `manifest.json: missing icon ${iconPath}`);
}
checks.push('Manifest V3, host scope & script ordering verified');

// 3. _locales/*/messages.json validation
for (const loc of LOCALES) {
  const rel = `_locales/${loc}/messages.json`;
  assert(existsRel(rel), `Missing locale file ${rel}`);
  if (!existsRel(rel)) continue;
  const msg = JSON.parse(readRel(rel));
  for (const key of ['extName', 'extDescription', 'actionTitle']) {
    const val = msg[key]?.message;
    assert(typeof val === 'string' && val.trim().length > 0, `${rel}: missing "${key}"`);
  }
  const desc = msg.extDescription?.message || '';
  assert(
    desc.length <= 132,
    `${rel}: extDescription length (${desc.length}) exceeds Chrome Web Store 132-char limit`
  );
}
checks.push(`_locales/*/messages.json validated (${LOCALES.length} locales)`);

// 4. i18n.js 161-key parity, placeholder consistency, and origin guard tests
const referencedKeys = new Set();
const panelHtmlEntries = [
  { file: 'popup.html', expectedSurface: 'popup', content: readRel('popup.html') },
  { file: 'sidepanel.html', expectedSurface: 'sidepanel', content: readRel('sidepanel.html') }
];
for (const { content } of panelHtmlEntries) {
  for (const m of content.matchAll(/data-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"/g)) {
    referencedKeys.add(m[1]);
  }
}
for (const file of ['popup.js', 'content.js', 'scanner.js']) {
  const code = readRel(file);
  for (const m of code.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
    referencedKeys.add(m[1]);
  }
}
const bridgeCode = readRel('page-bridge.js');
for (const m of bridgeCode.matchAll(/reasonCode:\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
  referencedKeys.add(m[1]);
}
assert(
  referencedKeys.size === 161,
  `Expected 161 referenced i18n keys, found ${referencedKeys.size}`
);

const i18nSrc = readRel('i18n.js');

function extractPlaceholders(str) {
  return [...String(str).matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
}

function loadI18nWithEnv({ loc = 'en', location = undefined } = {}) {
  const bcp47 = loc.replace('_', '-');
  const win = {};
  if (location !== undefined) {
    win.location = location;
  }
  const sandbox = {
    window: win,
    navigator: { language: bcp47, languages: [bcp47] },
    chrome: { i18n: { getUILanguage: () => bcp47 } },
    document: { documentElement: { lang: '' }, querySelectorAll: () => [] }
  };
  vm.runInNewContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  return sandbox.window.__AGY_I18N__;
}

const enPlaceholders = new Map();
for (const loc of LOCALES) {
  const i18n = loadI18nWithEnv({ loc });
  assert(Boolean(i18n), `i18n.js failed to initialize in sandbox for ${loc}`);
  if (!i18n) continue;
  assert(i18n.getLocale() === loc, `i18n.js locale resolution mismatch for ${loc}: got ${i18n.getLocale()}`);
  const dictKeys = i18n._MESSAGES?.[loc] ? Object.keys(i18n._MESSAGES[loc]) : [];
  assert(
    dictKeys.length === referencedKeys.size,
    `i18n.js locale "${loc}" key count (${dictKeys.length}) !== referenced (${referencedKeys.size})`
  );
  for (const k of referencedKeys) {
    const val = i18n._MESSAGES?.[loc]?.[k];
    assert(typeof val === 'string' && val.trim().length > 0, `i18n.js missing "${k}" in ${loc}`);
    const ph = extractPlaceholders(val || '');
    if (loc === 'en') {
      enPlaceholders.set(k, ph);
    } else if (enPlaceholders.get(k) !== ph) {
      errors.push(
        `i18n.js placeholder mismatch for "${k}" in ${loc}: expected [${enPlaceholders.get(k)}], got [${ph}]`
      );
    }
  }
}

// Host/origin guard matrix for i18n.js
assert(
  Boolean(
    loadI18nWithEnv({
      location: { protocol: 'chrome-extension:', hostname: 'ext-id', ancestorOrigins: [] }
    })
  ),
  'i18n.js guard blocked chrome-extension: popup page'
);
assert(
  Boolean(
    loadI18nWithEnv({
      location: { protocol: 'https:', hostname: 'antigravity.google.com', ancestorOrigins: [] }
    })
  ),
  'i18n.js guard blocked antigravity.google.com'
);
assert(
  Boolean(
    loadI18nWithEnv({
      location: {
        protocol: 'about:',
        hostname: '',
        ancestorOrigins: ['https://antigravity.google.com']
      }
    })
  ),
  'i18n.js guard blocked antigravity about:blank child frame'
);
assert(
  !loadI18nWithEnv({
    location: { protocol: 'https:', hostname: 'example.com', ancestorOrigins: [] }
  }),
  'i18n.js guard failed to exit on non-Antigravity origin'
);
assert(
  Boolean(
    loadI18nWithEnv({
      location: {
        protocol: 'https:',
        hostname: 'antigravity.static.usercontent.goog',
        ancestorOrigins: ['https://antigravity.google.com']
      }
    })
  ),
  'i18n.js guard failed to allow usercontent.goog iframe under Antigravity ancestor'
);
assert(
  loadI18nWithEnv({
    location: {
      protocol: 'https:',
      hostname: 'antigravity.static.usercontent.goog',
      ancestorOrigins: []
    }
  }) === undefined,
  'i18n.js guard failed to exit on top-level usercontent.goog origin without Antigravity ancestor'
);
assert(
  loadI18nWithEnv({
    location: {
      protocol: 'https:',
      hostname: 'antigravity.static.usercontent.goog',
      ancestorOrigins: ['https://example.com']
    }
  }) === undefined,
  'i18n.js guard failed to exit on usercontent.goog iframe with non-Antigravity ancestor'
);
assert(
  Boolean(
    loadI18nWithEnv({
      location: { protocol: 'http:', hostname: 'localhost', ancestorOrigins: [] }
    })
  ),
  'i18n.js guard blocked http://localhost'
);
assert(
  Boolean(
    loadI18nWithEnv({
      location: { protocol: 'http:', hostname: '127.0.0.1', ancestorOrigins: [] }
    })
  ),
  'i18n.js guard blocked http://127.0.0.1'
);
assert(
  Boolean(
    loadI18nWithEnv({
      location: {
        protocol: 'about:',
        hostname: '',
        ancestorOrigins: ['http://localhost:3000']
      }
    })
  ),
  'i18n.js guard blocked localhost about:blank child frame'
);
assert(
  Boolean(
    loadI18nWithEnv({
      location: {
        protocol: 'about:',
        hostname: '',
        ancestorOrigins: ['http://127.0.0.1:8080']
      }
    })
  ),
  'i18n.js guard blocked 127.0.0.1 about:blank child frame'
);
checks.push(`i18n 161-key parity, placeholder parity & host guard verified (${LOCALES.length} locales)`);

// 5. CSP, MV3 & cross-frame safety checks
for (const { file, expectedSurface, content } of panelHtmlEntries) {
  assert(
    new RegExp(`<html\\b[^>]*\\bdata-surface="${expectedSurface}"`, 'i').test(content),
    `${file}: must declare data-surface="${expectedSurface}" on <html>`
  );
  assert(
    !/<script(?![^>]*\bsrc=)[^>]*>/i.test(content),
    `${file}: must not contain inline <script>`
  );
  assert(!/<style\b/i.test(content), `${file}: must not contain inline <style>`);
  assert(
    !/\bon(?:click|change|input|load|submit|error)=/i.test(content),
    `${file}: must not contain inline event handlers`
  );
  const scripts = [...content.matchAll(/<script\s+src="([^"]+)"/gi)].map((m) => m[1]);
  assert(
    scripts.length === 2 && scripts[0] === 'i18n.js' && scripts[1] === 'popup.js',
    `${file}: expected scripts [i18n.js, popup.js], got [${scripts.join(', ')}]`
  );
}
for (const file of JS_FILES) {
  const code = readRel(file);
  assert(!/\beval\s*\(/.test(code), `${file}: eval() is prohibited`);
  assert(!/\bnew\s+Function\s*\(/.test(code), `${file}: new Function() is prohibited`);
  assert(
    !/URL\.createObjectURL\s*\(/.test(code),
    `${file}: URL.createObjectURL() (Blob URL) is prohibited`
  );
  assert(!/\bnew\s+Worker\s*\(/.test(code), `${file}: new Worker() is prohibited`);
  assert(
    !/\.postMessage\s*\([^;]+,\s*['"]\*['"]\s*\)/.test(code),
    `${file}: wildcard postMessage(..., "*") is prohibited`
  );
}
checks.push('CSP & cross-frame postMessage safety verified');

// 6. PNG binary integrity & permission checks
for (const [relIcon, expectedDim] of Object.entries(EXPECTED_ICONS)) {
  const fullPath = path.join(ROOT_DIR, relIcon);
  assert(fs.existsSync(fullPath), `Missing icon file ${relIcon}`);
  if (!fs.existsSync(fullPath)) continue;
  const buf = fs.readFileSync(fullPath);
  const sig = '89504e470d0a1a0a';
  assert(buf.subarray(0, 8).toString('hex') === sig, `${relIcon}: invalid PNG signature`);
  let pos = 8;
  let ihdrW = 0;
  let ihdrH = 0;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    assert(
      ALLOWED_PNG_CHUNKS.has(type),
      `${relIcon}: unexpected PNG metadata chunk "${type}"`
    );
    if (type === 'IHDR') {
      ihdrW = buf.readUInt32BE(pos + 8);
      ihdrH = buf.readUInt32BE(pos + 12);
    }
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  assert(
    ihdrW === expectedDim && ihdrH === expectedDim,
    `${relIcon}: expected ${expectedDim}x${expectedDim}, got ${ihdrW}x${ihdrH}`
  );
  if (process.platform !== 'win32') {
    const mode = fs.statSync(fullPath).mode & 0o777;
    assert(
      (mode & 0o022) === 0,
      `${relIcon}: permissions ${mode.toString(8)} must not be group/world writable`
    );
  }
}
checks.push(`PNG headers, dimensions, chunks & modes verified (${Object.keys(EXPECTED_ICONS).length} icons)`);

// 7. PII, personal path, email & private identifier leak scan
const LEAK_RULES = [
  {
    label: 'local home directory path',
    re: new RegExp(['/', '(?:home|Users)', '/', '[a-z0-9._-]+'].join(''), 'i')
  },
  {
    label: 'personal identifier leak',
    re: new RegExp(['\\b(', ['ja', 'ke'].join(''), '|', ['zh', 'en', 'g', 'yo', 'ng'].join(''), ')\\b'].join(''), 'i')
  },
  {
    label: 'legacy private repo directory reference',
    re: new RegExp(['web', '_', 'status', '_', 'agy'].join(''), 'i')
  },
  {
    label: 'private workspace/instance name leak',
    re: new RegExp(['\\bgr', 'chain\\b'].join(''), 'i')
  },
  {
    label: 'personal email address',
    re: new RegExp(['[a-z0-9._%+-]+@', '(?:163|qq|gmail|foxmail)\\.com'].join(''), 'i')
  }
];

function collectTextFiles(dirRel = '') {
  const out = [];
  const abs = path.join(ROOT_DIR, dirRel);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') continue;
    const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...collectTextFiles(rel));
    } else if (/\.(js|mjs|html|css|json|md|sh|yml|yaml)$/.test(entry.name) || entry.name === '.gitignore' || entry.name === 'LICENSE') {
      out.push(rel);
    }
  }
  return out;
}

const textFiles = collectTextFiles();
for (const rel of textFiles) {
  const content = readRel(rel);
  for (const rule of LEAK_RULES) {
    const match = content.match(rule.re);
    if (match) {
      errors.push(`${rel}: detected ${rule.label} ("${match[0]}")`);
    }
  }
}
checks.push(`Leak & PII scan clean across ${textFiles.length} repository files`);

if (errors.length > 0) {
  console.error('\nVerification FAILED:\n');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('\nAntigravity Tab Status verification PASSED:\n');
for (const line of checks) {
  console.log(`  [OK] ${line}`);
}
