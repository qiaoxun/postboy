'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  BodyMode,
  HttpMethod,
  RequestDefinition,
  ResponseSnapshot,
} from '@postboy/shared';

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

type AuthMode = 'none' | 'bearer' | 'basic' | 'api-key';
type RequestEditorTab = 'params' | 'headers' | 'body' | 'auth' | 'tests';
type ResponseTab = 'body' | 'headers';
type ResponseBodyView = 'pretty' | 'raw' | 'preview';
type RawEditorMode = 'json' | 'text';

type RequestDraft = {
  id: string;
  name: string;
  request: RequestDefinition;
  params: KeyValueRow[];
  headers: KeyValueRow[];
  auth: {
    mode: AuthMode;
    bearerToken: string;
    basicUsername: string;
    basicPassword: string;
    apiKey: string;
    apiKeyHeader: string;
  };
  rawEditorMode: RawEditorMode;
};

type WorkspaceState = {
  drafts: RequestDraft[];
  activeDraftId: string;
  activeEditorTab: RequestEditorTab;
  activeResponseTab: ResponseTab;
  activeResponseBodyView: ResponseBodyView;
};

const STORAGE_KEY = 'postboy:web:workspace-draft';

const METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

const BODY_MODES: Array<{ value: BodyMode | 'raw'; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'x-www-form-urlencoded', label: 'x-www-form-urlencoded' },
  { value: 'raw', label: 'Raw' },
];

const defaultResponse: ResponseSnapshot = {
  status: 200,
  statusText: 'OK',
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: { message: 'Ready to send request' },
  bodyRaw: '{"message":"Ready to send request"}',
  bodyPretty: JSON.stringify({ message: 'Ready to send request' }, null, 2),
  finalUrl: 'https://api.example.com/status',
  timings: {
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 42,
    totalMs: 42,
  },
};

function createRow(): KeyValueRow {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
  };
}

function createDraft(name: string): RequestDraft {
  return {
    id: crypto.randomUUID(),
    name,
    request: {
      method: 'GET',
      url: 'https://api.example.com',
      headers: {},
      query: {},
      body: {
        mode: 'none',
      },
    },
    params: [createRow()],
    headers: [createRow()],
    auth: {
      mode: 'none',
      bearerToken: '',
      basicUsername: '',
      basicPassword: '',
      apiKey: '',
      apiKeyHeader: 'x-api-key',
    },
    rawEditorMode: 'json',
  };
}

function createInitialState(): WorkspaceState {
  const firstDraft = createDraft('Request 1');
  return {
    drafts: [firstDraft],
    activeDraftId: firstDraft.id,
    activeEditorTab: 'params',
    activeResponseTab: 'body',
    activeResponseBodyView: 'pretty',
  };
}

