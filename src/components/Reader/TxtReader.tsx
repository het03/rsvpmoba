import { type ReaderPrefs, THEMES } from '@/lib/readerPrefs';
import { SELECTION_MENU, type SelectionInfo } from '@/lib/selectionMenu';
import { splitParagraphs } from '@/rsvp/tokenize';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

type Props = {
  content: string;
  initialWordIndex: number;
  prefs: ReaderPrefs;
  onWordIndex: (index: number) => void;
  // Exact word index to scroll to and briefly highlight on open (e.g. where RSVP stopped).
  highlightWord?: number;
  // A selection-toolbox item was chosen (native).
  onSelectionAction?: (key: string, sel: SelectionInfo) => void;
  // Platforms without a native selection toolbox (web) just report the selection.
  onSelectionFallback?: (sel: SelectionInfo) => void;
};

type Paragraphs = ReturnType<typeof splitParagraphs>;

function toSelection(msg: any): SelectionInfo {
  return { fraction: msg.fraction, text: msg.text ?? '', wordIndex: msg.wordIndex };
}

// Self-contained page (no network). Each paragraph is its own <p>, so any DOM position maps to an
// exact word index that matches RSVP's word list.
function buildHtml(
  { paragraphs, total }: Paragraphs,
  prefs: ReaderPrefs,
  initialWord: number,
  highlightWord: number | undefined,
): string {
  const t = THEMES[prefs.theme];
  const data = JSON.stringify(paragraphs)
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html, body { margin: 0; padding: 0; background: ${t.bg}; }
body {
  color: ${t.fg};
  font-family: -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: ${prefs.fontSize}px;
  line-height: ${prefs.lineHeight};
  -webkit-text-size-adjust: 100%;
}
#root { max-width: 720px; margin: 0 auto; padding: 24px 24px 96px; }
p { margin: 0 0 1em; white-space: pre-wrap; overflow-wrap: anywhere; }
<\/style>
</head>
<body>
<div id="root"></div>
<script>
(function() {
  if (typeof window.ReactNativeWebView === 'undefined') {
    window.ReactNativeWebView = { postMessage: function(m) { window.parent.postMessage(m, '*'); } };
  }
  function post(d) { window.ReactNativeWebView.postMessage(JSON.stringify(d)); }

  var DATA = ${data};
  var TOTAL = ${total};
  var INIT = ${initialWord};
  var HL = ${highlightWord === undefined ? 'null' : highlightWord};

  var root = document.getElementById('root');
  var paras = [], starts = [];
  var frag = document.createDocumentFragment();
  DATA.forEach(function(d, i) {
    var el = document.createElement('p');
    el.textContent = d.t;
    el.setAttribute('data-i', String(i));
    frag.appendChild(el);
    paras.push(el);
    starts.push(d.o);
  });
  root.appendChild(frag);

  function scroller() { return document.scrollingElement || document.documentElement; }
  function topOf(el) { return el.getBoundingClientRect().top + scroller().scrollTop; }
  function paraOfWord(idx) {
    var lo = 0, hi = starts.length - 1, ans = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (starts[mid] <= idx) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  }
  function yForWord(idx) {
    var i = paraOfWord(idx), el = paras[i], n = Math.max(1, DATA[i].n);
    var within = Math.min(1, Math.max(0, (idx - starts[i]) / n));
    return topOf(el) + within * el.offsetHeight;
  }
  // The word at the top of the viewport (or the end of the book when scrolled to the bottom).
  function currentWord() {
    if (!paras.length) return 0;
    var sc = scroller(), y = sc.scrollTop;
    if (y + window.innerHeight >= sc.scrollHeight - 2) return Math.max(0, TOTAL - 1);
    var lo = 0, hi = paras.length - 1, ans = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (topOf(paras[mid]) <= y) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    var el = paras[ans], h = Math.max(1, el.offsetHeight);
    var frac = Math.min(1, Math.max(0, (y - topOf(el)) / h));
    return Math.min(Math.max(0, TOTAL - 1), starts[ans] + Math.floor(frac * DATA[ans].n));
  }

  // Flash a highlight on one word, then fade and remove it.
  function flash(idx) {
    var i = paraOfWord(idx), el = paras[i], k = idx - starts[i];
    var text = el.firstChild;
    if (!text) return;
    var re = /\\S+/g, m, n = -1, s = -1, e = -1, str = text.nodeValue;
    while ((m = re.exec(str)) !== null) {
      n++;
      if (n === k) { s = m.index; e = s + m[0].length; break; }
    }
    if (s < 0) return;
    var r = document.createRange();
    r.setStart(text, s);
    r.setEnd(text, e);
    var span = document.createElement('span');
    span.style.cssText = 'background:rgba(255,200,0,0.55);border-radius:3px;transition:background 0.9s ease;';
    r.surroundContents(span);
    setTimeout(function() { span.style.background = 'transparent'; }, 2600);
    setTimeout(function() {
      var parent = span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    }, 3600);
  }

  if (paras.length) {
    if (HL !== null) {
      scroller().scrollTop = Math.max(0, yForWord(HL) - window.innerHeight * 0.35);
      flash(HL);
    } else if (INIT > 0) {
      scroller().scrollTop = yForWord(INIT);
    }
  }

  var scrollTimer = null;
  window.addEventListener('scroll', function() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function() {
      scrollTimer = null;
      post({ type: 'position', wordIndex: currentWord() });
    }, 150);
  }, { passive: true });

  // Report the selection's exact word index so toolbox actions know where it starts.
  var selTimer = null;
  document.addEventListener('selectionchange', function() {
    clearTimeout(selTimer);
    selTimer = setTimeout(function() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !paras.length) return;
      var range = sel.getRangeAt(0), node = range.startContainer, p, k = 0;
      if (node === root) {
        p = paras[Math.min(range.startOffset, paras.length - 1)];
      } else {
        p = node.nodeType === 3 ? node.parentNode : node;
        while (p && p !== root && p.nodeName !== 'P') p = p.parentNode;
        if (!p || p === root) return;
        var pre = document.createRange();
        pre.setStart(p, 0);
        pre.setEnd(range.startContainer, range.startOffset);
        var before = pre.toString();
        k = before.split(/\\s+/).filter(Boolean).length;
        if (before.length && !/\\s$/.test(before)) k = Math.max(0, k - 1);
      }
      var i = Number(p.getAttribute('data-i'));
      var wi = starts[i] + Math.min(k, Math.max(0, DATA[i].n - 1));
      post({ type: 'selection', wordIndex: wi, fraction: TOTAL > 0 ? wi / TOTAL : 0, text: String(sel).slice(0, 300) });
    }, 250);
  });

  window.__updateStyle = function(bg, fg, fontSize, lineHeight) {
    var w = paras.length ? currentWord() : 0;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.body.style.color = fg;
    document.body.style.fontSize = fontSize + 'px';
    document.body.style.lineHeight = String(lineHeight);
    if (paras.length) scroller().scrollTop = yForWord(w);
  };
  window.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'updateStyle') window.__updateStyle(msg.bg, msg.fg, msg.fontSize, msg.lineHeight);
    } catch (err) {}
  });
})();
<\/script>
</body>
</html>`;
}

// ─── Web (iframe) ─────────────────────────────────────────────────────────────

function TxtReaderWeb({ content, initialWordIndex, prefs, highlightWord, onWordIndex, onSelectionFallback }: Props) {
  const iframeRef = useRef<any>(null);
  const initialRef = useRef({ word: initialWordIndex, highlight: highlightWord });
  const html = useMemo(
    () => buildHtml(splitParagraphs(content), prefs, initialRef.current.word, initialRef.current.highlight),
    [content], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const theme = THEMES[prefs.theme];

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'position') onWordIndex(msg.wordIndex);
        else if (msg.type === 'selection') onSelectionFallback?.(toSelection(msg));
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onWordIndex, onSelectionFallback]);

  useEffect(() => {
    const t = THEMES[prefs.theme];
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: 'updateStyle', bg: t.bg, fg: t.fg, fontSize: prefs.fontSize, lineHeight: prefs.lineHeight }), '*'
    );
  }, [prefs.theme, prefs.fontSize, prefs.lineHeight]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* @ts-ignore */}
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ flex: 1, border: 'none', width: '100%', height: '100%', backgroundColor: theme.bg } as any}
        sandbox="allow-scripts allow-same-origin"
      />
    </View>
  );
}

// ─── Native (WebView) ─────────────────────────────────────────────────────────

function TxtReaderNative({ content, initialWordIndex, prefs, highlightWord, onWordIndex, onSelectionAction }: Props) {
  const webViewRef = useRef<WebView>(null);
  const didLoadRef = useRef(false);
  // The native menu callback only carries the selected text, so keep the latest reported selection.
  const lastSelectionRef = useRef<SelectionInfo | null>(null);
  const initialRef = useRef({ word: initialWordIndex, highlight: highlightWord });
  const html = useMemo(
    () => buildHtml(splitParagraphs(content), prefs, initialRef.current.word, initialRef.current.highlight),
    [content], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const theme = THEMES[prefs.theme];

  useEffect(() => {
    if (!didLoadRef.current) return;
    const t = THEMES[prefs.theme];
    webViewRef.current?.injectJavaScript(
      `window.__updateStyle && window.__updateStyle('${t.bg}','${t.fg}',${prefs.fontSize},${prefs.lineHeight}); true;`
    );
  }, [prefs.theme, prefs.fontSize, prefs.lineHeight]);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'position') onWordIndex(msg.wordIndex);
      else if (msg.type === 'selection') lastSelectionRef.current = toSelection(msg);
    } catch {}
  }, [onWordIndex]);

  const handleMenuSelection = useCallback((e: { nativeEvent: { key: string } }) => {
    const sel = lastSelectionRef.current;
    if (sel) onSelectionAction?.(e.nativeEvent.key, sel);
  }, [onSelectionAction]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        onMessage={handleMessage}
        menuItems={SELECTION_MENU}
        onCustomMenuSelection={handleMenuSelection}
        onLoad={() => { didLoadRef.current = true; }}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function TxtReader(props: Props) {
  if (Platform.OS === 'web') return <TxtReaderWeb {...props} />;
  return <TxtReaderNative {...props} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
