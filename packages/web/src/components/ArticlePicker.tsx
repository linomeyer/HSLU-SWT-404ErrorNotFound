import { useEffect, useId, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { randomArticles, searchArticles } from "../api.ts";

interface Props {
  articles: string[];
  onChange(articles: string[]): void;
  disabled: boolean;
  max: number;
}

/** Artikel per Suche, Einfügen mehrerer Zeilen oder Zufall auswählen. */
export function ArticlePicker({ articles, onChange, disabled, max }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  // Vorschläge mit kurzer Verzögerung von Wikipedia laden.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchArticles(q, controller.signal)
        .then((titles) => {
          setSuggestions(titles);
          setHighlight(-1);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function add(names: string[]) {
    const next = [...articles];
    for (const raw of names) {
      const name = raw.trim();
      if (name && !next.includes(name) && next.length < max) next.push(name);
    }
    onChange(next);
    setQuery("");
    setSuggestions([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      add([highlight >= 0 ? suggestions[highlight]! : query]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    } else if (e.key === "Backspace" && !query && articles.length) {
      onChange(articles.slice(0, -1));
    }
  }

  // Mehrere Zeilen einfügen fügt jede Zeile als eigenen Artikel hinzu.
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (/[\n;]/.test(text)) {
      e.preventDefault();
      add(text.split(/[\r\n;]+/));
    }
  }

  async function addRandom() {
    setError(null);
    try {
      add(await randomArticles(3));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="picker">
      <div className={`chips ${disabled ? "disabled" : ""}`}>
        {articles.map((a) => (
          <span key={a} className="chip">
            {a}
            {!disabled && (
              <button type="button" aria-label={`${a} entfernen`} onClick={() => onChange(articles.filter((x) => x !== a))}>
                ×
              </button>
            )}
          </span>
        ))}
        <div className="search">
          <input
            value={query}
            disabled={disabled || articles.length >= max}
            placeholder={articles.length ? "Weiteren Artikel hinzufügen …" : "Wikipedia-Artikel suchen, Enter zum Hinzufügen"}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
          />
          {suggestions.length > 0 && (
            <ul id={listId} className="suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={i === highlight}
                  className={i === highlight ? "active" : ""}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add([s]);
                  }}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="picker-actions">
        <button type="button" className="ghost" disabled={disabled || articles.length >= max} onClick={addRandom}>
          🎲 3 zufällige
        </button>
        <button type="button" className="ghost" disabled={disabled || !articles.length} onClick={() => onChange([])}>
          Alle entfernen
        </button>
        <span className="hint">
          {articles.length}/{max} · Tipp: mehrere Zeilen einfügen
        </span>
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}
