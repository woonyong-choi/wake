const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MAX_SOURCE_BYTES, parseTerminalAppearance } = require('./terminal-appearance.cjs');

function parse(source, format = 'ghostty') {
  return parseTerminalAppearance({ format, bytes: Buffer.isBuffer(source) ? source : Buffer.from(source), metadata: {
    id: 'imported-test', label: 'Selected appearance', source: { appId: 'example.terminal', appVersion: '1.0',
      profileLabel: 'Selected profile', importedAt: '2026-11-06T00:00:00Z' }, raw: 'private' } });
}
function plist(content) { return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>${content}</dict></plist>`; }
function color(key, components = [0, 0.5, 1], extra = '') {
  return `<key>${key}</key><dict>${['Red', 'Green', 'Blue'].map((name, index) => `<key>${name} Component</key><real>${components[index]}</real>`).join('')}${extra}</dict>`;
}

test('parseTerminalAppearance_absent_explicit_settings_cannot_report_success', async () => {
  for (const source of ['', '# default appearance only\n', 'font-family =\nbackground =\n', 'theme = external-private\ncommand = private']) {
    const result = await parse(source);
    assert.equal(result.status, 'no-data');
    assert.equal(Object.hasOwn(result, 'snapshot'), false);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('parseTerminalAppearance_ghostty_extracts_explicit_values_without_resolving_references', async () => {
  const result = await parse('theme = light:private,dark:private\nconfig-file = /private\nbackground = 112233\nforeground = #AABBCC\npalette = 1=#aa0000\npalette = 0x9=ffaaaa\nfont-family = "Example Mono"\nfont-size = 14\ncommand = private\n');
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.snapshot.colors, { background: '#112233', foreground: '#aabbcc', red: '#aa0000', brightRed: '#ffaaaa' });
  assert.deepEqual(result.snapshot.font, { family: 'Example Mono' });
  assert.deepEqual(new Set(result.snapshot.unsupportedFields), new Set(['references', 'font-size', 'unknown-options']));
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('parseTerminalAppearance_ghostty_last_assignment_and_reset_do_not_keep_stale_colors', async () => {
  const result = await parse('foreground = 112233\nforeground =\nbackground = 445566\npalette = 1=abcdef\npalette =\nfont-family = Example Mono\nfont-family =\npalette = 20=abcdef\n');
  assert.deepEqual(result.snapshot.colors, { background: '#445566' });
  assert.deepEqual(result.snapshot.font, {});
  assert.ok(result.snapshot.unsupportedFields.includes('extended-palette'));
  assert.equal((await parse('foreground=112233\nforeground=cell-background')).status, 'no-data');
});

test('parseTerminalAppearance_itermcolors_maps_srgb_and_distinct_bright_ansi', async () => {
  const source = plist(color('Foreground Color') + color('Ansi 1 Color', [1, 0, 0]) + color('Ansi 9 Color', [1, 1, 0]) + '<key>Command</key><string>private</string>');
  const result = await parse(source, 'itermcolors');
  assert.deepEqual(result.snapshot.colors, { foreground: '#0080ff', red: '#ff0000', brightRed: '#ffff00' });
  assert.deepEqual(result.snapshot.font, {});
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('parseTerminalAppearance_unsupported_archive_colorspace_and_alpha_are_not_invented', async () => {
  const archived = await parse(plist('<key>BackgroundColor</key><data>cHJpdmF0ZQ==</data><key>Font</key><data>cHJpdmF0ZQ==</data><key>PrivateOptions</key><array><true/><false/><string/></array>'), 'terminal');
  assert.equal(archived.status, 'no-data');
  assert.deepEqual(new Set(archived.unsupportedFields), new Set(['color-archive', 'font-archive', 'unknown-options']));
  const partial = await parse(plist(color('Foreground Color') + color('Background Color', [1, 1, 1], '<key>Alpha Component</key><real>0.5</real>') + color('Cursor Color', [1, 0, 0], '<key>Color Space</key><string>P3</string>')), 'itermcolors');
  assert.deepEqual(partial.snapshot.colors, { foreground: '#0080ff' });
  assert.ok(partial.snapshot.missingFields.includes('background'));
  assert.ok(partial.snapshot.unsupportedFields.includes('color-format'));
});

test('parseTerminalAppearance_limits_encoding_and_malformed_inputs_fail_without_echo', async () => {
  const cases = [
    [Buffer.alloc(MAX_SOURCE_BYTES + 1), 'ghostty', 'too-large'], [Buffer.from([0xff]), 'ghostty', 'invalid-encoding'],
    ['bplist00private', 'terminal', 'unsupported-format'], ['private', 'other', 'unsupported-format'],
    ['not an assignment private', 'ghostty', 'invalid-format'], ['palette=256=112233', 'ghostty', 'invalid-format'],
    [plist('<key>x</key><string>&private;</string>'), 'itermcolors', 'invalid-format'],
    ['<!DOCTYPE plist [<!ENTITY x SYSTEM "file:///private">]><plist version="1.0"><dict></dict></plist>', 'itermcolors', 'invalid-format'],
    [plist('<key>x</key><string>a</string><key>x</key><string>b</string>'), 'itermcolors', 'invalid-format'],
    [plist(color('Foreground Color', ['NaN', 0, 0])), 'itermcolors', 'invalid-format'],
  ];
  for (const [source, format, reason] of cases) {
    const result = await parse(source, format);
    assert.deepEqual(result, { status: 'error', reason });
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
  assert.equal((await parseTerminalAppearance({ format: 'ghostty', bytes: 'foreground=112233' })).reason, 'invalid-input');
});

test('parseTerminalAppearance_shared_validator_and_apply_keep_original_settings_on_failure', async () => {
  const { applyTerminalAppearance } = await import('../core/terminal-appearance.js');
  const settings = { 'kit.terminal.theme': 'midnight', unrelated: { draft: 'kept' } }, before = JSON.stringify(settings);
  for (const result of [await parse('# no explicit appearance'), await parse('bad input'), await parse('foreground=112233')]) {
    const proposal = applyTerminalAppearance(settings, result);
    assert.equal(proposal.applied, false);
    assert.equal(proposal.settings, settings);
    assert.equal(JSON.stringify(settings), before);
  }
  const result = await parse('foreground=112233');
  assert.equal(applyTerminalAppearance(settings, result, { acceptPartial: true }).applied, true);
});

test('parseTerminalAppearance_nested_and_node_limits_stop_bounded_plist_input', async () => {
  const nested = '<array>'.repeat(10) + '<string>private</string>' + '</array>'.repeat(10);
  const many = '<array>' + '<true/>'.repeat(2050) + '</array>';
  for (const value of [nested, many]) {
    assert.deepEqual(await parse(plist('<key>unused</key>' + value), 'itermcolors'), { status: 'error', reason: 'invalid-format' });
  }
});

test('parseTerminalAppearance_plist_inherited_property_names_are_unknown', async () => {
  const result = await parse(plist(color('__proto__') + color('constructor') + color('Foreground Color')), 'itermcolors');
  assert.deepEqual(result.snapshot.colors, { foreground: '#0080ff' });
  assert.deepEqual(result.snapshot.unsupportedFields, ['unknown-options']);
});

test('parseTerminalAppearance_long_lines_and_all_line_terminators_finish_in_bounded_child', () => {
  const { spawnSync } = require('node:child_process');
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { performance } = require('node:perf_hooks');
    const { MAX_SOURCE_BYTES, parseTerminalAppearance } = require(process.argv[1]);
    const metadata = { id: 'bounded', label: 'bounded', source: { appId: 'example.terminal', appVersion: '1', profileLabel: 'bounded', importedAt: '2026-11-06T00:00:00Z' } };
    (async () => {
      const measurements = [];
      for (const separator of ['\\n', '\\r\\n', '\\r', '\\u2028', '\\u2029']) {
        const prefix = ' '.repeat(60000) + separator;
        const source = prefix + 'foreground=112233' + separator + 'background=445566';
        const started = performance.now();
        const result = await parseTerminalAppearance({ format: 'ghostty', bytes: Buffer.from(source), metadata });
        assert.equal(result.status, 'partial');
        assert.equal(result.snapshot.colors.foreground, '#112233');
        assert.equal(result.snapshot.colors.background, '#445566');
        measurements.push({ lineTerminator: JSON.stringify(separator), bytes: Buffer.byteLength(source), elapsedMs: performance.now() - started });
      }
      for (const source of [' '.repeat(MAX_SOURCE_BYTES), ' '.repeat(MAX_SOURCE_BYTES - 1) + '=', 'foreground=' + '='.repeat(MAX_SOURCE_BYTES - 11)]) {
        assert.equal(Buffer.byteLength(source), MAX_SOURCE_BYTES);
        const started = performance.now();
        const result = await parseTerminalAppearance({ format: 'ghostty', bytes: Buffer.from(source), metadata });
        assert.ok(['no-data', 'error'].includes(result.status));
        measurements.push({ bytes: Buffer.byteLength(source), status: result.status, elapsedMs: performance.now() - started });
      }
      assert.equal((await parseTerminalAppearance({ format: 'ghostty', bytes: Buffer.alloc(MAX_SOURCE_BYTES + 1), metadata })).reason, 'too-large');
      console.log(JSON.stringify(measurements));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `, require.resolve('./terminal-appearance.cjs')], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 });

  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  const measurements = JSON.parse(child.stdout);
  assert.equal(measurements.length, 8);
  assert.ok(measurements.every(item => Number.isFinite(item.elapsedMs)));
  console.log(JSON.stringify({ boundedParserMeasurements: measurements }));
});

