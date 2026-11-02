// Generated from tab-workspace.modern.js for the supported browser entry points.
"use strict";

function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t.return || t.return(); } finally { if (u) throw o; } } }; }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i.return) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
(function (root, factory) {
  var api = factory();
  if ((typeof module === "undefined" ? "undefined" : _typeof(module)) === 'object' && module.exports) module.exports = api;
  root.PanelStockWorkspaces = api;
})((typeof window === "undefined" ? "undefined" : _typeof(window)) === 'object' ? window : globalThis, function () {
  'use strict';

  function hold(locks, name) {
    return new Promise(function (resolve, reject) {
      var request;
      request = locks.request(name, {
        ifAvailable: true
      }, function (lock) {
        if (!lock) {
          resolve(null);
          return;
        }
        return new Promise(function (done) {
          return resolve({
            release: function release() {
              done();
              return Promise.resolve(request);
            }
          });
        });
      });
      Promise.resolve(request).catch(reject);
    });
  }
  // Each page owns a durable workspace. A short selection lock prevents two
  // pages from recovering the same closed page's pending work at startup.
  function acquire(_x) {
    return _acquire.apply(this, arguments);
  }
  function _acquire() {
    _acquire = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(_ref) {
      var locks, storage, sessionStorage, key, legacyLock, owner, read, _ref$uuid, uuid, registryKey, tabKey;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            locks = _ref.locks, storage = _ref.storage, sessionStorage = _ref.sessionStorage, key = _ref.key, legacyLock = _ref.legacyLock, owner = _ref.owner, read = _ref.read, _ref$uuid = _ref.uuid, uuid = _ref$uuid === void 0 ? function () {
              return crypto.randomUUID();
            } : _ref$uuid;
            if (locks) {
              _context3.n = 1;
              break;
            }
            throw Error('This browser cannot coordinate saved changes. Use an up-to-date browser.');
          case 1:
            registryKey = key + ':workspaces', tabKey = key + ':workspace';
            return _context3.a(2, locks.request(legacyLock + ':workspace-selection', {
              mode: 'exclusive'
            }, /*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
              var keys, valid, preferred, candidates, lockName, claim, _iterator, _step, _value, selected, _iterator2, _step2, _value2, _selected, attempt, value, lease, _t2, _t3, _t4, _t5;
              return _regenerator().w(function (_context2) {
                while (1) switch (_context2.p = _context2.n) {
                  case 0:
                    _context2.p = 0;
                    keys = JSON.parse(storage.getItem(registryKey) || '[]');
                    _context2.n = 2;
                    break;
                  case 1:
                    _context2.p = 1;
                    _t2 = _context2.v;
                    throw Error('Saved workspaces could not be read. Keep existing pages open and retry.');
                  case 2:
                    if (Array.isArray(keys)) {
                      _context2.n = 3;
                      break;
                    }
                    throw Error('Saved workspaces could not be read.');
                  case 3:
                    valid = function valid(value) {
                      return value === key || typeof value === 'string' && value.startsWith(key + ':tab:') && /^[a-zA-Z0-9-]{16,100}$/.test(value.slice(key.length + 5));
                    };
                    keys = _toConsumableArray(new Set([key].concat(_toConsumableArray(keys.filter(valid)))));
                    preferred = sessionStorage.getItem(tabKey), candidates = valid(preferred) ? [preferred].concat(_toConsumableArray(keys.filter(function (value) {
                      return value !== preferred;
                    }))) : keys;
                    lockName = function lockName(value) {
                      return value === key ? legacyLock : legacyLock + ':' + value.slice(key.length + 5);
                    };
                    claim = /*#__PURE__*/function () {
                      var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(value, recover) {
                        var lease, _state$queue, raw, state, pending, _t;
                        return _regenerator().w(function (_context) {
                          while (1) switch (_context.p = _context.n) {
                            case 0:
                              _context.n = 1;
                              return hold(locks, lockName(value));
                            case 1:
                              lease = _context.v;
                              if (lease) {
                                _context.n = 2;
                                break;
                              }
                              return _context.a(2, null);
                            case 2:
                              _context.p = 2;
                              _context.n = 3;
                              return read(value);
                            case 3:
                              raw = _context.v;
                              if (!(raw === undefined)) {
                                _context.n = 5;
                                break;
                              }
                              _context.n = 4;
                              return lease.release();
                            case 4:
                              return _context.a(2, null);
                            case 5:
                              state = raw ? JSON.parse(raw) : null, pending = !!(state !== null && state !== void 0 && (_state$queue = state.queue) !== null && _state$queue !== void 0 && _state$queue.length || state !== null && state !== void 0 && state.draft);
                              if (!(pending && owner && state.owner && state.owner !== owner || recover && !pending)) {
                                _context.n = 7;
                                break;
                              }
                              _context.n = 6;
                              return lease.release();
                            case 6:
                              return _context.a(2, null);
                            case 7:
                              sessionStorage.setItem(tabKey, value);
                              storage.setItem(registryKey, JSON.stringify(keys));
                              return _context.a(2, {
                                key: value,
                                release: lease.release
                              });
                            case 8:
                              _context.p = 8;
                              _t = _context.v;
                              _context.n = 9;
                              return lease.release();
                            case 9:
                              throw _t;
                            case 10:
                              return _context.a(2);
                          }
                        }, _callee, null, [[2, 8]]);
                      }));
                      return function claim(_x2, _x3) {
                        return _ref3.apply(this, arguments);
                      };
                    }(); // Recover this page after reload, or orphaned pending changes, first.
                    _iterator = _createForOfIteratorHelper(candidates);
                    _context2.p = 4;
                    _iterator.s();
                  case 5:
                    if ((_step = _iterator.n()).done) {
                      _context2.n = 8;
                      break;
                    }
                    _value = _step.value;
                    _context2.n = 6;
                    return claim(_value, true);
                  case 6:
                    selected = _context2.v;
                    if (!selected) {
                      _context2.n = 7;
                      break;
                    }
                    return _context2.a(2, selected);
                  case 7:
                    _context2.n = 5;
                    break;
                  case 8:
                    _context2.n = 10;
                    break;
                  case 9:
                    _context2.p = 9;
                    _t3 = _context2.v;
                    _iterator.e(_t3);
                  case 10:
                    _context2.p = 10;
                    _iterator.f();
                    return _context2.f(10);
                  case 11:
                    // Reuse an idle workspace once all recoverable pending work is checked.
                    _iterator2 = _createForOfIteratorHelper(candidates);
                    _context2.p = 12;
                    _iterator2.s();
                  case 13:
                    if ((_step2 = _iterator2.n()).done) {
                      _context2.n = 16;
                      break;
                    }
                    _value2 = _step2.value;
                    _context2.n = 14;
                    return claim(_value2, false);
                  case 14:
                    _selected = _context2.v;
                    if (!_selected) {
                      _context2.n = 15;
                      break;
                    }
                    return _context2.a(2, _selected);
                  case 15:
                    _context2.n = 13;
                    break;
                  case 16:
                    _context2.n = 18;
                    break;
                  case 17:
                    _context2.p = 17;
                    _t4 = _context2.v;
                    _iterator2.e(_t4);
                  case 18:
                    _context2.p = 18;
                    _iterator2.f();
                    return _context2.f(18);
                  case 19:
                    attempt = 0;
                  case 20:
                    if (!(attempt < 16)) {
                      _context2.n = 26;
                      break;
                    }
                    value = key + ':tab:' + uuid();
                    if (!(keys.includes(value) || !valid(value))) {
                      _context2.n = 21;
                      break;
                    }
                    return _context2.a(3, 25);
                  case 21:
                    _context2.n = 22;
                    return hold(locks, lockName(value));
                  case 22:
                    lease = _context2.v;
                    if (lease) {
                      _context2.n = 23;
                      break;
                    }
                    return _context2.a(3, 25);
                  case 23:
                    _context2.p = 23;
                    keys.push(value);
                    storage.setItem(registryKey, JSON.stringify(keys));
                    sessionStorage.setItem(tabKey, value);
                    return _context2.a(2, {
                      key: value,
                      release: lease.release
                    });
                  case 24:
                    _context2.p = 24;
                    _t5 = _context2.v;
                    lease.release();
                    throw _t5;
                  case 25:
                    attempt++;
                    _context2.n = 20;
                    break;
                  case 26:
                    throw Error('A separate workspace could not be opened. Retry this page.');
                  case 27:
                    return _context2.a(2);
                }
              }, _callee2, null, [[23, 24], [12, 17, 18, 19], [4, 9, 10, 11], [0, 1]]);
            }))));
        }
      }, _callee3);
    }));
    return _acquire.apply(this, arguments);
  }
  function scopedStorage(storage, key, workspace) {
    var prefixes = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
    var mapped = function mapped(name) {
      return name === key ? workspace : workspace !== key && prefixes.some(function (prefix) {
        return name.startsWith(prefix);
      }) ? name + ':workspace:' + workspace.slice(key.length + 5) : name;
    };
    return {
      getItem: function getItem(name) {
        return storage.getItem(mapped(name));
      },
      setItem: function setItem(name, value) {
        return storage.setItem(mapped(name), value);
      },
      removeItem: function removeItem(name) {
        return storage.removeItem(mapped(name));
      }
    };
  }
  return {
    acquire: acquire,
    scopedStorage: scopedStorage
  };
});
