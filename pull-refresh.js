/* Shared touch refresh. Refresh data in place; never reload the document. */
(function (root) {
  'use strict';
  if (root.PanelStockPullRefresh) return;
  var doc = root.document, subscriptions = [], current = null, threshold = 88;
  var passiveSupported = false;
  try {
    var probe = Object.defineProperty({}, 'passive', { get: function () { passiveSupported = true; } });
    var noop = function () {};
    root.addEventListener('ps-passive-test', noop, probe); root.removeEventListener('ps-passive-test', noop, probe);
  } catch (_) {}
  var ignored = 'input,textarea,select,button,a,canvas,dialog,summary,[contenteditable],[data-photo-gesture],[data-pull-refresh-ignore]';
  function visible(el) { return !!el && !!el.getClientRects().length; }
  function matches(el, selector) { var fn = el && (el.matches || el.webkitMatchesSelector); return !!fn && fn.call(el, selector); }
  function editing(allowForms, allowFiles) {
    var selector = 'dialog[open],[aria-modal="true"],[role="dialog"],.photo-editor-screen,[class~="fixed"][class~="inset-0"]';
    if (!allowForms) selector += ',form,textarea';
    var elements = doc.querySelectorAll(selector);
    for (var i = 0; i < elements.length; i++) if (visible(elements[i])) return true;
    var files = allowFiles ? [] : doc.querySelectorAll('input[type="file"]');
    for (var j = 0; j < files.length; j++) if (visible(files[j]) && files[j].files && files[j].files.length) return true;
    return false;
  }
  function atTop(scrollRoot) {
    var el = scrollRoot || doc.scrollingElement || doc.documentElement;
    return Math.max(el.scrollTop || 0, scrollRoot ? 0 : root.scrollY || 0) <= 3 && (!root.visualViewport || root.visualViewport.scale <= 1.05);
  }
  function targetAllowed(target, scrollRoot) {
    for (var el = target && (target.nodeType === 3 ? target.parentElement : target); el && el !== doc; el = el.parentElement) {
      if (matches(el, ignored)) return false;
      if (el !== scrollRoot && el !== doc.body && el !== doc.documentElement && el.scrollHeight > el.clientHeight + 2) {
        var overflow = root.getComputedStyle(el).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') return false;
      }
    }
    return true;
  }
  function mount(options) {
    if (current) current.destroy();
    options = options || {};
    var state = { running: false, gesture: null, destroyed: false }, timer = null;
    var el = doc.createElement('div'), icon = doc.createElement('span'), label = doc.createElement('span');
    el.className = 'ps-pull-refresh'; el.hidden = true;
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    icon.className = 'ps-pull-refresh-icon'; icon.textContent = '↻'; icon.setAttribute('aria-hidden', 'true');
    label.textContent = 'Pull down to refresh'; el.appendChild(icon); el.appendChild(label); doc.body.appendChild(el);
    if (!doc.getElementById('ps-pull-refresh-style')) {
      var style = doc.createElement('style'); style.id = 'ps-pull-refresh-style';
      style.textContent = '.ps-pull-refresh{position:fixed;z-index:9999;top:12px;top:calc(12px + env(safe-area-inset-top,0px));left:50%;display:flex;align-items:center;gap:9px;max-width:calc(100% - 32px);padding:11px 16px;border:1px solid #c5dce3;border-radius:999px;background:#fff;color:#155e75;box-shadow:0 3px 14px #17303922;font:600 13px/1.4 system-ui,sans-serif;pointer-events:none;transform:translateX(-50%)}.ps-pull-refresh[hidden]{display:none}.ps-pull-refresh-icon{display:inline-block;font-size:20px;line-height:1}.ps-pull-refresh.is-running .ps-pull-refresh-icon{animation:ps-refresh-spin .9s linear infinite}@keyframes ps-refresh-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.ps-pull-refresh.is-running .ps-pull-refresh-icon{animation:none}}';
      doc.head.appendChild(style);
    }
    var oldOverscroll = doc.documentElement.style.overscrollBehaviorY;
    doc.documentElement.style.overscrollBehaviorY = 'none';
    function scroller() { return options.scrollRoot ? options.scrollRoot() : null; }
    function enabled() { return !state.destroyed && !doc.hidden && (!options.enabled || options.enabled()); }
    function paint(text, distance) {
      if (state.destroyed) return;
      el.hidden = false; label.textContent = text;
      el.classList.toggle('is-running', state.running);
      el.style.opacity = distance === undefined ? '1' : String(Math.min(1, distance / threshold));
      el.style.transform = 'translate(-50%,' + (distance === undefined ? 0 : Math.min(12, -24 + distance * .4)) + 'px)';
    }
    function hide() { if (!state.destroyed && !state.running) el.hidden = true; }
    function notice(text) { root.clearTimeout(timer); paint(text); timer = root.setTimeout(hide, 2200); }
    function cancel() { state.gesture = null; hide(); }
    function run() {
      if (state.running || !enabled()) return Promise.resolve(false);
      if (editing(options.allowForms, options.allowFiles)) { notice('Save or close the form before refreshing.'); return Promise.resolve(false); }
      var allowed = options.canRefresh ? options.canRefresh() : true;
      if (allowed !== true && allowed !== undefined) { notice(typeof allowed === 'string' ? allowed : 'Wait for the current operation to finish.'); return Promise.resolve(false); }
      if (root.navigator.onLine === false) { notice('You’re offline. Saved work is kept.'); return Promise.resolve(false); }
      state.running = true; root.clearTimeout(timer); paint('Refreshing…');
      var callbacks = subscriptions.slice();
      if (options.refresh) callbacks.unshift(options.refresh);
      return Promise.all(callbacks.map(function (refresh) {
        return Promise.resolve().then(refresh).then(function (value) { return value !== false && value !== null; }, function () { return false; });
      })).then(function (results) {
        var ok = results.every(function (value) { return value; });
        state.running = false;
        if (enabled()) { notice(ok ? 'Up to date' : 'Could not refresh. Your work is kept.'); if (ok) { root.clearTimeout(timer); timer = root.setTimeout(hide, 650); } }
        return ok;
      });
    }
    function start(event) {
      if (state.running) return;
      cancel();
      if (event.touches.length !== 1 || !enabled() || !atTop(scroller()) || !targetAllowed(event.target, scroller())) return;
      var touch = event.touches[0]; state.gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0, locked: false };
    }
    function move(event) {
      var gesture = state.gesture;
      if (!gesture) return;
      if (event.touches.length !== 1 || !enabled() || !atTop(scroller())) { cancel(); return; }
      var touch = event.touches[0], dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
      if (touch.identifier !== gesture.id) { cancel(); return; }
      if (!gesture.locked) {
        if (dy < -8 || Math.abs(dx) > 12 && Math.abs(dx) >= Math.abs(dy)) { cancel(); return; }
        if (dy < 12) return;
        if (dy < Math.abs(dx) * 1.5) { cancel(); return; }
        gesture.locked = true;
      }
      if (!event.cancelable) { cancel(); return; }
      event.preventDefault(); gesture.distance = Math.max(0, dy);
      paint(gesture.distance >= threshold ? 'Release to refresh' : 'Pull down to refresh', gesture.distance);
    }
    function end(event) {
      var gesture = state.gesture;
      if (!gesture) return;
      if (event.changedTouches && !Array.prototype.some.call(event.changedTouches, function (touch) { return touch.identifier === gesture.id; })) return;
      var trigger = gesture.locked && gesture.distance >= threshold;
      cancel(); if (trigger) run();
    }
    function visibility() { if (doc.hidden) cancel(); }
    var passive = passiveSupported ? { passive: true } : false, active = passiveSupported ? { passive: false } : false;
    doc.addEventListener('touchstart', start, passive);
    doc.addEventListener('touchmove', move, active);
    doc.addEventListener('touchend', end, passive);
    doc.addEventListener('touchcancel', cancel, passive);
    doc.addEventListener('visibilitychange', visibility);
    root.addEventListener('pagehide', cancel);
    state.run = run;
    state.destroy = function () {
      if (state.destroyed) return;
      state.destroyed = true; root.clearTimeout(timer);
      doc.removeEventListener('touchstart', start, passive); doc.removeEventListener('touchmove', move, active);
      doc.removeEventListener('touchend', end, passive); doc.removeEventListener('touchcancel', cancel, passive);
      doc.removeEventListener('visibilitychange', visibility); root.removeEventListener('pagehide', cancel);
      if (el.parentNode) el.parentNode.removeChild(el);
      doc.documentElement.style.overscrollBehaviorY = oldOverscroll;
      if (current === state) current = null;
    };
    current = state; return state.destroy;
  }
  root.PanelStockPullRefresh = {
    mount: mount,
    subscribe: function (refresh) { subscriptions.push(refresh); return function () { var i = subscriptions.indexOf(refresh); if (i >= 0) subscriptions.splice(i, 1); }; },
    run: function () { return current ? current.run() : Promise.resolve(false); }
  };
})(window);
