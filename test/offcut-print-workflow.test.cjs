const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(require.resolve('../index.html'), 'utf8').replace(/\r\n/g, '\n');
const labelModule = fs.readFileSync(require.resolve('../offcut-labels.js'), 'utf8');
const workshopModule = fs.readFileSync(require.resolve('../workshop-stock.js'), 'utf8');
const shell = app;

// Exercise the production handlers without booting the whole React application.
function source(name, indent = 2) {
  const prefix = ' '.repeat(indent) + 'function ' + name + '(';
  const start = app.indexOf(prefix);
  assert.ok(start >= 0, 'Production function is present: ' + name);
  const next = new RegExp('\\n {0,' + indent + '}function [\\w$]+\\(', 'g');
  next.lastIndex = start + prefix.length;
  const end = next.exec(app)?.index ?? app.length;
  return app.slice(start, end);
}

const formatters = (app.match(/  var (?:fmtDim|stockDimensions|fmtStockDim|fmtCncOffcutDim) = [^\n]+/g) || []).join('\n');
const helpers = formatters + '\n' + [
  ['normalizeCncInput', 0], ['cncDuplicateKey', 0], ['cncDuplicateError', 0],
  ['cncSheetKey', 0], ['cncPdfImportPlan', 0], ['cncReservedSheets', 2],
  ['offcutStockKey', 0], ['mergeOffcutStock', 0], ['cncWholeOffcutProposal', 0],
  ['cncOffcutError', 2], ['validateCncSchedule', 4],
  ['printScheduledOffcutLabels', 4], ['addCncPanel', 4],
  ['addCncPanelsBulk', 4], ['completeCncSheet', 4], ['printLabel', 4]
].map(([name, indent]) => source(name, indent)).join('\n');

const stock = { id: 'stock', sku: 'ACM-WHITE', qty: 5, color: 'White satin', material: 'ACM', thickness: 4, width: 4000, height: 1500 };
const panel = { jobReference: 'Notre Dame', orderNumber: '838', sheetNumber: '1', panelNumber: 'A', stockItemType: 'variant', stockItemId: 'stock', stockSku: 'ACM-WHITE', sheetWidth: 4000, sheetHeight: 1500, totalPanelArea: 2 };
const proposal = { length: 1200, width: 500, status: 'pending', source: 'manual' };
function row(overrides = {}) { return { ...panel, pendingOffcut: { ...proposal }, ...overrides }; }
function multiRow(pieces, overrides = {}) { return row({ pendingOffcuts: pieces.map(piece => ({ ...piece })), pendingOffcut: pieces[0] || null, ...overrides }); }
const plain = value => JSON.parse(JSON.stringify(value));

function runtime({ panels = [], variants = [{ ...stock }], offcuts = [], failPersist = false } = {}) {
  const events = [], popups = [], writes = [], toasts = [], stateChanges = [], storage = new Map();
  let id = 0, sku = 0;
  const context = vm.createContext({
    module: { exports: {} }, cncPanels: panels, variants, offcuts, transactions: [], username: 'Coordinator', isAdmin: true,
    PanelStock: { username: 'Coordinator' },
    uid: () => 'id-' + (++id), genSku: () => 'OFFCUT-' + (++sku),
    fmtDim: (width, height) => width + ' × ' + height,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    showToast: (...args) => toasts.push(args),
    persist(value) {
      events.push('persist');
      if (failPersist) throw new Error('Storage unavailable');
      writes.push(value);
    },
    open() {
      events.push('open');
      const popup = { html: '', printed: 0, document: { open() {}, close() {}, write(html) { popup.html = html; } }, focus() {}, print() { events.push('print'); popup.printed++; } };
      popups.push(popup);
      return popup;
    },
    alert: message => toasts.push([message]),
    buildLabelLines() { throw new Error('Offcuts must use the 50 × 30 mm offcut label service'); },
    buildPdfBlob() { throw new Error('Offcuts must use the 50 × 30 mm offcut label service'); },
    prepareExport() { throw new Error('Offcuts must use the 50 × 30 mm offcut label service'); }
  });
  for (const [setter, key] of [['setCncPanels', 'cncPanels'], ['setTransactions', 'transactions'], ['setVariants', 'variants'], ['setOffcuts', 'offcuts']]) {
    context[setter] = value => { stateChanges.push(key); events.push(setter); context[key] = value; };
  }
  vm.runInContext('globalThis.window=globalThis;', context);
  // Loading in the sandbox keeps the UMD module from modifying Node's globalThis.
  vm.runInContext(labelModule, context, { filename: 'offcut-labels.js' });
  vm.runInContext(helpers, context, { filename: 'cnc-offcut-handlers.js' });
  return { context, events, popups, writes, toasts, stateChanges, get saved() { return writes.at(-1); } };
}