export default function HomePage() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createInitialState());

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (parsed?.drafts?.length) {
        setWorkspace(parsed);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace]);

  const activeDraft =
    workspace.drafts.find((draft) => draft.id === workspace.activeDraftId) ?? workspace.drafts[0];

  const responseSize = useMemo(
    () => new Blob([defaultResponse.bodyRaw ?? JSON.stringify(defaultResponse.body)]).size,
    [],
  );

  const updateDraft = (updater: (draft: RequestDraft) => RequestDraft) => {
    setWorkspace((prev) => ({
      ...prev,
      drafts: prev.drafts.map((draft) => (draft.id === prev.activeDraftId ? updater(draft) : draft)),
    }));
  };

  const renderGrid = (
    rows: KeyValueRow[],
    onChange: (rows: KeyValueRow[]) => void,
    withEnabled: boolean,
  ) => (
    <div>
      {rows.map((row, index) => (
        <div key={row.id} style={styles.gridRow}>
          {withEnabled && (
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(event) => {
                const nextRows = [...rows];
                nextRows[index] = { ...row, enabled: event.target.checked };
                onChange(nextRows);
              }}
            />
          )}
          <input
            placeholder="Key"
            value={row.key}
            onChange={(event) => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, key: event.target.value };
              onChange(nextRows);
            }}
            style={styles.input}
          />
          <input
            placeholder="Value"
            value={row.value}
            onChange={(event) => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, value: event.target.value };
              onChange(nextRows);
            }}
            style={styles.input}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, createRow()])}
        style={styles.secondaryButton}
      >
        Add row
      </button>
    </div>
  );

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>Postboy</h1>

      <div style={styles.requestTabBar}>
        {workspace.drafts.map((draft) => (
          <button
            key={draft.id}
            type="button"
            style={{
              ...styles.requestTab,
              ...(draft.id === activeDraft.id ? styles.requestTabActive : {}),
            }}
            onClick={() => setWorkspace((prev) => ({ ...prev, activeDraftId: draft.id }))}
          >
            {draft.name}
          </button>
        ))}
        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => {
            const next = createDraft(`Request ${workspace.drafts.length + 1}`);
            setWorkspace((prev) => ({
              ...prev,
              drafts: [...prev.drafts, next],
              activeDraftId: next.id,
            }));
          }}
        >
          + New Request
        </button>
      </div>

      <div style={styles.topBar}>
        <select
          value={activeDraft.request.method}
          onChange={(event) =>
            updateDraft((draft) => ({
              ...draft,
              request: { ...draft.request, method: event.target.value as HttpMethod },
            }))
          }
          style={styles.select}
        >
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        <input
          value={activeDraft.request.url}
          onChange={(event) =>
            updateDraft((draft) => ({
              ...draft,
              request: { ...draft.request, url: event.target.value },
            }))
          }
          style={{ ...styles.input, flex: 1 }}
        />

        <button type="button" style={styles.primaryButton}>
          Send
        </button>
      </div>

      <section style={styles.card}>
        <div style={styles.tabBar}>
          {(['params', 'headers', 'body', 'auth', 'tests'] as RequestEditorTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setWorkspace((prev) => ({ ...prev, activeEditorTab: tab }))}
              style={{ ...styles.tab, ...(workspace.activeEditorTab === tab ? styles.tabActive : {}) }}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {workspace.activeEditorTab === 'params' &&
          renderGrid(activeDraft.params, (rows) => updateDraft((draft) => ({ ...draft, params: rows })), false)}

        {workspace.activeEditorTab === 'headers' &&
          renderGrid(
            activeDraft.headers,
            (rows) => updateDraft((draft) => ({ ...draft, headers: rows })),
            true,
          )}

        {workspace.activeEditorTab === 'body' && (
          <div style={styles.stack}>
            <select
              value={activeDraft.request.body.mode}
              onChange={(event) =>
                updateDraft((draft) => ({
                  ...draft,
                  request: {
                    ...draft.request,
                    body: {
                      ...draft.request.body,
                      mode: event.target.value as BodyMode,
                    },
                  },
                }))
              }
              style={styles.select}
            >
              {BODY_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>

            {activeDraft.request.body.mode === 'raw' && (
              <>
                <select
                  value={activeDraft.rawEditorMode}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      rawEditorMode: event.target.value as RawEditorMode,
                      request: {
                        ...draft.request,
                        body: {
                          ...draft.request.body,
                          contentType:
                            event.target.value === 'json' ? 'application/json' : 'text/plain',
                        },
                      },
                    }))
                  }
                  style={styles.select}
                >
                  <option value="json">Raw JSON</option>
                  <option value="text">Raw Text</option>
                </select>
                <textarea placeholder="Request body" style={styles.textarea} />
              </>
            )}
          </div>
        )}

        {workspace.activeEditorTab === 'auth' && (
          <div style={styles.stack}>
            <select
              value={activeDraft.auth.mode}
              onChange={(event) =>
                updateDraft((draft) => ({
                  ...draft,
                  auth: { ...draft.auth, mode: event.target.value as AuthMode },
                }))
              }
              style={styles.select}
            >
              <option value="none">None</option>
              <option value="bearer">Bearer</option>
              <option value="basic">Basic</option>
              <option value="api-key">API Key</option>
            </select>
            {activeDraft.auth.mode === 'bearer' && (
              <input
                placeholder="Bearer token"
                value={activeDraft.auth.bearerToken}
                onChange={(event) =>
                  updateDraft((draft) => ({
                    ...draft,
                    auth: { ...draft.auth, bearerToken: event.target.value },
                  }))
                }
                style={styles.input}
              />
            )}
            {activeDraft.auth.mode === 'basic' && (
              <>
                <input
                  placeholder="Username"
                  value={activeDraft.auth.basicUsername}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      auth: { ...draft.auth, basicUsername: event.target.value },
                    }))
                  }
                  style={styles.input}
                />
                <input
                  placeholder="Password"
                  type="password"
                  value={activeDraft.auth.basicPassword}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      auth: { ...draft.auth, basicPassword: event.target.value },
                    }))
                  }
                  style={styles.input}
                />
              </>
            )}
            {activeDraft.auth.mode === 'api-key' && (
              <>
                <input
                  placeholder="Header name"
                  value={activeDraft.auth.apiKeyHeader}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      auth: { ...draft.auth, apiKeyHeader: event.target.value },
                    }))
                  }
                  style={styles.input}
                />
                <input
                  placeholder="API key"
                  value={activeDraft.auth.apiKey}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      auth: { ...draft.auth, apiKey: event.target.value },
                    }))
                  }
                  style={styles.input}
                />
              </>
            )}
          </div>
        )}

        {workspace.activeEditorTab === 'tests' && (
          <fieldset disabled style={styles.stack}>
            <textarea
              style={styles.textarea}
              placeholder="Tests are not implemented yet. Script editor will appear here."
            />
          </fieldset>
        )}
      </section>

      <section style={styles.card}>
        <div style={styles.responseMeta}>
          <span style={styles.statusBadge}>{defaultResponse.status}</span>
          <span>{defaultResponse.timings.durationMs} ms</span>
          <span>{responseSize} B</span>
        </div>

        <div style={styles.tabBar}>
          {(['body', 'headers'] as ResponseTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setWorkspace((prev) => ({ ...prev, activeResponseTab: tab }))}
              style={{ ...styles.tab, ...(workspace.activeResponseTab === tab ? styles.tabActive : {}) }}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {workspace.activeResponseTab === 'headers' && (
          <pre style={styles.pre}>{JSON.stringify(defaultResponse.headers, null, 2)}</pre>
        )}

        {workspace.activeResponseTab === 'body' && (
          <>
            <div style={styles.tabBar}>
              {(['pretty', 'raw', 'preview'] as ResponseBodyView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() =>
                    setWorkspace((prev) => ({
                      ...prev,
                      activeResponseBodyView: view,
                    }))
                  }
                  style={{
                    ...styles.tab,
                    ...(workspace.activeResponseBodyView === view ? styles.tabActive : {}),
                  }}
                >
                  {view.toUpperCase()}
                </button>
              ))}
            </div>
            {workspace.activeResponseBodyView === 'pretty' && (
              <pre style={styles.pre}>{defaultResponse.bodyPretty}</pre>
            )}
            {workspace.activeResponseBodyView === 'raw' && (
              <pre style={styles.pre}>{defaultResponse.bodyRaw}</pre>
            )}
            {workspace.activeResponseBodyView === 'preview' && (
              <div style={styles.preview}>{String((defaultResponse.body as { message: string }).message)}</div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: '1.5rem',
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'grid',
    gap: '1rem',
    fontFamily: 'Inter, Arial, sans-serif',
  },
  title: { margin: 0 },
  requestTabBar: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
  requestTab: {
    border: '1px solid #d1d5db',
    background: '#fff',
    padding: '0.35rem 0.75rem',
    borderRadius: 8,
  },
  requestTabActive: {
    background: '#eef2ff',
    borderColor: '#6366f1',
  },
  topBar: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '1rem',
    display: 'grid',
    gap: '0.75rem',
    background: '#fff',
  },
  tabBar: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  tab: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    background: '#fff',
    padding: '0.35rem 0.7rem',
    fontSize: '0.8rem',
  },
  tabActive: {
    borderColor: '#0f766e',
    background: '#f0fdfa',
  },
  gridRow: { display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' },
  input: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '0.45rem 0.65rem',
  },
  textarea: {
    minHeight: 120,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '0.65rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  select: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '0.45rem 0.65rem',
  },
  primaryButton: {
    border: '1px solid #0f766e',
    background: '#0f766e',
    color: '#fff',
    borderRadius: 8,
    padding: '0.45rem 0.9rem',
  },
  secondaryButton: {
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: 8,
    padding: '0.4rem 0.8rem',
  },
  stack: { display: 'grid', gap: '0.5rem' },
  responseMeta: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
  statusBadge: {
    background: '#dcfce7',
    color: '#15803d',
    borderRadius: 999,
    padding: '0.2rem 0.65rem',
    fontWeight: 700,
  },
  pre: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    margin: 0,
    padding: '0.75rem',
    overflowX: 'auto',
    background: '#f8fafc',
  },
  preview: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '1rem',
    background: '#fff',
  },
};
