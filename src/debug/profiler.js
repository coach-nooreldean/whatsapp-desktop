/*
 * Performance profiling probes for scrolling, GPU pipelines, memory, and event listeners.
 */
'use strict';

async function runScrollProbe(win, source) {
  const wanted = source.slice('#scroll'.length).trim();
  const SAMPLE = `(() => {
    window.__waLong = [];
    window.__waObs?.disconnect();
    window.__waObs = new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__waLong.push(Math.round(e.duration));
    });
    window.__waObs.observe({ entryTypes: ['longtask'] });
    const pick = root => [...(root ? [root, ...root.querySelectorAll('div')] : [])]
      .filter(el => el.scrollHeight > el.clientHeight + 400 && el.clientHeight > 200)
      .sort((a, b) => b.clientHeight - a.clientHeight)[0] || null;
    const main = document.querySelector('#main');
    const named = ${JSON.stringify(wanted)} ? document.querySelector(${JSON.stringify(wanted)}) : null;
    window.__waScroller = named || pick(main) || pick(document.querySelector('#pane-side'));
    window.__waTarget = named ? ${JSON.stringify(wanted || '')}
      : main && window.__waScroller && main.contains(window.__waScroller)
      ? 'conversation' : 'chat list';
    window.__waFrom = window.__waScroller ? window.__waScroller.scrollTop : -1;
    window.__waSelector = ${JSON.stringify(wanted || '')};
    return window.__waScroller ? window.__waTarget : 'nothing scrollable';
  })()`;

  const REPORT = `(() => {
    window.__waObs?.disconnect();
    const long = window.__waLong || [];
    if (window.__waSelector) {
      const live = document.querySelector(window.__waSelector);
      if (live) window.__waScroller = live;
    }
    return JSON.stringify({
      longTasks: long.length,
      blockedMs: long.reduce((a, b) => a + b, 0),
      worstMs: long.length ? Math.max(...long) : 0,
      scrolled: window.__waScroller ? Math.round(window.__waFrom - window.__waScroller.scrollTop) : null,
      moved: window.__waScroller ? window.__waFrom !== window.__waScroller.scrollTop : false,
      target: window.__waTarget,
    });
  })()`;

  try {
    win.show();
    win.focus();
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('debug: scroll probe %s',
      await win.webContents.executeJavaScript(SAMPLE, true));

    const bounds = win.getContentBounds();
    const where = await win.webContents.executeJavaScript(
      `(() => { const r = window.__waScroller?.getBoundingClientRect();
         return r ? JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }) : ''; })()`, true);
    const zoom = win.webContents.getZoomFactor();
    const point = where ? JSON.parse(where) : null;
    const x = point ? Math.round(point.x * zoom) : Math.round(bounds.width * 0.65);
    const y = point ? Math.round(point.y * zoom) : Math.round(bounds.height * 0.5);

    for (let i = 0; i < 60; i++) {
      win.webContents.sendInputEvent({
        type: 'mouseWheel', x, y, deltaX: 0, deltaY: 120, canScroll: true,
        phase: i === 0 ? 'began' : 'changed',
      });
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    win.webContents.sendInputEvent({
      type: 'mouseWheel', x, y, deltaX: 0, deltaY: 0, canScroll: true, phase: 'ended',
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('debug: scroll %s', await win.webContents.executeJavaScript(REPORT, true));
  } catch (e) {
    console.warn('debug: scroll probe failed: %s', e.message);
  }
}

async function runGcProbe(win) {
  const heap = () => win.webContents.executeJavaScript(
    '(performance.memory||{}).usedJSHeapSize|0', true);
  const rss = () => {
    try { return require('fs').readFileSync('/proc/self/statm', 'utf8'); } catch (e) { return ''; }
  };
  const before = await heap();
  let attached = false;
  try {
    if (!win.webContents.debugger.isAttached()) { win.webContents.debugger.attach('1.3'); attached = true; }
    await win.webContents.debugger.sendCommand('HeapProfiler.collectGarbage');
  } catch (err) {
    console.log('debug: could not collect: %s', err.message);
  } finally {
    if (attached) { try { win.webContents.debugger.detach(); } catch (e) {} }
  }
  const after = await heap();
  console.log('debug: js heap %d MB -> %d MB (browser statm %s)',
              Math.round(before / 1048576), Math.round(after / 1048576), rss().trim());
}

async function runListenersProbe(win, source) {
  const what = source.length > 11 ? source.slice(11).trim() : 'window';
  let attached = false;
  try {
    if (!win.webContents.debugger.isAttached()) { win.webContents.debugger.attach('1.3'); attached = true; }
    const { result } = await win.webContents.debugger.sendCommand('Runtime.evaluate', {
      expression: what, returnByValue: false,
    });
    const { listeners } = await win.webContents.debugger.sendCommand(
      'DOMDebugger.getEventListeners', { objectId: result.objectId, depth: 1 });
    const keys = (listeners || []).filter(l => /^key/.test(l.type));
    console.log('debug: %s has %d listener(s), %d for keys: %s', what,
                (listeners || []).length, keys.length,
                JSON.stringify(keys.map(l => ({ type: l.type, capture: l.useCapture,
                                                at: l.scriptId + ':' + l.lineNumber }))));
  } catch (err) {
    console.log('debug: could not read listeners: %s', err.message);
  } finally {
    if (attached) { try { win.webContents.debugger.detach(); } catch (e) {} }
  }
}

module.exports = {
  runScrollProbe,
  runGcProbe,
  runListenersProbe,
};
