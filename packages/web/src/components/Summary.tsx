import { outcomeLabel, type ArticleRow } from "../runState.ts";

/** Übersicht pro Artikel: Ergebnis, Anzahl Artikel und aufklappbarer Pfad. */
export function Summary({ rows }: { rows: ArticleRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="summary">
      <h2>Ergebnisse</h2>
      <table>
        <thead>
          <tr>
            <th>Startartikel</th>
            <th>Ergebnis</th>
            <th className="num">Artikel</th>
            <th>Pfad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.article}>
              <td>{row.article}</td>
              <td>
                <span className={`badge ${row.state}`}>{outcomeLabel(row.state)}</span>
              </td>
              <td className="num">{row.path.length || "–"}</td>
              <td className="path">
                {row.message && <div className="error-text">{row.message}</div>}
                {row.path.length > 0 && (
                  <details>
                    <summary>
                      {row.path[0]} → … → {row.path.at(-1)}
                    </summary>
                    <ol>
                      {row.path.map((title, i) => (
                        <li key={i}>{title}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
