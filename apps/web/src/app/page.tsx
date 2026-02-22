'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import type {
  Collection,
  CollectionFolder,
  CollectionRequest,
  Environment,
  HttpMethod,
  RequestDefinition,
  Variable,
} from '@postboy/shared';

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
};

type RequestDraft = {
  id: string;
  name: string;
  request: RequestDefinition;
  localVariables: KeyValueRow[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function createDraft(): RequestDraft {
  return {
    id: crypto.randomUUID(),
    name: 'Request',
    request: {
      method: 'GET',
      url: 'https://api.example.com/{{version}}/users/{{id}}',
      headers: {},
      query: {},
      body: { mode: 'none' },
    },
    localVariables: [
      { id: crypto.randomUUID(), key: 'id', value: '123', enabled: true },
      { id: crypto.randomUUID(), key: 'token', value: 'local-token', enabled: true, secret: true },
    ],
  };
}

function kvToVariables(rows: KeyValueRow[]): Variable[] {
  return rows
    .filter((row) => row.key.trim())
    .map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      enabled: row.enabled,
      secret: row.secret,
    }));
}

function variableMap(variables: Variable[]): Record<string, string> {
  return variables.reduce<Record<string, string>>((acc, variable) => {
    if (variable.enabled) {
      acc[variable.key] = variable.value;
    }
    return acc;
  }, {});
}

function resolveWithPrecedence(input: string, local: Variable[], env: Variable[], globalVars: Variable[]) {
  const merged = {
    ...variableMap(globalVars),
    ...variableMap(env),
    ...variableMap(local),
  };
  return input.replace(/{{\s*([\w.-]+)\s*}}/g, (full, key: string) => merged[key] ?? full);
}

function emptyFolder(name = 'Folder'): CollectionFolder {
  return { id: crypto.randomUUID(), name, folders: [], requests: [] };
}

