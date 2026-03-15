import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DebugPanel } from './DebugPanel';

/**
 * Individual message bubble — LotisPro brass/obsidian design.
 */
export function MessageBubble({ message, onSuggestedQuestionClick }) {
  const isUser = message.role === 'user';
  const [showSql, setShowSql] = useState(false);

  const hasDebug = message.debug && (
    (message.debug.tool_calls?.length > 0) ||
    (message.debug.agent_exchanges?.length > 0)
  );

  return (
    <div className={`message ${message.role} ${message.isError ? 'error' : ''}`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar user" aria-hidden="true">V</div>
        ) : (
          /* Geometric SVG avatar — no emoji */
          <div className="avatar assistant" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2L2 7l10 5 10-5-10-5Z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        )}
      </div>

      <div className="message-content">
        <div className="message-text">
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Suggested questions */}
        {message.suggestedQuestions && (
          <div className="suggested-questions">
            {message.suggestedQuestions.map((question, idx) => (
              <button
                key={idx}
                className="suggested-question-btn"
                onClick={() => onSuggestedQuestionClick?.(question)}
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {/* Chart */}
        {message.chartUrl && (
          <div className="chart-container">
            <img
              src={message.chartUrl}
              alt="Graphique généré"
              className="chart-image"
            />
          </div>
        )}

        {/* Excel export download */}
        {message.excelExport && (
          <div className="excel-export">
            <a
              href={`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${message.excelExport.excel_base64}`}
              download={`${message.excelExport.filename}.xlsx`}
              className="excel-download-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Télécharger Excel
              <span className="excel-meta">
                {message.excelExport.row_count} lignes · {message.excelExport.column_count} colonnes
              </span>
            </a>
          </div>
        )}

        {/* SQL queries (debug) */}
        {message.sqlQueries && message.sqlQueries.length > 0 && (
          <div className="sql-queries-section">
            <button
              className="sql-toggle"
              onClick={() => setShowSql(v => !v)}
            >
              {showSql ? 'Masquer' : 'Voir'} les requêtes SQL
            </button>
            {showSql && (
              <div className="sql-queries">
                {message.sqlQueries.map((sql, idx) => (
                  <pre key={idx} className="sql-code">
                    <code>{sql.query}</code>
                  </pre>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Debug panel */}
        {hasDebug && <DebugPanel debug={message.debug} />}
      </div>
    </div>
  );
}