test('parseTerminalAppearance_unclosed_xml_and_entities_finish_in_bounded_child', () => {
  const { spawnSync } = require('node:child_process');
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { performance } = require('node:perf_hooks');
    const { MAX_SOURCE_BYTES, parseTerminalAppearance } = require(process.argv[1]);
    const metadata = { id: 'bounded', label: 'bounded', source: { appId: 'example.terminal', appVersion: '1', profileLabel: 'bounded', importedAt: '2026-11-06T00:00:00Z' } };
    (async () => {
      const measurements = [];
      const bodies = [
        '<'.repeat(60000), '<dict><key>unused</key><string' + 'x'.repeat(60000),
        'text<'.repeat(12000), '<dict><key>unused</key><string>' + '&'.repeat(60000) + '</string></dict>',
        '<dict><key>unused</key><string>' + 'x'.repeat(60000) + '&amp;</string></dict>'
      ];
      for (const [index, body] of bodies.entries()) {
        const bytes = Buffer.from('<plist version="1.0">' + body + '</plist>');
        assert.ok(bytes.byteLength <= MAX_SOURCE_BYTES);
        const started = performance.now();
        const result = await parseTerminalAppearance({ format: 'itermcolors', bytes, metadata });
        assert.equal(result.status, index === bodies.length - 1 ? 'no-data' : 'error');
        measurements.push({ index, bytes: bytes.byteLength, status: result.status, elapsedMs: performance.now() - started });
      }
      console.log(JSON.stringify(measurements));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `, require.resolve('./terminal-appearance.cjs')], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 });

  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  const measurements = JSON.parse(child.stdout);
  assert.equal(measurements.length, 5);
  assert.ok(measurements.every(item => Number.isFinite(item.elapsedMs)));
  console.log(JSON.stringify({ boundedPlistMeasurements: measurements }));
});
