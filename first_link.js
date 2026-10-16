const root = document.querySelector('#mw-content-text .mw-parser-output');
if (!root) return null;

// Body text only; skip infoboxes and hatnotes which appear before the real text.
const blocks = [...root.querySelectorAll('p, ul > li, ol > li')]
  .filter(el => !el.closest('.infobox, .hatnote'));

// check if found link is actually one we are allowed to use
function isValid(a) {
  if (!a.href || a.hostname !== location.hostname) return false; // skip external links
  if (!a.pathname.startsWith('/wiki/')) return false;
  if (a.pathname === location.pathname) return false;       // skip anchors on same page
  if (a.classList.contains('new')) return false;            // skip red links (page missing)
  if (a.closest('i, em, sup, .IPA, .reference')) return false; // italic, footnotes, phonetics
  return true;
}

// crawls the DOM, looking for the <a> Tags and checks if they are valid - return the first match
for (const block of blocks) {
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
return null;