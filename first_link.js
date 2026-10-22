// Nur den Artikelinhalt durchsuchen, nicht Navigation oder Seitenleiste.
const root = document.querySelector('#mw-content-text .mw-parser-output');
if (!root) return null;

// Absätze und Listen durchsuchen; Infoboxen und vorangestellte Hinweise auslassen.
const blocks = [...root.querySelectorAll('p, ul > li, ol > li')]
  .filter(el => !el.closest('.infobox, .hatnote'));

// Prüfen, ob der Link nach den Spielregeln verwendet werden darf.
function isValid(a) {
  if (!a.href || a.hostname !== location.hostname) return false; // Externe Links ausschliessen.
  if (!a.pathname.startsWith('/wiki/')) return false;
  if (a.pathname === location.pathname) return false;       // Keine Verweise auf dieselbe Seite.
  if (a.classList.contains('new')) return false;            // Rote Links: Artikel fehlt.
  if (a.closest('i, em, sup, .IPA, .reference')) return false; // Kein Kursivtext, keine Fussnoten/Lautschrift.
  return true;
}

// Den DOM-Baum in Leserichtung durchlaufen und den ersten gültigen Link liefern.
for (const block of blocks) {
  // Die Tiefe zählt offene Klammern, auch über verschachtelte HTML-Elemente hinweg.
  let depth = 0, match = null;
  (function walk(node) {
    for (const child of node.childNodes) {
      if (match) return;
      if (child.nodeType === Node.TEXT_NODE) {
        for (const c of child.textContent) {
          if (c === '(') depth++;
          else if (c === ')') depth = Math.max(0, depth - 1);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'A') {
          if (depth === 0 && isValid(child)) { match = child; return; }
        } else {
          walk(child);
        }
      }
    }
  })(block);
  if (match) return match;
}
// Keine passende Verknüpfung gefunden: Das Spiel meldet DEAD_END.
return null;
