import { type ReaderPrefs, THEMES } from '@/lib/readerPrefs';
import { SELECTION_MENU, type SelectionInfo } from '@/lib/selectionMenu';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

type Props = {
  epubSrc: string;       // file:// URI on native, blob: URL on web
  cachedLocations: string | null;
  totalWords: number;
  initialWordIndex: number;
  prefs: ReaderPrefs;
  onWordIndex: (index: number) => void;
  onTotalWords: (count: number) => void;
  onSaveLocations: (data: string) => void;
  highlight?: HighlightTarget | null;
  // Jump request from the scrubber; `nonce` makes repeated seeks to the same spot distinct.
  seek?: { fraction: number; nonce: number } | null;
  // A selection-toolbox item was chosen; fraction (0–1) is where the selection sits in the book.
  onSelectionAction?: (key: string, sel: SelectionInfo) => void;
  // Platforms without a native selection toolbox (web) just report the selection.
  onSelectionFallback?: (sel: SelectionInfo) => void;
};

// A word to jump to and briefly highlight when the reader opens (e.g. where RSVP stopped).
export type HighlightTarget = {
  href: string;        // chapter file
  wordOffset: number;  // words from the start of that chapter
  text: string;        // the word and a few after it, used to correct small offset drift
};

// Open a link from the book in the device browser. Only web links and email are allowed.
function openExternal(url: unknown) {
  if (typeof url !== 'string' || !/^(https?:|mailto:)/i.test(url)) return;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else Linking.openURL(url).catch(() => {});
}

function toSelection(msg: any): SelectionInfo {
  return { fraction: msg.percentage, text: msg.text ?? '', href: msg.href, wordOffset: msg.wordOffset };
}

// Position stored as percentage × 1000 (integer 0-1000) in the existing word_index column.
const DENOM = 1000;

