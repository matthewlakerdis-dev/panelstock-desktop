/* Shared by the desktop and mobile apps. Keep both copies identical. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PanelStockOffcutLabels = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var preferenceKey = 'panelstock:offcut-label-size';
  function text(value) { return value == null ? '' : String(value).trim(); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  function positive(value) { var n = Number(value); return Number.isFinite(n) && n > 0 && n <= 1000000 ? n : null; }
  function dimensions(length, width, dimensionOrder) {
    var a = positive(length), b = positive(width);
    return a && b ? dimensionOrder === 'sheet' ? { length: a, width: b } : { length: Math.max(a, b), width: Math.min(a, b) } : null;
  }
  function number(value) { return Number(value).toLocaleString('en-AU', { maximumFractionDigits: 3 }); }
  function formatDimensions(length, width, dimensionOrder) {
    var size = dimensions(length, width, dimensionOrder);
    return size ? number(size.length) + ' × ' + number(size.width) + ' mm' : '';
  }
  function sheetKey(row) {
    return JSON.stringify([row.jobReference || '', row.orderNumber || '', row.sheetNumber || ''].map(function (part) {
      return text(part).replace(/\s+/g, ' ').toLocaleLowerCase('en-AU');
    }));
  }
  function stableReference(row, index, count) {
    return ['CNC', text(row.jobReference), text(row.orderNumber), text(row.sheetNumber), count > 1 ? 'Piece ' + (index + 1) : ''].filter(Boolean).join(' / ');
  }
  function rowProposals(row) {
    var proposals = Array.isArray(row.pendingOffcuts) ? row.pendingOffcuts : row.pendingOffcut ? [row.pendingOffcut] : [];
    if (proposals.length > 20) throw new Error('A physical CNC sheet can retain at most 20 offcuts.');
    return proposals;
  }
  function proposalOrder(proposal) {
    return proposal.dimensionOrder === 'sheet' || proposal.source === 'manual' ? 'sheet' : undefined;
  }
  function proposalKey(row, index) { return sheetKey(row) + ':' + index; }
  function proposalSize(proposal) {
    return proposal && dimensions(proposal.length, proposal.width, proposalOrder(proposal));
  }
  function sourceStock(row, stock) {
    var type = row.stockItemType === 'offcut' ? 'offcut' : 'variant';
    var id = text(row.stockItemId || row.stockVariantId).replace(/^(?:variant|offcut):/, '');
    var items = type === 'offcut' ? stock.offcuts : stock.variants;
    return id && (Array.isArray(items) ? items : []).find(function (entry) { return text(entry.id).replace(/^(?:variant|offcut):/, '') === id; }) || null;
  }
  function stockSpecKey(item) {
    var size = dimensions(item.width, item.height, item.dimensionOrder);
    if (!size || !positive(item.thickness)) return '';
    var clean = function (value) { return text(value).replace(/\s+/g, ' ').toLowerCase(); };
    return JSON.stringify([clean(item.material), clean(item.color), Number(item.thickness), size.length, size.width]);
  }
  function proposalSpec(row, proposal, stock) {
    var size = proposalSize(proposal), source = sourceStock(row, stock), material = source || proposal;
    if (!size || !(source || (text(proposal.material) && positive(proposal.thickness)))) return '';
    return stockSpecKey({material:material.material,color:material.color || material.colour,thickness:material.thickness,width:size.length,height:size.width,dimensionOrder:proposalOrder(proposal)});
  }
  function proposalFingerprint(row, proposal, stock) {
    var size = proposalSize(proposal);
    return proposalSpec(row, proposal, stock) || (size ? JSON.stringify([size.length, size.width]) : '');
  }
  function matchesLiveIdentity(identity, spec, size, stock) {
    var items = Array.isArray(stock.offcuts) ? stock.offcuts : [];
    var live = items.find(function (item) { return text(item.id) === text(identity.labelOffcutId); }) || items.find(function (item) { return text(item.sku) === text(identity.labelSku); });
    if (!live) return true;
    if (spec) return stockSpecKey(live) === spec;
    var liveSize = dimensions(live.width, live.height, live.dimensionOrder);
    return liveSize && liveSize.length === size.length && liveSize.width === size.width;
  }
  function prepareScheduled(rows, existing, options) {
    options = options || {};
    var identities = new Map(), identitySpecs = new Map(), stockIdentities = new Map(), proposedSizes = new Map(), proposals = new Map(), rejected = new Set(), sheetCounts = new Map();
    (Array.isArray(options.offcuts) ? options.offcuts : []).forEach(function (item) {
      var key = stockSpecKey(item);
      if (key && !stockIdentities.has(key) && text(item.id) && text(item.sku)) stockIdentities.set(key, {labelSku: item.sku, labelOffcutId: item.id});
    });
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || row.status === 'completed') return;
      var list = rowProposals(row), sheet = sheetKey(row);
      sheetCounts.set(sheet, Math.max(sheetCounts.get(sheet) || 0, list.length));
      list.forEach(function (proposal, index) {
        if (!proposal) return;
        var key = proposalKey(row, index), reference = (text(row.jobReference) ? text(row.jobReference) + ' · ' : '') + 'Order ' + text(row.orderNumber) + ' · Sheet ' + text(row.sheetNumber) + ' · Offcut ' + (index + 1);
        if (proposal.approved === false) {
          if (proposals.has(key)) throw new Error('Conflicting offcut retention decisions for ' + reference + '. Panels on one physical sheet must share each offcut decision.');
          rejected.add(key);
          return;
        }
        var size = proposalSize(proposal);
        if (!size) return;
        if (rejected.has(key)) throw new Error('Conflicting offcut retention decisions for ' + reference + '. Panels on one physical sheet must share each offcut decision.');
        var previous = proposedSizes.get(key);
        if (previous && (previous.length !== size.length || previous.width !== size.width)) throw new Error('Conflicting offcut dimensions for ' + reference + '. Panels on one physical sheet must share the same offcut size.');
        proposedSizes.set(key, size);
        if (!proposals.has(key)) proposals.set(key, proposal);
      });
    });
    (Array.isArray(existing) ? existing : []).forEach(function (row) {
      if (!row || row.status === 'completed') return;
      rowProposals(row).forEach(function (proposal, index) {
        if (!proposal) return;
        var key = proposalKey(row, index);
        if (!identities.has(key) && text(proposal.labelSku) && text(proposal.labelOffcutId)) {
          identities.set(key, { labelSku: proposal.labelSku, labelOffcutId: proposal.labelOffcutId });
          identitySpecs.set(key, proposalFingerprint(row, proposal, options));
        }
      });
    });
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      if (!row || row.status === 'completed') return row;
      var list = rowProposals(row), count = sheetCounts.get(sheetKey(row)) || 0, next = [], changed = false;
      for (var index = 0; index < count; index++) {
        var key = proposalKey(row, index), proposal = list[index] || proposals.get(key), identity = identities.get(key), size = proposalSize(proposal);
        if (!proposal) continue;
        if (proposal.approved === false || !size) { next.push(proposal); continue; }
        var spec = proposalSpec(row, proposal, options), fingerprint = proposalFingerprint(row, proposal, options);
        var stale = (identitySpecs.has(key) && identitySpecs.get(key) !== fingerprint) ||
          (identity && !matchesLiveIdentity(identity, spec, size, options)) ||
          ((text(proposal.labelSku) || text(proposal.labelOffcutId)) && !matchesLiveIdentity(proposal, spec, size, options));
        if (stale) identity = null;
        if (spec && stockIdentities.has(spec)) identity = stockIdentities.get(spec);
        if (!identity) {
          var embeddedSku = stale ? '' : text(proposal.labelSku), embeddedId = stale ? '' : text(proposal.labelOffcutId);
          if ((!embeddedSku && typeof options.genSku !== 'function') || (!embeddedId && typeof options.uid !== 'function')) throw new Error('Provide uid and genSku to identify scheduled offcuts.');
          identity = { labelSku: embeddedSku || options.genSku(), labelOffcutId: embeddedId || options.uid() };
        }
        identities.set(key, identity); identitySpecs.set(key, fingerprint);
        if (spec) stockIdentities.set(spec, identity);
        var value = Object.assign({}, proposal, identity, { length: size.length, width: size.width, approved: true, status: 'pending' });
        if (proposalOrder(proposal) === 'sheet') value.dimensionOrder = 'sheet';
        next.push(value); changed = true;
      }
      if (!changed) return Array.isArray(row.pendingOffcuts) && row.pendingOffcut !== (next[0] || null) ? Object.assign({}, row, { pendingOffcuts: next, pendingOffcut: next[0] || null }) : row;
      return Object.assign({}, row, { pendingOffcuts: next, pendingOffcut: next[0] || null });
    });
  }
  function collectScheduled(rows, stock) {
    stock = stock || {};
    var seen = new Set(), labels = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || row.status === 'completed' || !text(row.orderNumber) || !text(row.sheetNumber)) return;
      var list = rowProposals(row);
      list.forEach(function (proposal, index) {
      if (!proposal || proposal.approved === false) return;
      var size = proposalSize(proposal), key = proposalKey(row, index);
      if (!size || seen.has(key)) return;
      var item = sourceStock(row, stock) || {};
      labels.push({
        material: text(item.material || proposal.material || row.material),
        color: text(item.color || item.colour || proposal.color || row.color || row.colour),
        thickness: positive(item.thickness || proposal.thickness || row.thickness),
        length: size.length, width: size.width,
        dimensionOrder: proposalOrder(proposal), proposalIndex: index,
        job: text(row.jobReference), order: text(row.orderNumber), sheet: text(row.sheetNumber),
        sku: text(proposal.labelSku) || stableReference(row, index, list.length), provisional: true
      });
      seen.add(key);
      });
    });
    return labels;
  }
  function collectForCnc(rows, stock) {
    stock = stock || {};
    var sheets = new Map(), labels = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || !text(row.orderNumber) || !text(row.sheetNumber) || (row.status && row.status !== 'pending' && row.status !== 'completed')) return;
      var key = sheetKey(row);
      if (!sheets.has(key)) sheets.set(key, []);
      sheets.get(key).push(row);
    });
    sheets.forEach(function (panels) {
      // A completed sheet's recorded decision replaces its old proposals,
      // including proposals left on a sibling that was not completed with it.
      var completed = panels.filter(function (row) {
        return row.status === 'completed' && (row.offcutOutcome != null || Array.isArray(row.savedOffcuts) || row.offcutDetails);
      });
      if (completed.length) {
        if (completed.some(function (row) {
          return (row.offcutOutcome && row.offcutOutcome !== 'confirmed') || (Array.isArray(row.savedOffcuts) && !row.savedOffcuts.length);
        })) return;
        var saved = new Map();
        completed.forEach(function (row) {
          var list = Array.isArray(row.savedOffcuts) ? row.savedOffcuts : row.offcutDetails ? [row.offcutDetails] : [];
          if (list.length > 20) throw new Error('A physical CNC sheet can retain at most 20 offcuts.');
          list.forEach(function (piece, index) {
            if (!piece || piece.approved === false) return;
            var status = text(piece.status).toLowerCase();
            if (status && status !== 'confirmed' && status !== 'saved' && status !== 'retained') return;
            var size = proposalSize(piece);
            if (!size || saved.has(index)) return;
            // Use the retained-piece snapshot, not a possibly edited or removed
            // stock line and never the dimensions/identity of the old proposal.
            saved.set(index, {
              material: text(piece.material), color: text(piece.color || piece.colour), thickness: positive(piece.thickness),
              length: size.length, width: size.width, dimensionOrder: proposalOrder(piece), proposalIndex: index,
              job: text(row.jobReference), order: text(row.orderNumber), sheet: text(row.sheetNumber),
              sku: text(piece.stockSku || piece.sku || piece.labelSku), provisional: false
            });
          });
        });
        saved.forEach(function (label) { labels.push(label); });
        return;
      }
      var declined = new Set(), pending = panels.filter(function (row) { return row.status !== 'completed'; });
      function approved(proposal) {
        var status = text(proposal && proposal.status).toLowerCase();
        return proposal && proposal.approved !== false && (!status || status === 'pending');
      }
      pending.forEach(function (row) {
        rowProposals(row).forEach(function (proposal, index) {
          if (proposal && !approved(proposal)) declined.add(index);
        });
      });
      var printable = pending.map(function (row) {
        return Object.assign({}, row, { pendingOffcuts: rowProposals(row).map(function (proposal, index) {
          return !declined.has(index) && approved(proposal) ? proposal : null;
        }) });
      });
      labels.push.apply(labels, collectScheduled(printable, stock));
    });
    return labels;
  }
  function countForCnc(rows, stock) { return collectForCnc(rows, stock).length; }
  function fromItem(item) {
    if (!item) return null;
    var size = dimensions(item.width, item.height, item.dimensionOrder);
    var profile = [positive(item.lengthMm) ? number(item.lengthMm) + ' mm long' : '', text(item.dimensions || item.details)].filter(Boolean).join(' · ');
    if (!size && !profile) return null;
    return Object.assign({
      material: text(item.material || item.name), color: text(item.color || item.colour), thickness: positive(item.thickness),
      dimensionText: size ? '' : profile, dimensionOrder: item.dimensionOrder === 'sheet' ? 'sheet' : undefined, sku: text(item.sku || item.id),
      job: text(item.sourceJobReference || item.jobReference), order: text(item.sourceOrderNumber),
      sheet: text(item.sourceSheetNumber), provisional: false
    }, size || {});
  }
  function getDefaultSize() {
    // The approved label size replaces any older saved paper preference.
    return '50x30';
  }
  function setDefaultSize(size) {
    if (text(size).toLowerCase().replace(/\s/g, '').replace('×', 'x') !== '50x30') throw new Error('Offcut labels use 50 × 30 mm paper.');
    try { if (root.localStorage) root.localStorage.setItem(preferenceKey, '50x30'); } catch (_) {}
    return '50x30';
  }
  function readyLabels(labels, options) {
    var copies = options.copies === undefined ? 1 : Number(options.copies);
    if (!Number.isSafeInteger(copies) || copies < 1 || copies > 100) throw new Error('Choose between 1 and 100 label copies.');
    var result = [];
    (Array.isArray(labels) ? labels : labels ? [labels] : []).forEach(function (label) {
      if (!label) return;
      var size = dimensions(label.length, label.width, label.dimensionOrder);
      if (!size && !text(label.dimensionText)) return;
      for (var copy = 0; copy < copies; copy++) result.push(Object.assign({}, label, size || {}));
    });
    return result;
  }
  function fitLabels(document) {
    // Keep short fields prominent. Long descriptions stop at 8 pt and use an
    // explicit ellipsis; their complete text remains available in the preview.
    Array.prototype.forEach.call(document.querySelectorAll('.label-line'), function (node) {
      if (!node._offcutLabelText) node._offcutLabelText = node.textContent;
      if (!node._offcutLabelFontSize) node._offcutLabelFontSize = parseFloat(document.defaultView.getComputedStyle(node).fontSize);
      var original = node._offcutLabelText, size = node._offcutLabelFontSize, minimum = 8 * 96 / 72;
      node.textContent = original;
      node.setAttribute('title', original);
      node.style.fontSize = size + 'px';
      while (node.scrollWidth > node.clientWidth + 0.5 && size > minimum) {
        size = Math.max(minimum, size - 0.25 * 96 / 72);
        node.style.fontSize = size + 'px';
      }
      if (node.scrollWidth > node.clientWidth + 0.5) {
        var first = 0, last = original.length;
        while (first < last) {
          var middle = Math.ceil((first + last) / 2);
          node.textContent = original.slice(0, middle) + '…';
          if (node.scrollWidth <= node.clientWidth + 0.5) first = middle;
          else last = middle - 1;
        }
        node.textContent = original.slice(0, first) + '…';
      }
    });
  }
  function buildPdfBytes(images) {
    if (!Array.isArray(images) || !images.length) throw new Error('There are no offcut labels to download.');
    var parts = [], offsets = [0], length = 0, pageWidth = '141.732283', pageHeight = '85.039370';
    function append(value) {
      var bytes = typeof value === 'string' ? Uint8Array.from(value, function (character) { return character.charCodeAt(0); }) : value;
      parts.push(bytes); length += bytes.length;
    }
    function object(id, content) { offsets[id] = length; append(id + ' 0 obj\n' + content + '\nendobj\n'); }
    append('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None /PickTrayByPDFSize true >> >>');
    object(2, '<< /Type /Pages /Count ' + images.length + ' /Kids [' + images.map(function (_, index) { return (3 + index * 3) + ' 0 R'; }).join(' ') + '] >>');
    images.forEach(function (image, index) {
      if (!image || !(image.bytes instanceof Uint8Array) || !image.bytes.length || !Number.isSafeInteger(image.width) || image.width < 1 || !Number.isSafeInteger(image.height) || image.height < 1) throw new Error('The offcut label image could not be prepared.');
      var page = 3 + index * 3, content = page + 1, picture = page + 2;
      object(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight + '] /CropBox [0 0 ' + pageWidth + ' ' + pageHeight + '] /Resources << /XObject << /Label ' + picture + ' 0 R >> >> /Contents ' + content + ' 0 R >>');
      var commands = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Label Do\nQ\n';
      object(content, '<< /Length ' + commands.length + ' >>\nstream\n' + commands + 'endstream');
      offsets[picture] = length;
      append(picture + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + image.width + ' /Height ' + image.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + image.bytes.length + ' >>\nstream\n');
      append(image.bytes); append('\nendstream\nendobj\n');
    });
    var start = length, count = 3 + images.length * 3;
    append('xref\n0 ' + count + '\n0000000000 65535 f \n');
    for (var id = 1; id < count; id++) append(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    append('trailer\n<< /Size ' + count + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n');
    var result = new Uint8Array(length), position = 0;
    parts.forEach(function (part) { result.set(part, position); position += part.length; });
    return result;
  }
  function renderPdf(document) {
    fitLabels(document);
    var view = document.defaultView, images = [];
    Array.prototype.forEach.call(document.querySelectorAll('.label'), function (label) {
      // 1000 x 600 pixels keeps the 5:3 ratio and gives sharp text at 508 dpi.
      var canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
      var context = canvas.getContext('2d'), bounds = label.getBoundingClientRect();
      if (!context || !bounds.width || !bounds.height) throw new Error('The label preview is not ready. Try downloading again.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(canvas.width / bounds.width, canvas.height / bounds.height);
      context.textAlign = 'center'; context.textBaseline = 'middle';
      Array.prototype.forEach.call(label.querySelectorAll('.label-line'), function (line) {
        var style = view.getComputedStyle(line), rectangle = line.getBoundingClientRect();
        context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
        context.fillStyle = style.color;
        context.fillText(line.textContent, rectangle.left - bounds.left + rectangle.width / 2, rectangle.top - bounds.top + rectangle.height / 2);
      });
      var binary = view.atob(canvas.toDataURL('image/jpeg', 0.98).split(',')[1]);
      images.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(binary, function (character) { return character.charCodeAt(0); })});
    });
    return buildPdfBytes(images);
  }
  function downloadPdf(document) {
    var view = document.defaultView, bytes = renderPdf(document), blob = new view.Blob([bytes], {type:'application/pdf'});
    var url = view.URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'Offcut-labels-50x30mm.pdf'; link.target = '_blank'; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    // Mobile PDF viewers need the Blob URL after the click has returned.
    view.setTimeout(function () { view.URL.revokeObjectURL(url); }, 60000);
    return {url:url,bytes:bytes};
  }
  function buildDocument(labels, options) {
    options = options || {};
    var list = readyLabels(labels, options);
    if (!list.length) throw new Error('There are no offcut labels to print.');
    var pages = list.map(function (label) {
      var material = text(label.material) || 'Material not recorded';
      var specification = (positive(label.thickness) ? number(label.thickness) + ' mm · ' : '') + material;
      var dimensionText = label.dimensionText || formatDimensions(label.length, label.width, label.dimensionOrder).replace(/,/g, '');
      return '<article class="label" aria-label="Offcut label">' +
        '<div class="label-line dimensions">' + escapeHtml(dimensionText) + '</div>' +
        '<div class="label-line material">' + escapeHtml(specification) + '</div>' +
        '<div class="label-line finish">' + escapeHtml(label.color || 'Finish not recorded') + '</div></article>';
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Offcut labels</title><style>' +
      '@page{size:50mm 30mm;margin:0}*{box-sizing:border-box}body{margin:0;color:#101820;background:#e7e9ec;font-family:Arial,Helvetica,sans-serif}' +
      '.toolbar{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;background:#fff;padding:14px;border-bottom:1px solid #b8bec5;font-size:14px}.toolbar button{padding:9px 22px;background:#123e50;border:1px solid #123e50;border-radius:4px;color:white;font:inherit;cursor:pointer}.toolbar p{flex-basis:100%;text-align:center;margin:0;color:#475569;font-size:12px}' +
      '.label{width:50mm;height:30mm;padding:2mm;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2.3mm;text-align:center;background:white;margin:6mm auto;break-after:page;page-break-after:always;overflow:hidden}' +
      '.label:last-child{break-after:auto;page-break-after:auto}.label-line{width:100%;flex-shrink:0;line-height:1.12;white-space:nowrap;text-align:center}.dimensions{font-size:17pt;font-weight:700}.material{font-size:12.4pt}.finish{font-size:13pt}' +
      '@media print{html,body{width:50mm;margin:0;background:white}.toolbar{display:none}.label{margin:0;box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
      '</style></head><body><nav class="toolbar" aria-label="Print controls"><strong>50 × 30 mm · ' + list.length + ' label' + (list.length === 1 ? '' : 's') + '</strong>' +
      '<button type="button" id="download-labels">Download 50 × 30 mm PDF</button><button type="button" id="print-labels">Print from browser</button><p>On your phone, download the PDF and open or share it in your label-printer app. Each PDF page is 50 × 30 mm. A phone print dialog may default to A4; select matching 50 × 30 mm label media and Actual size / 100%. Browser printing cannot set your printer paper size.</p><p>Long descriptions may be shortened with an ellipsis to keep the label readable. Hover over a line to view its full text.</p></nav>' + pages +
      '<script>' + fitLabels.toString() + ';' + buildPdfBytes.toString() + ';' + renderPdf.toString() + ';' + downloadPdf.toString() + ';fitLabels(document);document.getElementById("download-labels").onclick=function(){try{downloadPdf(document);}catch(error){window.alert(error.message||"The label PDF could not be downloaded.");}};window.addEventListener("beforeprint",function(){fitLabels(document);});document.getElementById("print-labels").onclick=function(){fitLabels(document);window.focus();window.print();};try{localStorage.setItem("' + preferenceKey + '","50x30");}catch(e){}<\/script></body></html>';
  }
  function print(labels, options) {
    options = options || {};
    var html = buildDocument(labels, options), popup;
    try { popup = root.open('', '_blank'); } catch (_) {}
    if (!popup) {
      var message = 'The offcut label window was blocked. Allow pop-ups for PanelStock, then select Print offcut label again.';
      if (typeof options.onError === 'function') options.onError(message);
      else if (typeof root.alert === 'function') root.alert(message);
      return { ok: false, reason: 'popup-blocked', message: message };
    }
    popup.document.open(); popup.document.write(html); popup.document.close();
    setDefaultSize('50x30');
    try { popup.focus(); if (options.autoPrint === true) popup.print(); } catch (_) {
      // The visible toolbar remains available if this browser delays printing.
    }
    return { ok: true, window: popup };
  }
  return { prepareScheduled: prepareScheduled, collectScheduled: collectScheduled, collectForCnc: collectForCnc, countForCnc: countForCnc, fromItem: fromItem, formatDimensions: formatDimensions, escapeHtml: escapeHtml,
    buildDocument: buildDocument, buildPdfBytes: buildPdfBytes, renderPdf: renderPdf, downloadPdf: downloadPdf, fitLabels: fitLabels, print: print, getDefaultSize: getDefaultSize, setDefaultSize: setDefaultSize };
});