function labelsIn(popup) { return (popup.html.match(/<article class="label"/g) || []).length; }
function printableLabels(popup) { return Array.from(popup.html.matchAll(/<article class="label"[^>]*>([\s\S]*?)<\/article>/g), match => match[1]); }
function assertCompactLabel(popup, count = 1) {
  assert.equal(popup.printed, 1, 'the browser print dialog is requested');
  assert.match(popup.html, /@page\s*\{\s*size:\s*50mm\s+30mm/);
  assert.match(popup.html, /text-align:\s*center/);
  assert.equal(labelsIn(popup), count, 'one 50 × 30 mm page per physical offcut');
  const printed = printableLabels(popup);
  assert.equal(printed.length, count);
  for (const content of printed) {
    const fields = Array.from(content.matchAll(/<div class="label-line ([^"]+)">([\s\S]*?)<\/div>/g));
    assert.deepEqual(fields.map(field => field[1]), ['dimensions', 'material', 'finish']);
    assert.ok(fields.every(field => field[2].trim()), 'all three large fields have content');
    assert.equal(content.replace(/<div class="label-line [^"]+">[\s\S]*?<\/div>/g, '').trim(), '', 'the physical label contains only the three requested fields');
  }
}
function assertUnchangedStock(run, before) {
  assert.equal(JSON.stringify({ variants: run.context.variants, offcuts: run.context.offcuts }), before);
  assert.ok(run.writes.every(write => !Object.hasOwn(write, 'variants') && !Object.hasOwn(write, 'offcuts')), 'scheduling never persists an SOH adjustment');
}

test('manual scheduling saves an approved offcut before requesting its 50 × 30 mm label, without changing SOH', () => {
  const run = runtime(), input = row(), before = JSON.stringify({ variants: run.context.variants, offcuts: run.context.offcuts });
  assert.equal(run.context.addCncPanel(input), true);
  assert.equal(run.popups.length, 1);
  assertCompactLabel(run.popups[0]);
  assert.ok(run.events.indexOf('persist') < run.events.indexOf('open'));
  const saved = run.saved.cncPanels[0];
  assert.equal(saved.pendingOffcut.approved, true);
  assert.ok(saved.pendingOffcut.labelSku && saved.pendingOffcut.labelOffcutId);
  for (const text of ['4 mm · ACM', 'White satin', '1200 × 500 mm']) assert.ok(run.popups[0].html.includes(text), text);
  for (const text of [saved.pendingOffcut.labelSku, 'Notre Dame', '838']) assert.ok(!printableLabels(run.popups[0]).join('').includes(text), 'stock and job references stay off the physical sticker');
  assert.deepEqual(input, row(), 'the caller-owned proposal is not stamped or mutated');
  assertUnchangedStock(run, before);
});

test('bulk panels sharing a physical sheet get one label and one shared future inventory identity', () => {
  const run = runtime(), rows = [row(), row({ panelNumber: 'B' })], before = JSON.stringify(rows);
  assert.equal(run.context.addCncPanelsBulk(rows), true);
  assert.equal(run.popups.length, 1);
  assertCompactLabel(run.popups[0], 1);
  const [a, b] = run.saved.cncPanels;
  assert.equal(a.pendingOffcut.labelSku, b.pendingOffcut.labelSku);
  assert.equal(a.pendingOffcut.labelOffcutId, b.pendingOffcut.labelOffcutId);
  assert.equal(JSON.stringify(rows), before);
  assert.ok(run.events.indexOf('persist') < run.events.indexOf('open'));
  assert.equal(run.context.variants[0].qty, 5);
  assert.equal(run.context.offcuts.length, 0);
});

test('an approved bulk proposal propagates to empty sibling rows on the same physical sheet', () => {
  for (const empty of [null, undefined]) {
    for (const approvedFirst of [true, false]) {
      const run = runtime(), approved = row(), sibling = row({ panelNumber: 'B', pendingOffcut: empty });
      const rows = approvedFirst ? [approved, sibling] : [sibling, approved];
      const before = JSON.stringify(rows);
      assert.equal(run.context.addCncPanelsBulk(rows), true);
      const [a, b] = run.saved.cncPanels;
      assert.ok(a.pendingOffcut && b.pendingOffcut, 'every saved panel retains the sheet-level approval');
      assert.equal(a.pendingOffcut.approved, true);
      assert.equal(b.pendingOffcut.approved, true);
      assert.equal(a.pendingOffcut.labelSku, b.pendingOffcut.labelSku);
      assert.equal(a.pendingOffcut.labelOffcutId, b.pendingOffcut.labelOffcutId);
      assert.equal(a.pendingOffcut.length, proposal.length);
      assert.equal(b.pendingOffcut.width, proposal.width);
      assert.equal(run.popups.length, 1);
      assertCompactLabel(run.popups[0], 1);
      assert.equal(JSON.stringify(rows), before, 'proposal propagation never mutates caller-owned rows');
      assert.equal(run.context.variants[0].qty, 5);
      assert.equal(run.context.offcuts.length, 0);
    }
  }
});

test('conflicting explicit approval and rejection on one physical sheet cannot save or print', () => {
  for (const approvedFirst of [true, false]) {
    const run = runtime(), approved = row(), rejected = row({ panelNumber: 'B', pendingOffcut: { ...proposal, approved: false } });
    const rows = approvedFirst ? [approved, rejected] : [rejected, approved];
    const before = JSON.stringify(rows);
    assert.equal(run.context.addCncPanelsBulk(rows), false);
    assert.equal(run.writes.length, 0);
    assert.equal(run.popups.length, 0);
    assert.deepEqual(run.events, []);
    assert.deepEqual(run.stateChanges, []);
    assert.equal(run.context.cncPanels.length, 0);
    assert.equal(JSON.stringify(rows), before);
  }
});

test('separate physical sheets and projects produce distinct 50 × 30 mm labels even with matching sizes', () => {
  const run = runtime();
  assert.equal(run.context.addCncPanelsBulk([row(), row({ sheetNumber: '2' }), row({ jobReference: 'Other Project' })]), true);
  assert.equal(run.popups.length, 1);
  assertCompactLabel(run.popups[0], 3);
  const labels = run.context.PanelStockOffcutLabels.collectScheduled(run.saved.cncPanels, { variants: run.context.variants, offcuts: [] });
  assert.equal(new Set(Array.from(labels, label => JSON.stringify([label.job, label.order, label.sheet]))).size, 3);
});

test('multiple equal-sized physical pieces print separately and complete into one stock line with shared stock identity', () => {
  const run = runtime(), pieces = [{ ...proposal, length: 500, width: 300, dimensionOrder: 'sheet' }, { ...proposal, length: 500, width: 300, dimensionOrder: 'sheet' }];
  assert.equal(run.context.addCncPanelsBulk([multiRow(pieces), multiRow(pieces, { panelNumber: 'B' })]), true);
  assert.equal(run.popups.length, 1);
  assertCompactLabel(run.popups[0], 2);
  assert.equal(run.context.variants[0].qty, 5);
  assert.equal(run.context.offcuts.length, 0);
  const retained = run.context.cncPanels[0].pendingOffcuts;
  assert.equal(retained.length, 2);
  for (const sibling of run.context.cncPanels) assert.deepEqual(plain(sibling.pendingOffcuts), plain(retained));
  const printedLabels = run.context.PanelStockOffcutLabels.collectScheduled(run.context.cncPanels, { variants: run.context.variants, offcuts: [] });
  assert.equal(printedLabels.length, 2, 'sibling panels deduplicate without discarding equal-sized physical pieces');
  run.context.completeCncSheet('838', '1', { confirmed: true, offcuts: plain(retained) }, 'Notre Dame');
  assert.equal(run.context.variants[0].qty, 4);
  assert.equal(run.context.offcuts.length, 1);
  assert.equal(run.context.offcuts[0].qty, 2);
  assert.equal(run.context.cncPanels[0].savedOffcuts.length, 2);
  assert.equal(run.context.transactions.filter(txn => txn.type === 'offcut_add').length, 2);
  for (const label of printedLabels) assert.equal(label.sku, run.context.offcuts[0].sku, 'each scheduled physical piece retains its final stock identity');
  assert.equal(run.popups.length, 1);
});

test('existing matching offcut stock keeps its identity and SKU through scheduling, printing and completion', () => {
  const existing = { id: 'existing-cut', sku: 'OFF-EXISTING', color: stock.color, material: stock.material, thickness: stock.thickness, width: 480, height: 1200, dimensionOrder: 'sheet', qty: 3 };
  const run = runtime({ offcuts: [existing] }), pieces = [{ ...proposal, length: 480, width: 1200, dimensionOrder: 'sheet' }];
  assert.equal(run.context.addCncPanelsBulk([multiRow(pieces)]), true);
  assert.equal(run.context.offcuts[0].qty, 3, 'label scheduling reserves no offcut stock');
  assertCompactLabel(run.popups[0]);
  assert.match(run.popups[0].html, /480 × 1200 mm/);
  assert.ok(!printableLabels(run.popups[0]).join('').includes(existing.sku));
  const retained = plain(run.context.cncPanels[0].pendingOffcuts);
  assert.equal(retained[0].labelSku, existing.sku);
  run.context.completeCncSheet('838', '1', { confirmed: true, offcuts: retained }, 'Notre Dame');
  assert.equal(run.context.offcuts.length, 1);
  assert.equal(run.context.offcuts[0].qty, 4);
  assert.equal(run.context.offcuts[0].id, existing.id);
  assert.equal(run.context.offcuts[0].sku, existing.sku);
});

test('a matching stock line arriving after printing remains authoritative while the planned label reference is recorded', () => {
  const run = runtime();
  assert.equal(run.context.addCncPanel(multiRow([{ ...proposal, dimensionOrder: 'sheet' }])), true);
  const retained = plain(run.context.cncPanels[0].pendingOffcuts), planned = retained[0];
  const concurrent = { id: 'concurrent-cut', sku: 'OFF-CONCURRENT', color: stock.color, material: stock.material, thickness: stock.thickness, width: proposal.length, height: proposal.width, dimensionOrder: 'sheet', qty: 2 };
  run.context.offcuts = [concurrent];
  run.context.completeCncSheet('838', '1', { confirmed: true, offcuts: retained }, 'Notre Dame');
  assert.equal(run.context.offcuts.length, 1);
  assert.equal(run.context.offcuts[0].qty, 3);
  assert.equal(run.context.offcuts[0].id, concurrent.id);
  assert.equal(run.context.offcuts[0].sku, concurrent.sku);
  assert.equal(run.context.cncPanels[0].savedOffcuts[0].labelSku, planned.labelSku);
  assert.equal(run.context.cncPanels[0].savedOffcuts[0].stockSku, concurrent.sku);
  assert.equal(run.context.cncPanels[0].pendingOffcuts[0].labelOffcutId, planned.labelOffcutId);
  const receipt = run.context.transactions.find(txn => txn.type === 'offcut_add');
  assert.equal(receipt.sku, concurrent.sku);
  assert.equal(receipt.labelReference, planned.labelSku);
});

test('edited completion dimensions cannot reuse an existing different-sized inventory identity', () => {
  const existing = { id: 'existing-cut', sku: 'OFF-EXISTING', color: stock.color, material: stock.material, thickness: stock.thickness, width: 500, height: 1200, dimensionOrder: 'sheet', qty: 3 };
  const run = runtime({ offcuts: [existing] });
  assert.equal(run.context.addCncPanel(multiRow([{ ...proposal, length: 500, width: 1200, dimensionOrder: 'sheet' }])), true);
  const planned = plain(run.context.cncPanels[0].pendingOffcuts[0]);
  assert.equal(planned.labelSku, existing.sku);
  assert.equal(planned.labelOffcutId, existing.id);
  assertCompactLabel(run.popups[0]);
  assert.match(run.popups[0].html, /500 × 1200 mm/);
  run.context.completeCncSheet('838', '1', { confirmed: true, offcuts: [{ ...planned, length: 450, width: 1200 }] }, 'Notre Dame');
  assert.equal(run.context.offcuts.length, 2);
  const original = run.context.offcuts.find(item => item.id === existing.id);
  const revised = run.context.offcuts.find(item => item.width === 450 && item.height === 1200);
  assert.ok(original && revised);
  assert.equal(original.width, 500);
  assert.equal(original.height, 1200);
  assert.equal(original.qty, 3);
  assert.equal(original.sku, existing.sku);
  assert.equal(revised.qty, 1);
  assert.notEqual(revised.id, existing.id, 'different dimensions require a different stock record');
  assert.notEqual(revised.sku, existing.sku, 'different dimensions cannot share the existing stock SKU');
  assert.equal(new Set(Array.from(run.context.offcuts, item => item.id)).size, 2);
  assert.equal(new Set(Array.from(run.context.offcuts, item => item.sku)).size, 2);
  assert.equal(run.context.cncPanels[0].savedOffcuts[0].labelSku, planned.labelSku);
  assert.equal(run.context.cncPanels[0].savedOffcuts[0].stockSku, revised.sku);
  const receipt = run.context.transactions.find(txn => txn.type === 'offcut_add');
  assert.equal(receipt.sku, revised.sku);
  assert.equal(receipt.labelReference, planned.labelSku);
});

test('a revised single-panel addition cannot leave sibling proposals disagreeing with the printed completion size', () => {
  const run = runtime();
  assert.equal(run.context.addCncPanel(multiRow([{ ...proposal, length: 500, width: 1200, dimensionOrder: 'sheet' }])), true);
  const originalState = JSON.stringify(run.context.cncPanels), firstEvents = run.events.slice();
  const accepted = run.context.addCncPanel(multiRow([{ ...proposal, length: 450, width: 1200, dimensionOrder: 'sheet' }], { panelNumber: 'B' }));
  const expectedLength = accepted ? 450 : 500;
  if (accepted) {
    assert.equal(run.context.cncPanels.length, 2);
    assert.equal(run.popups.length, 2);
    for (const sibling of run.context.cncPanels) {
      assert.equal(sibling.pendingOffcuts.length, 1);
      assert.equal(sibling.pendingOffcuts[0].length, 450);
      assert.equal(sibling.pendingOffcuts[0].width, 1200);
      assert.deepEqual(plain(sibling.pendingOffcut), plain(sibling.pendingOffcuts[0]));
    }
  } else {
    assert.equal(JSON.stringify(run.context.cncPanels), originalState);
    assert.deepEqual(run.events, firstEvents, 'a rejected conflicting addition cannot save or print');
    assert.equal(run.popups.length, 1);
    assert.equal(run.writes.length, 1);
  }
  const finalProposal = plain(run.context.cncPanels[0].pendingOffcuts);
  assert.match(run.popups.at(-1).html, new RegExp(expectedLength + ' × 1200 mm'));
  run.context.completeCncSheet('838', '1', { confirmed: true, offcuts: finalProposal }, 'Notre Dame');
  assert.equal(run.context.offcuts.length, 1);
  assert.equal(run.context.offcuts[0].width, expectedLength);
  assert.equal(run.context.offcuts[0].height, 1200);
  assert.equal(run.context.offcuts[0].sku, finalProposal[0].labelSku);
});

test('withdrawing approval in a single-panel addition clears the proposal from every pending sibling', () => {
  const run = runtime();
  assert.equal(run.context.addCncPanel(multiRow([{ ...proposal, dimensionOrder: 'sheet' }])), true);
  assert.equal(run.popups.length, 1);
  assert.equal(run.context.addCncPanel(multiRow([], { panelNumber: 'B' })), true);
  assert.equal(run.context.cncPanels.length, 2);
  for (const sibling of run.context.cncPanels) {
    assert.deepEqual(plain(sibling.pendingOffcuts), []);
    assert.equal(sibling.pendingOffcut, null);
  }
  assert.equal(run.popups.length, 1, 'withdrawing an approval prints no sticker');
  assert.equal(run.context.printScheduledOffcutLabels(), false);
  assert.equal(run.popups.length, 1, 'the tracker cannot reprint a withdrawn approval');
  run.context.completeCncSheet('838', '1', { confirmed: false, offcuts: [] }, 'Notre Dame');
  assert.equal(run.context.offcuts.length, 0);
  assert.equal(run.context.variants[0].qty, 4);
  assert.ok(run.context.cncPanels.every(item => item.offcutOutcome === 'none'));
});

test('ordered and manually entered short-first axes survive scheduling and printing from stock', () => {
  for (const piece of [
    { ...proposal, length: 480, width: 1200, source: 'cnc-pdf', dimensionOrder: 'sheet' },
    { ...proposal, length: 480, width: 1200, source: 'manual' }
  ]) {
    const run = runtime();
    assert.equal(run.context.addCncPanel(multiRow([piece])), true);
    assertCompactLabel(run.popups[0]);
    assert.match(run.popups[0].html, /480 × 1200 mm/);
    const retained = plain(run.context.cncPanels[0].pendingOffcuts);
    assert.equal(retained[0].length, 480);
    assert.equal(retained[0].width, 1200);
    run.context.completeCncSheet('838', '1', { confirmed: true, offcuts: retained }, 'Notre Dame');
    const saved = run.context.offcuts[0];
    assert.equal(saved.width, 480);
    assert.equal(saved.height, 1200);
    assert.equal(saved.dimensionOrder, 'sheet');
    run.context.printLabel(saved);
    assertCompactLabel(run.popups[1]);
    assert.match(run.popups[1].html, /480 × 1200 mm/);
  }
});

test('invalid proposals and insufficient stock reject scheduling without a save, label or optimistic state', () => {
  for (const bulk of [false, true]) {
    for (const pendingOffcut of [{ ...proposal, width: 0 }, { ...proposal, length: 4500 }]) {
      for (const input of [row({ pendingOffcut }), multiRow([pendingOffcut])]) {
        const run = runtime();
        assert.equal(bulk ? run.context.addCncPanelsBulk([input]) : run.context.addCncPanel(input), false);
        assert.equal(run.writes.length, 0);
        assert.equal(run.popups.length, 0);
        assert.deepEqual(run.stateChanges, []);
        assert.equal(run.context.cncPanels.length, 0);
      }
    }
  }
  const unavailable = runtime({ variants: [{ ...stock, qty: 0 }] });
  assert.equal(unavailable.context.addCncPanelsBulk([row()]), false);
  assert.deepEqual(unavailable.events, []);
  assert.deepEqual(unavailable.stateChanges, []);
});

test('failed scheduling persistence leaves state untouched and never opens the label window', () => {
  for (const bulk of [false, true]) {
    const run = runtime({ failPersist: true }), before = JSON.stringify({ variants: run.context.variants, offcuts: run.context.offcuts });
    assert.equal(bulk ? run.context.addCncPanelsBulk([row()]) : run.context.addCncPanel(row()), false);
    assert.deepEqual(run.events, ['persist']);
    assert.deepEqual(run.stateChanges, []);
    assert.equal(run.context.cncPanels.length, 0);
    assert.equal(run.popups.length, 0);
    assert.match(run.toasts.at(-1)[0], /Storage unavailable/);
    assertUnchangedStock(run, before);
  }
});

test('unapproved or absent offcut proposals save panels without printing or creating SOH', () => {
  for (const bulk of [false, true]) {
    for (const pendingOffcut of [null, { ...proposal, approved: false }]) {
      const run = runtime(), input = row({ pendingOffcut });
      assert.equal(bulk ? run.context.addCncPanelsBulk([input]) : run.context.addCncPanel(input), true);
      assert.equal(run.popups.length, 0);
      assert.equal(run.context.offcuts.length, 0);
      assert.equal(run.context.variants[0].qty, 5);
      assert.equal(run.saved.cncPanels[0].pendingOffcut?.labelSku, undefined);
    }
  }
});

test('an explicit empty proposal array suppresses stale legacy single-proposal data', () => {
  for (const bulk of [false, true]) {
    const run = runtime(), input = row({ pendingOffcuts: [] });
    assert.equal(bulk ? run.context.addCncPanelsBulk([input]) : run.context.addCncPanel(input), true);
    assert.equal(run.popups.length, 0);
    assert.deepEqual(plain(run.saved.cncPanels[0].pendingOffcuts), []);
    assert.equal(run.saved.cncPanels[0].pendingOffcut, null);
    assert.equal(run.context.offcuts.length, 0);
  }
});

test('completion reuses an unchanged scheduled offcut identity and direct stock printing uses its actual 50 × 30 mm dimensions', () => {
  const run = runtime();
  assert.equal(run.context.addCncPanelsBulk([row(), row({ panelNumber: 'B' })]), true);
  const scheduledIdentity = plain(run.saved.cncPanels[0].pendingOffcut);
  run.context.completeCncSheet('838', '1', { confirmed: true, length: 1200, width: 500, note: 'Measured after cutting' }, 'Notre Dame');
  assert.equal(run.context.variants[0].qty, 4);
  assert.equal(run.context.offcuts.length, 1);
  const actual = run.context.offcuts[0];
  assert.equal(actual.id, scheduledIdentity.labelOffcutId);
  assert.equal(actual.sku, scheduledIdentity.labelSku);
  assert.equal(actual.sourceJobReference, 'Notre Dame');
  assert.equal(actual.sourceOrderNumber, '838');
  assert.equal(actual.sourceSheetNumber, '1');
  assert.equal(actual.qty, 1);
  assert.deepEqual(Array.from(run.context.cncPanels, p => p.status), ['completed', 'completed']);
  assert.equal(run.popups.length, 1, 'completion does not create another automatic sticker');
  run.context.printLabel(actual); // Legacy material records may not carry itemType.
  assert.equal(run.popups.length, 2);
  assertCompactLabel(run.popups[1]);
  assert.ok(!printableLabels(run.popups[1]).join('').includes(actual.sku));
  assert.match(run.popups[1].html, /1200 × 500 mm/);
  assert.doesNotMatch(printableLabels(run.popups[1]).join(''), /<footer|Confirm dimensions|One physical piece/);
});

test('reviewed PDF reimports retain panel IDs and keep label identity only while the offcut specification is unchanged', () => {
  const run = runtime(), imported = [row({ pdfPage: 1, pendingOffcut: { ...proposal, source: 'cnc-pdf' } }), row({ panelNumber: 'B', pdfPage: 1, pendingOffcut: { ...proposal, source: 'cnc-pdf' } })];
  assert.equal(run.context.addCncPanelsBulk(imported, { replacePending: true }), true);
  const first = run.saved.cncPanels.map(p => ({ id: p.id, sku: p.pendingOffcut.labelSku, offcutId: p.pendingOffcut.labelOffcutId }));
  assert.equal(run.context.addCncPanelsBulk(imported, { replacePending: true }), true);
  assert.deepEqual(plain(run.saved.cncPanels.map(p => ({ id: p.id, sku: p.pendingOffcut.labelSku, offcutId: p.pendingOffcut.labelOffcutId }))), plain(first), 'reimporting the same dimensions keeps both panel and label identities');
  assert.equal(run.popups.length, 2);
  assertCompactLabel(run.popups[1], 1);
  const revised = imported.map(p => ({ ...p, pendingOffcut: { ...p.pendingOffcut, length: 1100 } }));
  assert.equal(run.context.addCncPanelsBulk(revised, { replacePending: true }), true);
  assert.equal(run.context.cncPanels.length, 2);
  assert.deepEqual(Array.from(run.saved.cncPanels, p => p.id), Array.from(first, p => p.id), 'a changed offcut size does not replace CNC panel records');
  const revisedIdentity = run.saved.cncPanels[0].pendingOffcut;
  assert.notEqual(revisedIdentity.labelSku, first[0].sku);
  assert.notEqual(revisedIdentity.labelOffcutId, first[0].offcutId);
  for (const sibling of run.saved.cncPanels) {
    assert.equal(sibling.pendingOffcut.labelSku, revisedIdentity.labelSku);
    assert.equal(sibling.pendingOffcut.labelOffcutId, revisedIdentity.labelOffcutId);
  }
  assert.equal(run.popups.length, 3);
  assertCompactLabel(run.popups[2], 1);
  assert.match(run.popups[2].html, /1100 × 500 mm/);
  assert.ok(!printableLabels(run.popups[2]).join('').includes(revisedIdentity.labelSku));
  assert.equal(run.context.PanelStockOffcutLabels.collectScheduled(run.context.cncPanels, { variants: run.context.variants, offcuts: [] }).length, 1);
  assert.equal(run.context.offcuts.length, 0);
  assert.equal(run.context.variants[0].qty, 5);
});

test('a partial PDF revision updates or removes the offcut proposal on every pending sibling panel', () => {
  const run = runtime();
  assert.equal(run.context.addCncPanelsBulk([row({ pdfPage: 1 }), row({ panelNumber: 'B', pdfPage: 1 })], { replacePending: true }), true);
  const firstIds = Array.from(run.context.cncPanels, p => p.id);
  const identity = plain(run.context.cncPanels[0].pendingOffcut);
  assert.equal(run.context.addCncPanelsBulk([row({ pdfPage: 1, pendingOffcut: { ...proposal, length: 1050 } })], { replacePending: true }), true);
  assert.deepEqual(Array.from(run.context.cncPanels, p => p.id), firstIds);
  const revisedIdentity = plain(run.context.cncPanels[0].pendingOffcut);
  assert.notEqual(revisedIdentity.labelSku, identity.labelSku);
  assert.notEqual(revisedIdentity.labelOffcutId, identity.labelOffcutId);
  for (const saved of run.context.cncPanels) {
    assert.equal(saved.pendingOffcut.length, 1050);
    assert.equal(saved.pendingOffcut.labelSku, revisedIdentity.labelSku);
    assert.equal(saved.pendingOffcut.labelOffcutId, revisedIdentity.labelOffcutId);
  }
  assertCompactLabel(run.popups[1], 1);
  assert.equal(run.context.addCncPanelsBulk([row({ pdfPage: 1, pendingOffcut: null })], { replacePending: true }), true);
  assert.ok(run.context.cncPanels.every(p => p.pendingOffcut === null), 'unlisted siblings cannot retain an obsolete approval');
  assert.equal(run.popups.length, 2, 'withdrawing approval prints no additional label');
  assert.equal(run.context.printScheduledOffcutLabels(), false);
  assert.equal(run.popups.length, 2);
  assert.equal(run.context.offcuts.length, 0);
  assert.equal(run.context.variants[0].qty, 5);
});

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === 'object' ? [value, ...nodes(value.children)] : [];
}

function reactHooks(context) {
  const state = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  };
  const createElement = (type, props, ...children) => ({ type, ...props, children: children.length ? children : props?.children });
  const jsx = (type, props, key) => ({ type, ...props, key });
  Object.assign(context, {
    useState, useEffect() {}, useMemo: fn => fn(),
    useRef: initial => { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
    import_react: { createElement, useState, default: { Fragment: 'fragment' } }, import_jsx_runtime: { jsx, jsxs: jsx },
    CncProjectPicker: 'project-picker', PageHeading: 'heading', Upload: 'upload', Trash2: 'trash',
    Field: 'field', CncStockPicker: 'stock-picker', CncPanelTypeFields: 'classification', inputCls: 'input'
  });
  return (component, props) => { cursor = 0; return nodes(component(props)); };
}

test('reviewed PDF selections print only retained physical pieces and deduplicate the sheet panel records', async () => {
  const run = runtime(), pieces = [
    { length: 500, width: 1500, dimensionOrder: 'sheet', rectangle: { x: 3500, y: 0, width: 500, height: 1500 } },
    { length: 2000, width: 300, dimensionOrder: 'sheet', rectangle: { x: 0, y: 1200, width: 2000, height: 300 } },
    { length: 220, width: 440, dimensionOrder: 'sheet', rectangle: { x: 3000, y: 0, width: 220, height: 440 } }
  ];
  const pdfPages = [{ page: 1, project: 'Unselected PDF project', orderNumber: '838', sheetNumber: '1', panelIds: ['A', 'B'], quantity: 2, sheetWidth: stock.width, sheetHeight: stock.height, panelArea: 4, material: 'ACM 4 mm', finish: stock.color, proposedOffcuts: pieces, proposedOffcut: pieces[0] }];
  const drawComponent = reactHooks(run.context);
  run.context.BAKED_WORKER_URL = 'https://example.test';
  run.context.FileReader = class { readAsDataURL() { this.result = 'data:application/pdf;base64,AA=='; this.onload(); } };
  run.context.PanelStock.apiFetch = async () => ({ ok: true, json: async () => ({ pages: pdfPages }) });
  vm.runInContext(['expandCncPdfSheets', 'cncRecutSheetPlan', 'cncPdfStockMatch', 'CncPdfImport'].map(name => source(name)).join('\n') + ';globalThis.TestCncPdfImport=CncPdfImport;', run.context);
  const props = { variants: run.context.variants, offcuts: [], cncPanels: [], onSave: rows => run.context.addCncPanelsBulk(rows, { replacePending: true }), onClose() {} };
  const draw = () => drawComponent(run.context.TestCncPdfImport, props);
  await draw().find(node => node.accept === 'application/pdf').onChange({ target: { files: [{ type: 'application/pdf', size: 1, name: 'review.pdf' }] } });
  assert.equal(run.popups.length, 0, 'upload and review do not print');
  draw().find(node => node.type === 'project-picker').onChange('Notre Dame', { id: 'known-project', name: 'Notre Dame' });
  for (const label of ['Keep offcut for sheet 1', 'Keep offcut for sheet 1 offcut 2']) draw().find(node => node['aria-label'] === label).onChange({ target: { checked: true } });
  const save = draw().find(node => node.type === 'button' && (typeof node.children === 'string' ? node.children.includes('Save reviewed sheets') : node.children?.some?.(text => typeof text === 'string' && text.includes('Save reviewed sheets'))));
  assert.ok(save);
  assert.equal(save.disabled, false);
  save.onClick();
  assert.equal(run.context.cncPanels.length, 4, 'two panels on each physical sheet are scheduled');
  assert.ok(run.context.cncPanels.filter(p => p.sheetNumber === '1').every(p => p.pendingOffcuts.length === 2));
  assert.ok(run.context.cncPanels.filter(p => p.sheetNumber === '1.2').every(p => p.pendingOffcuts.length === 0));
  assert.equal(run.popups.length, 1);
  assertCompactLabel(run.popups[0], 2);
  assert.match(run.popups[0].html, /500 × 1500 mm/);
  assert.match(run.popups[0].html, /2000 × 300 mm/);
  assert.doesNotMatch(run.popups[0].html, /220 × 440 mm/);
  assert.ok(run.events.indexOf('persist') < run.events.indexOf('open'));
  assert.equal(run.context.variants[0].qty, 5);
  assert.equal(run.context.offcuts.length, 0);
});

test('the loaded workshop stock screen offers 50 × 30 mm printing directly on offcut records', () => {
  assert.match(shell, /<script\b[^>]*src=["']offcut-labels\.js(?:\?[^"']*)?["']/);
  const run = runtime(), items = [
    { id: 'profile', sku: 'OFF-PROFILE', name: 'Aluminium angle', category: 'offcuts', lengthMm: 950, dimensions: '25 × 25 × 3 mm', colour: 'Mill finish', qty: 1, available: 1, unit: 'lengths' },
    { id: 'standard', sku: 'STANDARD', name: 'Standard extrusion', category: 'extrusions', qty: 1, available: 1, unit: 'lengths' }
  ];
  const before = JSON.stringify(items);
  let cursor = 0;
  const React = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, ...props, children }),
    useState(initial) { const value = cursor++ === 0 ? { items, categories: {}, stocktakes: [], orders: [] } : typeof initial === 'function' ? initial() : initial; return [value, () => {}]; },
    useEffect() {}
  };
  vm.runInContext(workshopModule, run.context, { filename: 'workshop-stock.js' });
  const component = run.context.createWorkshopStock(React);
  const tree = component({ workerUrl: '/worker', isAdmin: true, onPanels() {} });
  const selects = nodes(tree).filter(node => node.type === 'select' && node.className === 'ws-action-select');
  const offcut = selects.find(node => node['aria-label'] === 'Stock action for Aluminium angle');
  const ordinary = selects.find(node => node['aria-label'] === 'Stock action for Standard extrusion');
  assert.ok(offcut && ordinary);
  assert.ok(nodes(offcut.children).some(node => node.type === 'option' && node.value === 'print-offcut'));
  assert.equal(nodes(ordinary.children).some(node => node.type === 'option' && node.value === 'print-offcut'), false);
  offcut.onChange({ target: { value: 'print-offcut' } });
  assert.equal(run.popups.length, 1);
  assertCompactLabel(run.popups[0]);
  for (const text of ['Aluminium angle', '950 mm long', '25 × 25 × 3 mm', 'Mill finish']) assert.ok(run.popups[0].html.includes(text), text);
  assert.equal(JSON.stringify(items), before);
  assert.equal(run.writes.length, 0);
});