function buildHtml(
  epubSrc: string,
  prefs: ReaderPrefs,
  initialPct: number,
  cachedLocations: string | null,
  highlight: HighlightTarget | null,
): string {
  const t = THEMES[prefs.theme];
  // jszip must load before epubjs (epubjs expects window.JSZip).
  // epubjs is not on cdnjs — use jsdelivr.
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"><\/script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: ${t.bg}; height: 100%; overflow: hidden; }
#viewer { width: 100vw; height: 100vh; }
#status {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
  font-family: Georgia, serif; font-size: 14px; color: ${t.fg}; opacity: 0.5;
  pointer-events: none; text-align: center; padding: 0 20px;
}
<\/style>
</head>
<body>
<div id="viewer"></div>
<div id="status">Opening…<\/div>
<script>
(function() {
  if (typeof window.ReactNativeWebView === 'undefined') {
    window.ReactNativeWebView = { postMessage: function(m) { window.parent.postMessage(m, '*'); } };
  }
  function post(d) { window.ReactNativeWebView.postMessage(JSON.stringify(d)); }
  function setStatus(msg) { var el = document.getElementById('status'); if (el) el.textContent = msg; }
  function hideStatus() { var el = document.getElementById('status'); if (el) el.style.display = 'none'; }

  try {
    if (typeof ePub === 'undefined') {
      setStatus('epub.js failed to load.\\nCheck internet connection.');
      post({ type: 'error', message: 'epub.js not loaded' });
      return;
    }

    var book = ePub('${epubSrc}');
    var rendition = book.renderTo('viewer', {
      manager: 'continuous',
      flow: 'scrolled',
      width: '100%',
      height: '100%',
      spread: 'none',
      offset: 1500, // pixels of neighbouring text kept loaded; the default (500) is outrun by fast scrolling
    });

    rendition.themes.override('color', '${t.fg}');
    rendition.themes.override('background', '${t.bg}');
    rendition.themes.override('font-size', '${prefs.fontSize}px');
    rendition.themes.override('line-height', '${prefs.lineHeight}');
    rendition.themes.override('font-family', 'Georgia, "Times New Roman", serif');
    rendition.themes.override('padding', '0 20px 80px');
    rendition.themes.override('max-width', '680px');
    rendition.themes.override('margin', '0 auto');

    var initialPct = ${initialPct};
    var ready = false;
    var lastPct = initialPct;
    var cachedLocs = ${JSON.stringify(cachedLocations)};
    var hl = ${JSON.stringify(highlight).replace(/</g, '\\u003c')};

    function normText(w) { return w.toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, ''); }
    function normHref(s) {
      s = String(s).split('#')[0];
      try { s = decodeURIComponent(s); } catch (e) {}
      var out = [];
      s.split('/').forEach(function(p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
      return out.join('/');
    }
    function findSpineItem(href) {
      var want = normHref(href), items = book.spine.spineItems || [];
      for (var i = 0; i < items.length; i++) {
        var h = normHref(items[i].href);
        if (h === want || h.endsWith(want) || want.endsWith(h)) return items[i];
      }
      return null;
    }
    // The words of a chapter, tokenized by the same rules as the app's RSVP text (htmlToText + split):
    // <br> acts as a space, block elements end a paragraph, script/style/head are ignored, and words
    // may span inline tags. Also returns where each piece of text sits so a word can be located in the DOM.
    var BLOCKS = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, LI: 1, BLOCKQUOTE: 1, TR: 1 };
    function extractWords(doc) {
      var text = '', segs = [];
      function visit(n) {
        if (n.nodeType === 3) {
          segs.push({ node: n, at: text.length, len: n.nodeValue.length });
          text += n.nodeValue;
          return;
        }
        if (n.nodeType !== 1) return;
        var tag = String(n.nodeName).toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEAD' || tag === 'SVG') return;
        if (tag === 'BR') { text += ' '; return; }
        for (var c = n.firstChild; c; c = c.nextSibling) visit(c);
        if (BLOCKS[tag]) text += '\\n\\n';
      }
      visit(doc.body);
      var words = [], re = /\\S+/g, m;
      while ((m = re.exec(text)) !== null) words.push({ s: m.index, e: m.index + m[0].length, t: m[0] });
      return { text: text, segs: segs, words: words };
    }
    // Index of the word containing (or next after) the DOM point (node, offset).
    function wordIndexAtPoint(ex, node, offset) {
      var pos = ex.text.length;
      var target = node, off = offset;
      if (node.nodeType !== 3) {
        // Element boundary: start from the child at that offset and descend to its first text node.
        target = node.childNodes[offset] || null;
        while (target && target.nodeType !== 3) target = target.firstChild || target.nextSibling;
        off = 0;
      }
      if (target) {
        for (var i = 0; i < ex.segs.length; i++) {
          if (ex.segs[i].node === target) { pos = ex.segs[i].at + off; break; }
        }
      }
      for (var w = 0; w < ex.words.length; w++) if (ex.words[w].e > pos) return w;
      return Math.max(0, ex.words.length - 1);
    }
    // Wrap a word (which may span several text nodes) in highlight spans.
    function wrapWord(doc, ex, w) {
      var spans = [];
      for (var i = 0; i < ex.segs.length; i++) {
        var sg = ex.segs[i];
        if (sg.at >= w.e) break;
        var a = Math.max(w.s, sg.at), b = Math.min(w.e, sg.at + sg.len);
        if (a >= b) continue;
        var r = doc.createRange();
        r.setStart(sg.node, a - sg.at);
        r.setEnd(sg.node, b - sg.at);
        var span = doc.createElement('span');
        span.style.cssText = 'background:rgba(255,200,0,0.55);border-radius:3px;transition:background 0.9s ease;';
        r.surroundContents(span);
        spans.push(span);
      }
      return spans;
    }
    // Jump to a word (chapter + word offset, refined by matching its text), then flash a highlight on it.
    function highlightAt(target) {
      var item = findSpineItem(target.href);
      if (!item) return Promise.reject(new Error('section not found'));
      return rendition.display(item.href).then(function() {
        var contents = rendition.getContents().filter(function(c) { return c.sectionIndex === item.index; })[0];
        if (!contents) return;
        var doc = contents.document;
        var ex = extractWords(doc);
        var words = ex.words;
        words.forEach(function(x) { x.n = normText(x.t); });
        if (!words.length) return;
        var best = Math.min(words.length - 1, Math.max(0, target.wordOffset || 0));
        var want = String(target.text || '').split(/\\s+/).map(normText).filter(Boolean);
        if (want.length) {
          var bestDist = Infinity, lo = Math.max(0, best - 150), hi = Math.min(words.length - 1, best + 150);
          for (var i = lo; i <= hi; i++) {
            if (words[i].n !== want[0]) continue;
            var j = i + 1, ok = true;
            for (var k = 1; k < want.length; k++) {
              while (j < words.length && words[j].n === '') j++;
              if (j >= words.length || words[j].n !== want[k]) { ok = false; break; }
              j++;
            }
            if (ok && Math.abs(i - best) < bestDist) { bestDist = Math.abs(i - best); best = i; }
          }
        }
        var spans = wrapWord(doc, ex, words[best]);
        if (!spans.length) return;
        spans[0].scrollIntoView({ block: 'center' });
        setTimeout(function() { spans.forEach(function(s) { s.style.background = 'transparent'; }); }, 2600);
        setTimeout(function() {
          spans.forEach(function(s) {
            var parent = s.parentNode;
            if (!parent) return;
            parent.replaceChild(doc.createTextNode(s.textContent), s);
            parent.normalize();
          });
        }, 3600);
      });
    }

    // Dark-theme readability fixes (active only when the theme defines a link color):
    // lighter hyperlinks, and list text that books often hardcode as black.
    var linkColor = ${JSON.stringify(t.link)};
    function setReadabilityFixes(doc, color) {
      var s = doc.getElementById('rsvp-link-style');
      if (!color) { if (s) s.remove(); return; }
      if (!s) { s = doc.createElement('style'); s.id = 'rsvp-link-style'; (doc.head || doc.documentElement).appendChild(s); }
      s.textContent =
        'a, a:link, a:visited { color: ' + color + ' !important; }' +
        'ul, ol, li, li * { color: inherit !important; }';
    }
    // epub.js writes an inline "margin: 0" on every chapter's body while laying it out, which overwrites the
    // centring margin set above and leaves the text column hugging the left edge on wide (landscape) screens.
    // A stylesheet rule with !important can't be overwritten by that inline style.
    function ensureLayoutStyle(doc) {
      if (doc.getElementById('rsvp-layout-style')) return;
      var s = doc.createElement('style');
      s.id = 'rsvp-layout-style';
      s.textContent = 'body { margin-left: auto !important; margin-right: auto !important; max-width: 680px !important; }';
      (doc.head || doc.documentElement).appendChild(s);
    }
    rendition.hooks.content.register(function(contents) {
      ensureLayoutStyle(contents.document);
      setReadabilityFixes(contents.document, linkColor);
    });

    // Jump to a chapter, then to an anchor inside it (contents-page and footnote links).
    function goTo(item, frag) {
      return rendition.display(item.href).then(function() {
        if (!frag) return;
        var c = rendition.getContents().filter(function(x) { return x.sectionIndex === item.index; })[0];
        if (!c) return;
        var el = c.document.getElementById(frag) || c.document.getElementsByName(frag)[0];
        if (el) el.scrollIntoView({ block: 'start' });
      });
    }
    // Resolve links ourselves against the chapter they appear in; epub.js's own link handling
    // can't map them back to a chapter here, so contents-page links land on the wrong page.
    rendition.hooks.content.register(function(contents) {
      contents.document.addEventListener('click', function(e) {
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        var raw = a ? a.getAttribute('href') : null;
        if (!raw) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.indexOf('//') === 0) {
          // External link: hand it to the app to open in the browser; never load it inside the reader.
          post({ type: 'externalLink', url: raw.indexOf('//') === 0 ? 'https:' + raw : raw });
          return;
        }
        var cur = book.spine.get(contents.sectionIndex);
        var hashAt = raw.indexOf('#');
        var file = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
        var frag = hashAt >= 0 ? raw.slice(hashAt + 1) : '';
        try { frag = decodeURIComponent(frag); } catch (err) {}
        var target = cur;
        if (file) {
          var dir = cur.href.indexOf('/') >= 0 ? cur.href.slice(0, cur.href.lastIndexOf('/') + 1) : '';
          target = findSpineItem(dir + file);
        }
        if (!target) return;
        goTo(target, frag).catch(function() {});
      }, true);
    });

    // Report where in the book the current text selection is, so native selection-menu
    // actions (RSVP from here, later highlight/bookmark) know their position.
    rendition.on('selected', function(cfiRange, contents) {
      var pct = null;
      try {
        if (ready) pct = book.locations.percentageFromCfi(cfiRange);
      } catch (err) {}
      if (pct === null || typeof pct !== 'number' || isNaN(pct)) pct = lastPct;
      var text = '';
      try { text = String(contents.window.getSelection()).slice(0, 300); } catch (err) {}
      // Chapter file + words into it, for an exact (not percentage-based) RSVP start.
      var href = null, wordOffset = null;
      try {
        var sec = book.spine.get(contents.sectionIndex);
        href = sec ? sec.href : null;
        var range = contents.window.getSelection().getRangeAt(0);
        wordOffset = wordIndexAtPoint(extractWords(contents.document), range.startContainer, range.startOffset);
      } catch (err) {}
      post({ type: 'selection', percentage: pct, cfiRange: cfiRange, text: text, href: href, wordOffset: wordOffset });
    });

    book.ready.then(function() {
      if (cachedLocs) {
        // Locations already generated from a previous session — load instantly.
        book.locations.load(cachedLocs);
        ready = true;
        post({ type: 'wordCount', count: ${DENOM} });
        function displayPct() {
          if (initialPct > 0) {
            var cfi = book.locations.cfiFromPercentage(initialPct);
            return rendition.display(cfi).catch(function() { return rendition.display(); });
          }
          return rendition.display();
        }
        var started = hl ? highlightAt(hl).catch(function() { return displayPct(); }) : displayPct();
        started.then(hideStatus).catch(function() { rendition.display().then(hideStatus); });
      } else {
        // First open: show first page immediately, generate locations in background.
        var first = hl ? highlightAt(hl).catch(function() { return rendition.display(); }) : rendition.display();
        first.then(hideStatus).catch(function(e) {
          setStatus('Render error: ' + String(e));
          post({ type: 'error', message: String(e) });
        });
        return book.locations.generate(1024).then(function() {
          ready = true;
          post({ type: 'wordCount', count: ${DENOM} });
          var saved = book.locations.save();
          post({ type: 'saveLocations', data: saved });
          if (initialPct > 0 && !hl) {
            var cfi = book.locations.cfiFromPercentage(initialPct);
            rendition.display(cfi);
          }
        });
      }
    }).catch(function(e) {
      setStatus('Error: ' + String(e));
      post({ type: 'error', message: String(e) });
    });

    // Fast scrolling fires many relocations; report at most one every 80 ms, always the latest.
    var posTimer = null;
    rendition.on('relocated', function(loc) {
      if (ready && loc && loc.start) {
        // atEnd is true once the last page of the last chapter is on screen: report 100% so the book counts as finished.
        lastPct = loc.atEnd ? 1 : (loc.start.percentage || 0);
        if (posTimer) return;
        posTimer = setTimeout(function() {
          posTimer = null;
          post({ type: 'position', percentage: lastPct });
        }, 80);
      }
    });

    window.__updateStyle = function(bg, fg, fontSize, lineHeight, link) {
      rendition.themes.override('background', bg);
      rendition.themes.override('color', fg);
      rendition.themes.override('font-size', fontSize + 'px');
      rendition.themes.override('line-height', String(lineHeight));
      linkColor = link || null;
      rendition.getContents().forEach(function(c) { setReadabilityFixes(c.document, linkColor); });
    };

    // Scrubber jump: needs the location map (built shortly after first open), so it's a no-op until then.
    window.__seekTo = function(fraction) {
      if (!ready) return;
      var f = Math.min(1, Math.max(0, fraction));
      try { rendition.display(book.locations.cfiFromPercentage(f)); } catch (err) {}
    };

    window.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'seek') window.__seekTo(msg.fraction);
        else if (msg.type === 'updateStyle') window.__updateStyle(msg.bg, msg.fg, msg.fontSize, msg.lineHeight, msg.link);
      } catch (err) {}
    });
  } catch(e) {
    setStatus('Error: ' + String(e));
    post({ type: 'error', message: String(e) });
  }
})();
<\/script>
</body>
</html>`;
}

// ─── Web (iframe) ─────────────────────────────────────────────────────────────

function EpubReaderWeb({ epubSrc, cachedLocations, totalWords, initialWordIndex, prefs, highlight, seek, onWordIndex, onTotalWords, onSaveLocations, onSelectionFallback }: Props) {
  const iframeRef = useRef<any>(null);
  const handledSeek = useRef(seek?.nonce ?? 0);
  useEffect(() => {
    if (!seek || seek.nonce === handledSeek.current) return;
    handledSeek.current = seek.nonce;
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'seek', fraction: seek.fraction }), '*');
  }, [seek]);
  const initialPctRef = useRef(totalWords > 0 ? initialWordIndex / totalWords : 0);
  const cachedLocsRef = useRef(cachedLocations);
  const highlightRef = useRef(highlight ?? null);
  const html = useMemo(
    () => buildHtml(epubSrc, prefs, initialPctRef.current, cachedLocsRef.current, highlightRef.current),
    [epubSrc], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const theme = THEMES[prefs.theme];

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'position') onWordIndex(Math.round(msg.percentage * DENOM));
        else if (msg.type === 'wordCount') onTotalWords(msg.count);
        else if (msg.type === 'saveLocations') onSaveLocations(msg.data);
        else if (msg.type === 'selection') onSelectionFallback?.(toSelection(msg));
        else if (msg.type === 'externalLink') openExternal(msg.url);
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onWordIndex, onTotalWords, onSaveLocations, onSelectionFallback]);

  useEffect(() => {
    const t = THEMES[prefs.theme];
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: 'updateStyle', bg: t.bg, fg: t.fg, fontSize: prefs.fontSize, lineHeight: prefs.lineHeight, link: t.link }), '*'
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

function EpubReaderNative({ epubSrc, cachedLocations, totalWords, initialWordIndex, prefs, highlight, seek, onWordIndex, onTotalWords, onSaveLocations, onSelectionAction }: Props) {
  const webViewRef = useRef<WebView>(null);
  const handledSeek = useRef(seek?.nonce ?? 0);
  // Latest selection reported by the page; the native menu callback only carries the text.
  const lastSelectionRef = useRef<SelectionInfo | null>(null);
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (!seek || seek.nonce === handledSeek.current || !didLoadRef.current) return;
    handledSeek.current = seek.nonce;
    webViewRef.current?.injectJavaScript(`window.__seekTo && window.__seekTo(${seek.fraction}); true;`);
  }, [seek]);
  const initialPctRef = useRef(totalWords > 0 ? initialWordIndex / totalWords : 0);
  const cachedLocsRef = useRef(cachedLocations);
  const highlightRef = useRef(highlight ?? null);
  const html = useMemo(
    () => buildHtml(epubSrc, prefs, initialPctRef.current, cachedLocsRef.current, highlightRef.current),
    [epubSrc], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const theme = THEMES[prefs.theme];

  useEffect(() => {
    if (!didLoadRef.current) return;
    const t = THEMES[prefs.theme];
    webViewRef.current?.injectJavaScript(
      `window.__updateStyle && window.__updateStyle('${t.bg}','${t.fg}',${prefs.fontSize},${prefs.lineHeight},${JSON.stringify(t.link)}); true;`
    );
  }, [prefs.theme, prefs.fontSize, prefs.lineHeight]);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'position') onWordIndex(Math.round(msg.percentage * DENOM));
      else if (msg.type === 'wordCount') onTotalWords(msg.count);
      else if (msg.type === 'saveLocations') onSaveLocations(msg.data);
      else if (msg.type === 'selection') lastSelectionRef.current = toSelection(msg);
      else if (msg.type === 'externalLink') openExternal(msg.url);
    } catch {}
  }, [onWordIndex, onTotalWords, onSaveLocations]);

  const handleMenuSelection = useCallback((e: { nativeEvent: { key: string } }) => {
    const sel = lastSelectionRef.current;
    if (sel) onSelectionAction?.(e.nativeEvent.key, sel);
  }, [onSelectionAction]);

  const handleLoad = useCallback(() => { didLoadRef.current = true; }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: 'file:///' }}
        style={styles.webview}
        onMessage={handleMessage}
        menuItems={SELECTION_MENU}
        onCustomMenuSelection={handleMenuSelection}
        onLoad={handleLoad}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        javaScriptEnabled
        mixedContentMode="always"
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
      />
    </View>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

// Memoized so the screen's frequent progress updates don't re-render the page.
export default memo(function EpubReader(props: Props) {
  if (Platform.OS === 'web') return <EpubReaderWeb {...props} />;
  return <EpubReaderNative {...props} />;
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
