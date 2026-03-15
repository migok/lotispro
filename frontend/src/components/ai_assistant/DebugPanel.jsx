import { useState } from 'react';

const IconTerminal = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const IconWrench = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const IconArrows = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const IconChevron = ({ open }) => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconDatabase = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </svg>
);

/**
 * Debug panel — Terminal Trace aesthetic.
 * Shows agent tool calls and inter-agent exchanges.
 * Development only.
 */
export function DebugPanel({ debug }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('tools');
  const [expandedTool, setExpandedTool] = useState(null);

  if (!debug) return null;

  const { tool_calls = [], agent_exchanges = [] } = debug;
  const formatJSON = (data) => JSON.stringify(data, null, 2);

  return (
    <div className="debug-panel">
      <button
        className={`debug-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="debug-toggle-icon"><IconTerminal /></span>
        <span className="debug-toggle-label">
          {isOpen ? 'Masquer' : 'Debug'}
        </span>
        <span className="debug-badge">{tool_calls.length}</span>
        <span className="debug-toggle-chevron"><IconChevron open={isOpen} /></span>
      </button>

      {isOpen && (
        <div className="debug-content">
          <div className="debug-tabs">
            <button
              className={`debug-tab ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
            >
              <IconWrench />
              <span>Tools</span>
              <span className="debug-tab-count">{tool_calls.length}</span>
            </button>
            <button
              className={`debug-tab ${activeTab === 'exchanges' ? 'active' : ''}`}
              onClick={() => setActiveTab('exchanges')}
            >
              <IconArrows />
              <span>Échanges</span>
              <span className="debug-tab-count">{agent_exchanges.length}</span>
            </button>
          </div>

          <div className="debug-tab-content">
            {activeTab === 'tools' && (
              <div className="debug-tools">
                {tool_calls.length === 0 ? (
                  <p className="debug-empty">— aucun appel de tool —</p>
                ) : (
                  tool_calls.map((call, idx) => (
                    <div key={idx} className="debug-tool-call">
                      <div className="debug-tool-header">
                        <span className="debug-tool-index">{String(idx + 1).padStart(2, '0')}</span>
                        <span className="debug-tool-name"><IconWrench />{call.tool}</span>
                        <span className="debug-tool-via">via</span>
                        <span className="debug-tool-agent">{call.agent}</span>
                      </div>

                      <div className="debug-section">
                        <div className="debug-section-label in">IN</div>
                        <pre className="debug-json">{formatJSON(call.input)}</pre>
                      </div>

                      {call.sql_query && (
                        <div className="debug-section">
                          <div className="debug-section-label sql"><IconDatabase />SQL</div>
                          <pre className="debug-sql">{call.sql_query}</pre>
                        </div>
                      )}

                      <div className="debug-section">
                        <button
                          className="debug-section-label out clickable"
                          onClick={() => setExpandedTool(expandedTool === idx ? null : idx)}
                          aria-expanded={expandedTool === idx}
                        >
                          <IconChevron open={expandedTool === idx} />
                          OUT
                        </button>
                        {expandedTool === idx && (
                          <pre className="debug-json output">{call.output || 'N/A'}</pre>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'exchanges' && (
              <div className="debug-exchanges">
                {agent_exchanges.length === 0 ? (
                  <p className="debug-empty">— aucun échange entre agents —</p>
                ) : (
                  agent_exchanges.map((exc, idx) => (
                    <div key={idx} className="debug-exchange">
                      <div className="debug-exchange-route">
                        <span className="debug-exchange-index">{String(idx + 1).padStart(2, '0')}</span>
                        <span className="debug-from">{exc.from_agent}</span>
                        <span className="debug-arrow">
                          <svg width="12" height="8" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="0" y1="8" x2="18" y2="8" />
                            <polyline points="12 2 20 8 12 14" />
                          </svg>
                        </span>
                        <span className="debug-to">{exc.to_agent}</span>
                        <span className="debug-event-tag">{exc.event}</span>
                      </div>
                      {exc.output_preview && (
                        <p className="debug-exchange-preview">{exc.output_preview}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
