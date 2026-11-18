const { TextDecoder } = require('node:util');
const { execFile } = require('node:child_process');

const MAX_SOURCE_BYTES = 64 * 1024;
const GHOSTTY_COLORS = Object.freeze({ background: 'background', foreground: 'foreground', 'cursor-color': 'cursor',
  'cursor-text': 'cursorAccent', 'selection-background': 'selectionBackground', 'selection-foreground': 'selectionForeground' });
const PLIST_COLORS = Object.freeze({ 'Background Color': 'background', 'Foreground Color': 'foreground', 'Cursor Color': 'cursor',
  'Cursor Text Color': 'cursorAccent', 'Selection Color': 'selectionBackground', 'Selected Text Color': 'selectionForeground',
  BackgroundColor: 'background', TextColor: 'foreground', CursorColor: 'cursor', SelectionColor: 'selectionBackground' });
const ANSI_NAMES = Object.freeze(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']);

/** Parses caller-supplied bytes only; file access, reference resolution and persistence belong to the broker. */
async function parseTerminalAppearance({ format, bytes, metadata } = {}) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return failure('invalid-input');
  if (bytes.byteLength > MAX_SOURCE_BYTES) return failure('too-large');
  if (!['ghostty', 'itermcolors', 'terminal'].includes(format)) return failure('unsupported-format');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return failure('invalid-encoding'); }
  if (!source.trim()) return { status: 'no-data' };
  if (source.startsWith('bplist')) return failure('unsupported-format');
  let appearance;
  try { appearance = format === 'ghostty' ? parseGhostty(source) : parseColorPlist(source, format); }
  catch { return failure('invalid-format'); }
  const { validateTerminalAppearance } = await import('../core/terminal-appearance.js');
  return validateTerminalAppearance({ ...metadata, version: 1, ...appearance });
}

