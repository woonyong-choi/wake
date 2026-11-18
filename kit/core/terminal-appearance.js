const BASE_COLORS = Object.freeze(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']);
export const APPEARANCE_COLORS = Object.freeze([
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground', 'selectionForeground',
  ...BASE_COLORS, ...BASE_COLORS.map(name => 'bright' + name[0].toUpperCase() + name.slice(1)),
]);
const UNSUPPORTED_FIELDS = Object.freeze(['references', 'unknown-options', 'font-size', 'font-archive', 'color-archive', 'color-format', 'extended-palette']);
const MAX_APPEARANCES = 20;

/** Validates a v1 snapshot without retaining unknown fields or filling missing appearance values. */
export function validateTerminalAppearance(input) {
  if (!isRecord(input) || input.version !== 1) return failure('invalid-schema');
  if (!isToken(input.id) || !isLabel(input.label) || !isRecord(input.source)) return failure('invalid-metadata');
  const { appId, appVersion, profileLabel, importedAt } = input.source;
  if (!isToken(appId) || !isLabel(appVersion) || !isLabel(profileLabel) || !isTimestamp(importedAt)) return failure('invalid-metadata');
  if (!isRecord(input.colors) || !isRecord(input.font)) return failure('invalid-schema');
  const colors = {};
  for (const name of APPEARANCE_COLORS) {
    if (!Object.hasOwn(input.colors, name)) continue;
    const color = normalizeColor(input.colors[name]);
    if (!color) return failure('invalid-color');
    colors[name] = color;
  }
  const font = {};
  if (Object.hasOwn(input.font, 'family')) {
    if (!isLabel(input.font.family) || /[;{}<>"',():]/.test(input.font.family)) return failure('invalid-font');
    font.family = input.font.family.trim();
  }
  const unsupportedFields = normalizeUnsupported(input.unsupportedFields);
  if (!unsupportedFields) return failure('invalid-schema');
  if (!Object.keys(colors).length && !font.family) return { status: 'no-data', unsupportedFields };
  const missingFields = APPEARANCE_COLORS.filter(name => !Object.hasOwn(colors, name));
  if (!font.family) missingFields.push('font.family');
  const snapshot = { version: 1, id: input.id, label: input.label.trim(),
    source: { appId, appVersion: appVersion.trim(), profileLabel: profileLabel.trim(), importedAt },
    colors, font, missingFields, unsupportedFields };
  return { status: missingFields.length || unsupportedFields.length ? 'partial' : 'ready', snapshot };
}

/** Resolves only supplied fallback fields; the stored snapshot remains sparse. */
export function resolveTerminalAppearance(snapshot, fallback) {
  const result = validateTerminalAppearance(snapshot);
  if (!result.snapshot || !isRecord(fallback)) return null;
  const colors = {}, fallbackFields = [];
  for (const name of APPEARANCE_COLORS) {
    const imported = result.snapshot.colors[name], base = normalizeColor(fallback.colors?.[name]);
    if (imported) colors[name] = imported;
    else if (base) { colors[name] = base; fallbackFields.push(name); }
  }
  const family = result.snapshot.font.family || fallback.font?.family;
  if (!result.snapshot.font.family && family) fallbackFields.push('font.family');
  return { colors, font: family ? { family } : {}, fallbackFields, unsupportedFields: result.snapshot.unsupportedFields };
}

/** Returns an immutable settings proposal; rejected, absent and unconfirmed partial imports retain the original object. */
export function applyTerminalAppearance(settings, result, { acceptPartial = false } = {}) {
  const unchanged = reason => ({ applied: false, settings, reason });
  if (!isRecord(settings)) return unchanged('invalid-settings');
  if (!result || !['ready', 'partial'].includes(result.status)) return unchanged(result?.status || 'invalid-result');
  const validated = validateTerminalAppearance(result.snapshot);
  if (!validated.snapshot) return unchanged(validated.status);
  if (validated.status === 'partial' && !acceptPartial) return unchanged('confirmation-required');
  const stored = settings['kit.terminal.appearances'] ?? [];
  if (!Array.isArray(stored)) return unchanged('invalid-settings');
  const others = stored.filter(item => item?.id !== validated.snapshot.id);
  if (others.length >= MAX_APPEARANCES) return unchanged('capacity');
  return { applied: true, settings: { ...settings,
    'kit.terminal.appearances': [...others, validated.snapshot], 'kit.terminal.theme': `imported:${validated.snapshot.id}` } };
}

function failure(reason) { return { status: 'error', reason }; }
function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(property => Object.hasOwn(property, 'value'));
}
function isToken(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value); }
function isLabel(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 160 && !/[\x00-\x1f\x7f-\x9f/\\\u202a-\u202e\u2066-\u2069]/.test(value); }
function isTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
}
function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(part => part + part).join('').toLowerCase();
  return null;
}
function normalizeUnsupported(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > UNSUPPORTED_FIELDS.length) return null;
  if (!value.every(field => UNSUPPORTED_FIELDS.includes(field))) return null;
  return [...new Set(value)];
}