export default function HomePage() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [globalVariables, setGlobalVariables] = useState<KeyValueRow[]>([
    { id: crypto.randomUUID(), key: 'version', value: 'v1', enabled: true },
    { id: crypto.randomUUID(), key: 'id', value: 'global-id', enabled: true },
  ]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string>('');
  const [activeDraft, setActiveDraft] = useState<RequestDraft>(() => createDraft());
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');

  const activeEnvironment = environments.find((entry) => entry.id === activeEnvironmentId);

  useEffect(() => {
    const load = async () => {
      const [collectionsRes, environmentsRes] = await Promise.all([
        fetch(`${API_BASE}/collections`),
        fetch(`${API_BASE}/environments`),
      ]);
      const loadedCollections = (await collectionsRes.json()) as Collection[];
      const loadedEnvironments = (await environmentsRes.json()) as Environment[];
      setCollections(loadedCollections);
      setEnvironments(loadedEnvironments);
      if (loadedCollections[0]) {
        setSelectedCollectionId(loadedCollections[0].id);
      }
      if (loadedEnvironments[0]) {
        setActiveEnvironmentId(loadedEnvironments[0].id);
      }
    };

    load().catch(console.error);
  }, []);

  const resolvedUrl = useMemo(
    () =>
      resolveWithPrecedence(
        activeDraft.request.url,
        kvToVariables(activeDraft.localVariables),
        activeEnvironment?.variables ?? [],
        kvToVariables(globalVariables),
      ),
    [activeDraft.request.url, activeDraft.localVariables, activeEnvironment?.variables, globalVariables],
  );

  const saveCollections = async (nextCollections: Collection[]) => {
    setCollections(nextCollections);
    const selected = nextCollections.find((entry) => entry.id === selectedCollectionId);
    if (!selected && nextCollections[0]) {
      setSelectedCollectionId(nextCollections[0].id);
    }
  };

  const createCollection = async () => {
    const res = await fetch(`${API_BASE}/collections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `Collection ${collections.length + 1}`, folders: [], requests: [] }),
    });
    const created = (await res.json()) as Collection;
    await saveCollections([...collections, created]);
    setSelectedCollectionId(created.id);
  };

  const saveRequestToCollection = async () => {
    const collection = collections.find((entry) => entry.id === selectedCollectionId);
    if (!collection) return;

    const requestToSave: CollectionRequest = {
      id: crypto.randomUUID(),
      name: activeDraft.name,
      definition: activeDraft.request,
      variables: kvToVariables(activeDraft.localVariables),
    };

    const addToFolder = (folders: CollectionFolder[]): CollectionFolder[] =>
      folders.map((folder) => {
        if (folder.id === selectedFolderId) {
          return { ...folder, requests: [...folder.requests, requestToSave] };
        }

        return { ...folder, folders: addToFolder(folder.folders) };
      });

    const next: Collection = selectedFolderId
      ? { ...collection, folders: addToFolder(collection.folders), updatedAt: new Date().toISOString() }
      : { ...collection, requests: [...collection.requests, requestToSave], updatedAt: new Date().toISOString() };

    const res = await fetch(`${API_BASE}/collections/${collection.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    const saved = (await res.json()) as Collection;
    await saveCollections(collections.map((entry) => (entry.id === saved.id ? saved : entry)));
  };

  const renderTree = (folders: CollectionFolder[], depth = 0): ReactNode =>
    folders.map((folder) => (
      <div key={folder.id}>
        <button
          type="button"
          style={{ ...styles.treeItem, marginLeft: depth * 12, ...(selectedFolderId === folder.id ? styles.activeTree : {}) }}
          onClick={() => setSelectedFolderId(folder.id)}
        >
          📁 {folder.name}
        </button>
        {folder.requests.map((request) => (
          <div key={request.id} style={{ ...styles.leaf, marginLeft: depth * 12 + 18 }}>
            📄 {request.name}
          </div>
        ))}
        {renderTree(folder.folders, depth + 1)}
      </div>
    ));

  const updateEnvironmentVariable = (envId: string, rows: KeyValueRow[]) => {
    const next = environments.map((env) =>
      env.id === envId ? { ...env, variables: kvToVariables(rows), updatedAt: new Date().toISOString() } : env,
    );
    setEnvironments(next);
    const env = next.find((entry) => entry.id === envId);
    if (!env) return;
    fetch(`${API_BASE}/environments/${envId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(env),
    }).catch(console.error);
  };

  const activeEnvironmentRows: KeyValueRow[] =
    activeEnvironment?.variables.map((variable) => ({ ...variable, secret: variable.secret })) ?? [];

  const importCollectionFromFile = async (file: File) => {
    const postmanJson = await file.text();
    const res = await fetch(`${API_BASE}/collections/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postmanJson }),
    });

    if (!res.ok) {
      console.error(await res.text());
      return;
    }

    const imported = (await res.json()) as Collection;
    setCollections((prev) => [...prev, imported]);
  };

  const exportCollectionNode = async (collectionId: string, collectionName: string) => {
    const res = await fetch(`${API_BASE}/collections/${collectionId}/export`);
    if (!res.ok) {
      console.error(await res.text());
      return;
    }

    const payload = await res.json();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collectionName.replace(/\s+/g, '-').toLowerCase() || 'collection'}.postman_collection.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={styles.page}>
      <aside style={styles.sidebar}>
        <h3>Collections</h3>
        <button onClick={createCollection} style={styles.button} type="button">
          + Collection
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) {
              await importCollectionFromFile(file);
            }
            event.target.value = '';
          }}
        />
        <button type="button" style={styles.button} onClick={() => importInputRef.current?.click()}>
          Import Collection
        </button>
        {collections.map((collection) => (
          <div key={collection.id}>
            <button
              type="button"
              style={{ ...styles.treeItem, ...(collection.id === selectedCollectionId ? styles.activeTree : {}) }}
              onClick={() => {
                setSelectedCollectionId(collection.id);
                setSelectedFolderId('');
              }}
            >
              🗂 {collection.name}
            </button>
            {collection.requests.map((request) => (
              <div key={request.id} style={styles.leaf}>
                📄 {request.name}
              </div>
            ))}
            {renderTree(collection.folders)}
            <button
              type="button"
              style={styles.smallButton}
              onClick={() => exportCollectionNode(collection.id, collection.name)}
            >
              Export Collection
            </button>
            <button
              type="button"
              style={styles.smallButton}
              onClick={async () => {
                const next = {
                  ...collection,
                  folders: [...collection.folders, emptyFolder(`Folder ${collection.folders.length + 1}`)],
                };
                const res = await fetch(`${API_BASE}/collections/${collection.id}`, {
                  method: 'PUT',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(next),
                });
                const saved = (await res.json()) as Collection;
                setCollections((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)));
              }}
            >
              + Folder
            </button>
          </div>
        ))}
      </aside>

      <section style={styles.main}>
        <h1>Postboy</h1>
        <div style={styles.row}>
          <select
            value={activeDraft.request.method}
            onChange={(event) =>
              setActiveDraft((prev) => ({
                ...prev,
                request: { ...prev.request, method: event.target.value as HttpMethod },
              }))
            }
          >
            {METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
          <input
            value={activeDraft.request.url}
            onChange={(event) =>
              setActiveDraft((prev) => ({ ...prev, request: { ...prev.request, url: event.target.value } }))
            }
            style={styles.input}
          />
          <button type="button" onClick={saveRequestToCollection} style={styles.button}>
            Save Request
          </button>
        </div>
        <small>Resolved URL (local &gt; environment &gt; global): {resolvedUrl}</small>

        <h3>Environment</h3>
        <div style={styles.row}>
          <select value={activeEnvironmentId} onChange={(event) => setActiveEnvironmentId(event.target.value)}>
            <option value="">No environment</option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={styles.button}
            onClick={async () => {
              const res = await fetch(`${API_BASE}/environments`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: `Environment ${environments.length + 1}`, variables: [] }),
              });
              const created = (await res.json()) as Environment;
              setEnvironments((prev) => [...prev, created]);
              setActiveEnvironmentId(created.id);
            }}
          >
            + Environment
          </button>
        </div>

        <h3>Environment Variables</h3>
        {activeEnvironment && (
          <div style={styles.stack}>
            {activeEnvironmentRows.map((row, index) => (
              <div style={styles.row} key={row.id}>
                <input
                  value={row.key}
                  onChange={(event) => {
                    const next = [...activeEnvironmentRows];
                    next[index] = { ...row, key: event.target.value };
                    updateEnvironmentVariable(activeEnvironment.id, next);
                  }}
                  placeholder="Key"
                />
                <input
                  type={row.secret ? 'password' : 'text'}
                  value={row.value}
                  onChange={(event) => {
                    const next = [...activeEnvironmentRows];
                    next[index] = { ...row, value: event.target.value };
                    updateEnvironmentVariable(activeEnvironment.id, next);
                  }}
                  placeholder="Value"
                />
                <label>
                  Secret
                  <input
                    type="checkbox"
                    checked={Boolean(row.secret)}
                    onChange={(event) => {
                      const next = [...activeEnvironmentRows];
                      next[index] = { ...row, secret: event.target.checked };
                      updateEnvironmentVariable(activeEnvironment.id, next);
                    }}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              style={styles.smallButton}
              onClick={() =>
                updateEnvironmentVariable(activeEnvironment.id, [
                  ...activeEnvironmentRows,
                  { id: crypto.randomUUID(), key: '', value: '', enabled: true, secret: false },
                ])
              }
            >
              + Variable
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: '100vh', gap: '1rem', padding: '1rem' },
  sidebar: { border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem', display: 'grid', alignContent: 'start', gap: '0.5rem' },
  main: { border: '1px solid #ddd', borderRadius: 8, padding: '1rem', display: 'grid', alignContent: 'start', gap: '0.75rem' },
  row: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
  stack: { display: 'grid', gap: '0.5rem' },
  input: { flex: 1 },
  button: { padding: '0.4rem 0.75rem' },
  smallButton: { fontSize: '0.8rem', padding: '0.25rem 0.5rem' },
  treeItem: { width: '100%', textAlign: 'left', padding: '0.35rem', background: '#fff', border: '1px solid #ddd', borderRadius: 6 },
  activeTree: { background: '#ecfeff', borderColor: '#0891b2' },
  leaf: { fontSize: '0.85rem', color: '#475569', padding: '0.2rem 0.35rem 0.2rem 1rem' },
};