function failure(reason) { return { status: 'error', reason }; }
async function localPlist(bytes) {
  const xml = await new Promise((resolve, reject) => {
    const child = execFile('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'],
      { encoding: 'utf8', timeout: 2000, maxBuffer: MAX_SOURCE_BYTES * 2 },
      (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin.on('error', reject);
    child.stdin.end(bytes);
  });
  return parsePlist(xml, { includeData: true });
}

async function parseTerminalPreferences(bytes, metadata) {
  if (process.platform !== 'darwin' || bytes.byteLength > MAX_SOURCE_BYTES) return failure('unsupported-format');
  try {
    const preferences = await localPlist(bytes);
    const profile = preferences['Window Settings']?.[preferences['Default Window Settings']];
    if (!profile) return { status: 'no-data' };
    const appearance = plistAppearance(profile, 'terminal');
    if (Buffer.isBuffer(profile.Font)) {
      const archive = await localPlist(profile.Font).catch(() => null), objects = archive?.$objects;
      const root = objects?.[archive?.$top?.root?.['CF$UID']];
      const type = objects?.[root?.$class?.['CF$UID']];
      const name = objects?.[root?.NSName?.['CF$UID']];
      if (archive?.$archiver === 'NSKeyedArchiver' && type?.$classname === 'NSFont' && typeof name === 'string') {
        appearance.font.family = name;
        appearance.unsupportedFields = appearance.unsupportedFields.filter(field => field !== 'font-archive');
      }
    }
    const { validateTerminalAppearance } = await import('../core/terminal-appearance.js');
    return validateTerminalAppearance({ ...metadata, version: 1, ...appearance });
  } catch { return failure('invalid-format'); }
}

function parseGhostty(source) {
  const colors = {}, font = {}, unsupported = new Set();
  for (const rawLine of source.split(/[\n\r\u2028\u2029]/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) throw new Error('invalid assignment');
    const key = line.slice(0, separator).trim();
    if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error('invalid key');
    const value = unquote(line.slice(separator + 1).trim());
    if (key === 'theme' || key === 'config-file') { if (value) unsupported.add('references'); continue; }
    if (key === 'font-size') { if (value) unsupported.add('font-size'); continue; }
    if (key === 'font-family') { if (value) font.family = value; else delete font.family; continue; }
    if (key === 'palette') { parsePalette(value, colors, unsupported); continue; }
    if (Object.hasOwn(GHOSTTY_COLORS, key)) { setColor(colors, GHOSTTY_COLORS[key], value, unsupported); continue; }
    unsupported.add('unknown-options');
  }
  return { colors, font, unsupportedFields: [...unsupported] };
}
function unquote(value) {
  if (!value.startsWith('"')) return value;
  const parsed = JSON.parse(value);
  if (typeof parsed !== 'string') throw new Error('invalid quoted value');
  return parsed;
}
function setColor(colors, key, value, unsupported) {
  delete colors[key];
  if (!value) return;
  if (/^#?[\da-f]{6}$/i.test(value)) colors[key] = '#' + value.replace(/^#/, '').toLowerCase();
  else unsupported.add('color-format');
}
function parsePalette(value, colors, unsupported) {
  if (!value) { for (const name of ANSI_NAMES) delete colors[name]; return; }
  const match = /^(0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+)\s*=\s*(.+)$/.exec(value);
  if (!match) throw new Error('invalid palette');
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index > 255) throw new Error('invalid palette index');
  if (index >= ANSI_NAMES.length) { unsupported.add('extended-palette'); return; }
  setColor(colors, ANSI_NAMES[index], match[2], unsupported);
}
function parseColorPlist(source, format) {
  return plistAppearance(parsePlist(source), format);
}
function plistAppearance(values, format) {
  const colors = {}, unsupported = new Set();
  if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error('invalid color dictionary');
  for (const [key, value] of Object.entries(values)) {
    const ansi = /^Ansi (\d{1,2}) Color$/.exec(key);
    const target = Object.hasOwn(PLIST_COLORS, key) ? PLIST_COLORS[key] : (ansi && ANSI_NAMES[Number(ansi[1])]);
    if (!target) { unsupported.add(key === 'Font' ? 'font-archive' : 'unknown-options'); continue; }
    const color = plistColor(value);
    if (color) colors[target] = color;
    else unsupported.add(format === 'terminal' ? 'color-archive' : 'color-format');
  }
  return { colors, font: {}, unsupportedFields: [...unsupported] };
}
function plistColor(value) {
  if (!value || typeof value !== 'object') return null;
  if (value['Color Space'] && value['Color Space'] !== 'sRGB') return null;
  if (value['Alpha Component'] !== undefined && value['Alpha Component'] !== 1) return null;
  const components = ['Red Component', 'Green Component', 'Blue Component'].map(key => value[key]);
  if (!components.every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1)) return null;
  return '#' + components.map(number => Math.round(number * 255).toString(16).padStart(2, '0')).join('');
}
function parsePlist(source, { includeData = false } = {}) {
  let xml = source.trim();
  if (xml.startsWith('<?xml')) {
    const end = xml.indexOf('?>');
    if (end < 0 || !/^<\?xml\s+version="1\.0"(?:\s+encoding="UTF-8")?\s*\?>$/i.test(xml.slice(0, end + 2))) throw new Error('invalid xml declaration');
    xml = xml.slice(end + 2).trimStart();
  }
  if (xml.startsWith('<!DOCTYPE')) {
    const end = xml.indexOf('>');
    if (end < 0 || !/^<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN" "https?:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd">$/.test(xml.slice(0, end + 1))) throw new Error('unsupported doctype');
    xml = xml.slice(end + 1).trimStart();
  }
  const open = '<plist version="1.0">', close = '</plist>';
  if (!xml.startsWith(open) || !xml.endsWith(close)) throw new Error('invalid plist wrapper');
  const content = xml.slice(open.length, -close.length);
  if (content.includes('<!') || content.includes('<?')) throw new Error('unsupported xml');
  const tokens = tokenizePlist(content);
  let position = 0, nodes = 0;
  function whitespace() { while (position < tokens.length && !tokens[position].trim()) position++; }
  function read(depth) {
    whitespace();
    if (depth > 8 || ++nodes > 2048) throw new Error('plist limit');
    const tag = tokens[position++];
    if (tag === '<true/>') return true;
    if (tag === '<false/>') return false;
    if (tag === '<string/>') return '';
    if (tag === '<data/>') return null;
    if (tag === '<date>' && includeData) { scalar('date'); return null; }
    if (tag === '<dict/>') return Object.create(null);
    if (tag === '<array/>') return [];
    if (tag === '<array>') {
      const values = [];
      for (;;) {
        whitespace();
        if (tokens[position] === '</array>') { position++; return values; }
        values.push(read(depth + 1));
      }
    }
    if (tag === '<dict>') {
      const result = Object.create(null);
      for (;;) {
        whitespace();
        if (tokens[position] === '</dict>') { position++; return result; }
        if (tokens[position++] !== '<key>') throw new Error('missing key');
        const key = scalar('key');
        if (Object.hasOwn(result, key)) throw new Error('duplicate key');
        result[key] = read(depth + 1);
      }
    }
    const type = /^<(string|real|integer|data)>$/.exec(tag || '')?.[1];
    if (!type) throw new Error('unsupported plist type');
    const value = scalar(type);
    if (type === 'data') return includeData ? Buffer.from(value, 'base64') : null;
    if (type === 'string') return value;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw new Error('invalid number');
    const number = Number(value);
    if (!Number.isFinite(number) || (type === 'integer' && !Number.isInteger(number))) throw new Error('invalid number');
    return number;
  }
  function scalar(type) {
    const text = tokens[position]?.startsWith('<') ? '' : tokens[position++] || '';
    if (tokens[position++] !== `</${type}>`) throw new Error('unclosed scalar');
    return decodeEntities(text);
  }
  const result = read(0); whitespace();
  if (position !== tokens.length) throw new Error('trailing plist');
  return result;
}
function tokenizePlist(source) {
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const isTag = source[position] === '<';
    const found = source.indexOf(isTag ? '>' : '<', position + (isTag ? 1 : 0));
    if (isTag && found < 0) throw new Error('unclosed tag');
    const end = found < 0 ? source.length : found + (isTag ? 1 : 0);
    tokens.push(source.slice(position, end));
    if (tokens.length > 8192) throw new Error('token limit');
    position = end;
  }
  return tokens;
}
function decodeEntities(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const parts = [];
  let position = 0;
  while (position < text.length) {
    const start = text.indexOf('&', position);
    if (start < 0) { parts.push(text.slice(position)); break; }
    parts.push(text.slice(position, start));
    const end = text.indexOf(';', start + 1);
    if (end < 0) throw new Error('unclosed entity');
    const name = text.slice(start + 1, end);
    if (!Object.hasOwn(entities, name)) throw new Error('unsupported entity');
    parts.push(entities[name]); position = end + 1;
  }
  return parts.join('');
}

module.exports = { MAX_SOURCE_BYTES, parseTerminalAppearance, parseTerminalPreferences };
