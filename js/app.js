/* Veritas Chambers — one classic script (works from file:// and http://).
   Every screen uses a canvas image-sequence scrubbed by scroll:
   portrait frames on phones/portrait, landscape frames on laptops/desktops.
   Neighbouring frames are cross-blended so motion stays continuous. */
(function () {
  'use strict';
  var COMPACT_AT = .04, DRIFT_TAU = .32, DRIFT = [8, 5], GRAIN_FPS = 6, PHONE = 700;
  var SEQ_DPR = 1.5, SEQ_TAU = .07, CONCURRENCY = 4, BLEND_STEPS = 16;
  var SETS = { p: { dir: 'seq', n: 108 }, l: { dir: 'seq-l', n: 108 } };
  var NAMES = ['chambers', 'court', 'brief'];
  var FOCUS_Y = { p: [.5, .5, .5], l: [.3, .5, .5] };   // vertical crop focus per scene (cover-fit)
  var clamp = function (n, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, n)); };
  var smooth = function (t) { t = clamp(t); return t * t * (3 - 2 * t); };
  var force = /[?&]motion/.test(location.search);
  var mq = matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () { return mq.matches && !force; };
  var portraitSet = function () { return innerWidth <= 900 || innerHeight > innerWidth; };
  if (force) document.documentElement.classList.add('force-motion');

  function sequence(scene, name, set, fy, dirty) {
    var cv = document.createElement('canvas'); cv.className = 'seq-canvas'; cv.setAttribute('aria-hidden', 'true');
    scene.appendChild(cv);
    var ctx = cv.getContext('2d', { alpha: false }), n = SETS[set].n, dir = SETS[set].dir;
    var frames = new Array(n), key = '', cw = 1, ch = 1, started = false, qi = 0, active = 0, order = [], seen = {}, i;
    function size() {
      var r = scene.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, SEQ_DPR);
      cw = cv.width = Math.max(1, Math.round(r.width * d)); ch = cv.height = Math.max(1, Math.round(r.height * d)); key = '';
    }
    function near(k) { var j = k; while (j >= 0 && !frames[j]) j--; if (j >= 0) return j; j = k; while (j < n && !frames[j]) j++; return j < n ? j : -1; }
    function paint(im, alpha) {
      var s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
      ctx.globalAlpha = alpha; ctx.drawImage(im, (cw - w) / 2, (ch - h) * fy, w, h);
    }
    function show(p) {
      var f = clamp(p) * (n - 1), a = Math.floor(f), t = Math.round((f - a) * BLEND_STEPS) / BLEND_STEPS;
      if (a >= n - 1) { a = n - 1; t = 0; }
      var ka = near(a), kb = t > 0 ? near(a + 1) : -1; if (ka < 0) return;
      var k = ka + '|' + kb + '|' + t; if (k === key) return; key = k;
      paint(frames[ka], 1);
      if (kb >= 0 && kb !== ka && t > 0) paint(frames[kb], t);
      ctx.globalAlpha = 1;
      if (!scene.classList.contains('live')) scene.classList.add('live');
    }
    [8, 4, 2, 1].forEach(function (st) { for (i = 0; i < n; i += st) if (!seen[i]) { seen[i] = 1; order.push(i); } });   // coarse-to-fine
    function pump() {
      while (active < CONCURRENCY && qi < order.length) {
        (function (idx) {
          active++; var im = new Image(); im.decoding = 'async';
          im.onload = function () { frames[idx] = im; active--; key = ''; dirty(); pump(); };
          im.onerror = function () { active--; pump(); };
          im.src = 'assets/' + dir + '/' + name + '/' + ('00' + (idx + 1)).slice(-3) + '.webp';
        })(order[qi++]);
      }
    }
    return { size: size, show: show, load: function () { if (!started) { started = true; pump(); } }, remove: function () { cv.remove(); } };
  }

  var ctrl = null;
  function start() {
    if (ctrl || reduced()) return;
    var root = document.documentElement; root.classList.add('js');
    var set = portraitSet() ? 'p' : 'l', phone = set === 'p';
    root.classList.toggle('seq', phone);
    var stageEl = document.querySelector('.stage'), grain = stageEl.querySelector('.grain');
    var scenes = [].slice.call(stageEl.querySelectorAll('.scene'));
    var panels = [].slice.call(document.querySelectorAll('.panel'));
    var bar = document.getElementById('bar');
    var N = scenes.length, vh = innerHeight, geo = [], dirtyFlag = true, lastY = -1, animating = false;
    var dirty = function () { dirtyFlag = true; };
    var fine = !phone && matchMedia('(pointer:fine) and (hover:hover)').matches;
    var sp = scenes.map(function () { return 0; });
    var players = scenes.map(function (s, i) { return sequence(s, NAMES[i], set, FOCUS_Y[set][i], dirty); });
    players.forEach(function (p) { p.size(); });
    players[0].load(); setTimeout(function () { players[1].load(); }, 500); setTimeout(function () { players[2].load(); }, 1500);

    function measure() { vh = innerHeight; geo = panels.map(function (p) { return { top: p.offsetTop, h: Math.max(1, p.offsetHeight - vh) }; }); dirty(); }
    var fadeIn = function (i, y) { return i === 0 ? 1 : smooth((y - (geo[i].top - vh)) / vh); };
    var kids = panels.map(function (p) { return [].slice.call(p.querySelector('.sticky').children); });

    function updateStage(y, dt) {
      animating = false;
      panels.forEach(function (p, i) {
        var g = geo[i]; if (!g) return;
        var local = clamp((y - g.top) / g.h), target = smooth(local);
        sp[i] += (target - sp[i]) * (1 - Math.exp(-dt / SEQ_TAU));
        if (Math.abs(sp[i] - target) < .0008) sp[i] = target; else animating = true;
        players[i].show(sp[i]);
        scenes[i].style.opacity = (i < N - 1 && fadeIn(i + 1, y) >= 1) ? 0 : fadeIn(i, y);
        var enter = clamp((y - (g.top - vh * .6)) / (vh * .6));
        var exit = i < N - 1 ? smooth((local - .8) / .2) : 0;
        kids[i].forEach(function (el, j) {
          var e = smooth(enter * 1.7 - j * .3), v = e * (1 - exit);
          el.style.opacity = v.toFixed(3);
          el.style.transform = 'translate3d(0,' + (((1 - e) * 36) - exit * 28).toFixed(1) + 'px,0)';
          if (fine) el.style.filter = v < .99 ? 'blur(' + ((1 - v) * 8).toFixed(1) + 'px)' : 'none';
        });
      });
    }

    var compact = null, firstHdr = true;
    function measureBar() {
      var was = bar.classList.contains('compact');
      bar.classList.add('measuring', 'compact'); bar.style.width = 'max-content';
      var w = bar.getBoundingClientRect().width;
      bar.classList.toggle('compact', was); bar.style.width = ''; void bar.offsetWidth; bar.classList.remove('measuring');
      return w;
    }
    function setBar(c, instant) {
      if (c === compact) return; compact = c;
      if (instant) bar.classList.add('measuring');
      var w = c ? measureBar() : null;
      bar.classList.toggle('compact', c); bar.style.width = c ? w + 'px' : '';
      if (instant) { void bar.offsetWidth; bar.classList.remove('measuring'); }
    }
    var wantCompact = function (y) { return innerWidth <= PHONE || y > innerHeight * COMPACT_AT; };

    var tg = { x: 0, y: 0 }, cu = { x: 0, y: 0 }, gacc = 0;
    var onMove = function (e) { if (e.pointerType === 'touch') return; tg.x = e.clientX / innerWidth * 2 - 1; tg.y = e.clientY / innerHeight * 2 - 1; };
    var onLeave = function () { tg.x = 0; tg.y = 0; };
    if (fine) { addEventListener('pointermove', onMove, { passive: true }); root.addEventListener('pointerleave', onLeave); }

    var last = performance.now(), raf = 0, resizeT = 0, lastW = innerWidth, lastH = innerHeight;
    function tick(now) {   // the one and only ticker
      var dt = Math.min(.25, (now - last) / 1000); last = now; var y = scrollY;
      if (!fine && y === lastY && !animating && !dirtyFlag) { raf = requestAnimationFrame(tick); return; }   // idle
      lastY = y; dirtyFlag = false;
      updateStage(y, dt);
      setBar(wantCompact(y), firstHdr); firstHdr = false;
      if (fine) {
        var k = 1 - Math.exp(-dt / DRIFT_TAU); cu.x += (tg.x - cu.x) * k; cu.y += (tg.y - cu.y) * k;
        stageEl.style.setProperty('--dx', (cu.x * DRIFT[0]).toFixed(2) + 'px'); stageEl.style.setProperty('--dy', (cu.y * DRIFT[1]).toFixed(2) + 'px');
        gacc += dt;
        if (panels[1] && y < panels[1].offsetTop && gacc > 1 / GRAIN_FPS) { gacc = 0; grain.style.transform = 'translate(' + (-Math.floor(Math.random() * 180)) + 'px,' + (-Math.floor(Math.random() * 180)) + 'px)'; }
      }
      raf = requestAnimationFrame(tick);
    }
    function onResize() {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        var realW = Math.abs(innerWidth - lastW) > 1, realH = Math.abs(innerHeight - lastH) > 160;
        if (!realW && !realH) return;   // ignore phone address-bar wobble
        lastW = innerWidth; lastH = innerHeight;
        if ((portraitSet() ? 'p' : 'l') !== set) { stop(); start(); return; }
        measure(); players.forEach(function (p) { p.size(); });
        compact = null; setBar(wantCompact(scrollY), true);
      }, 200);
    }
    measure(); addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    addEventListener('load', measure);
    raf = requestAnimationFrame(tick);

    ctrl = { stop: function () {
      cancelAnimationFrame(raf); removeEventListener('resize', onResize); removeEventListener('pointermove', onMove); root.removeEventListener('pointerleave', onLeave);
      players.forEach(function (p) { p.remove(); });
      scenes.forEach(function (s) { s.style.opacity = ''; s.classList.remove('live'); });
      kids.forEach(function (a) { a.forEach(function (el) { el.style.cssText = ''; }); });
      stageEl.style.removeProperty('--dx'); stageEl.style.removeProperty('--dy'); grain.style.transform = '';
      bar.classList.remove('compact', 'measuring'); bar.style.width = ''; root.classList.remove('js', 'seq');
    } };
  }
  function stop() { if (ctrl) { ctrl.stop(); ctrl = null; } }
  mq.addEventListener('change', function () { reduced() ? stop() : start(); });
  start();
})();
