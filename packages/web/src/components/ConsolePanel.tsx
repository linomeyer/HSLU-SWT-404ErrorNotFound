import { useLayoutEffect, useRef, useState } from "react";
import type { ArticleRow, ConsoleLine } from "../runState.ts";

interface Props {
  lines: ConsoleLine[];
  rows: ArticleRow[];
  running: boolean;
}

/** Terminalähnliche Ausgabe mit einem Reiter pro Startartikel. */
export function ConsolePanel({ lines, rows, running }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Gehört die Auswahl nicht zum aktuellen Lauf, den ersten Artikel zeigen.
  const tab = rows.some((r) => r.article === selected) ? selected : (rows[0]?.article ?? null);

  // Zeilen des gewählten Artikels plus die Start- und Endmeldung des ganzen Laufs.
  const visible = lines.filter((l) => l.article === null || l.article === tab);
  const tabRunning = rows.find((r) => r.article === tab)?.state === "running";

  // Automatisch mitscrollen, solange der Benutzer unten ist; beim Reiterwechsel nach unten springen.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);
  useLayoutEffect(() => {
    stickToBottom.current = true;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab]);

  return (
    <section className="console">
      {rows.length > 0 && (
        <div className="console-tabs" role="tablist">
          {rows.map((r) => (
            <button
              key={r.article}
              type="button"
              role="tab"
              aria-selected={tab === r.article}
              className={`tab ${tab === r.article ? "active" : ""}`}
              onClick={() => setSelected(r.article)}
            >
              <span className={`dot ${r.state}`} />
              {r.article}
            </button>
          ))}
        </div>
      )}
      <div
        className="console-body"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {visible.length === 0 && <div className="line muted">$ Artikel wählen und „Spielen“ drücken …</div>}
        {visible.map((line) => (
          <div key={line.id} className={`line ${line.kind}`}>
            {line.url ? (
              <a href={line.url} target="_blank" rel="noreferrer">
                {line.text}
              </a>
            ) : (
              line.text
            )}
          </div>
        ))}
        {running && (tabRunning || rows.length === 0) && <div className="line cursor">▌</div>}
      </div>
    </section>
  );
}
