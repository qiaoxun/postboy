import type {
  AuthConfig,
  BodyMode,
  Collection,
  CollectionFolder,
  CollectionRequest,
  RequestDefinition,
  Variable,
} from '@postboy/shared';

type PostmanKeyValue = { key: string; value?: string; disabled?: boolean; type?: string; src?: string };

type PostmanAuth = Record<string, PostmanKeyValue[] | string> & { type?: string };

type PostmanUrl =
  | string
  | {
      raw?: string;
      host?: string[];
      path?: string[];
      query?: PostmanKeyValue[];
    };

type PostmanRequest = {
  method?: string;
  header?: PostmanKeyValue[];
  auth?: PostmanAuth;
  body?: {
    mode?: string;
    raw?: string;
    formdata?: PostmanKeyValue[];
    urlencoded?: PostmanKeyValue[];
    file?: { src?: string };
    options?: { raw?: { language?: string } };
  };
  url?: PostmanUrl;
  description?: string;
};

type PostmanItem = {
  id?: string;
  name?: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
  auth?: PostmanAuth;
};

type PostmanCollection = {
  info?: { name?: string; description?: string | { content?: string }; schema?: string };
  auth?: PostmanAuth;
  variable?: Array<{ id?: string; key?: string; value?: string; disabled?: boolean; type?: string }>;
  item?: PostmanItem[];
};

const nowIso = () => new Date().toISOString();
const genId = () => crypto.randomUUID();

const toRecord = (pairs: PostmanKeyValue[] = []): Record<string, string> =>
  pairs.reduce<Record<string, string>>((acc, pair) => {
    if (!pair?.key || pair.disabled) {
      return acc;
    }
    acc[pair.key] = pair.value ?? '';
    return acc;
  }, {});

const fromRecord = (value: Record<string, string>): PostmanKeyValue[] =>
  Object.entries(value).map(([key, val]) => ({ key, value: val }));

const normalizeMethod = (method?: string): RequestDefinition['method'] => {
  const fallback: RequestDefinition['method'] = 'GET';
  const normalized = String(method ?? '').toUpperCase();
  const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  return methods.has(normalized) ? (normalized as RequestDefinition['method']) : fallback;
};

const parseUrl = (url?: PostmanUrl): { rawUrl: string; query: Record<string, string> } => {
  if (typeof url === 'string') {
    return { rawUrl: url, query: {} };
  }

  if (!url) {
    return { rawUrl: '', query: {} };
  }

  const rawFromParts = `${(url.host ?? []).join('.')}/${(url.path ?? []).join('/')}`;
  return {
    rawUrl: url.raw ?? rawFromParts,
    query: toRecord(url.query),
  };
};

const stringifyUrl = (url: string, query: Record<string, string>): PostmanUrl => ({
  raw: url,
  query: fromRecord(query),
});

const parseAuth = (auth?: PostmanAuth): AuthConfig | undefined => {
  if (!auth || typeof auth.type !== 'string' || auth.type.length === 0) {
    return undefined;
  }

  const entries = auth[auth.type];
  if (!Array.isArray(entries)) {
    return { type: auth.type, params: {} };
  }

  return {
    type: auth.type,
    params: entries.reduce<Record<string, string>>((acc, entry) => {
      if (entry?.key && !entry.disabled) {
        acc[entry.key] = entry.value ?? '';
      }
      return acc;
    }, {}),
  };
};

const serializeAuth = (auth?: AuthConfig): PostmanAuth | undefined => {
  if (!auth) {
    return undefined;
  }

  return {
    type: auth.type,
    [auth.type]: fromRecord(auth.params),
  };
};

const parseBody = (requestBody?: PostmanRequest['body']): RequestDefinition['body'] => {
  if (!requestBody || !requestBody.mode) {
    return { mode: 'none' };
  }

  const modeMap: Record<string, BodyMode> = {
    raw: 'raw',
    formdata: 'form-data',
    urlencoded: 'x-www-form-urlencoded',
    file: 'binary',
  };

  const mapped = modeMap[requestBody.mode] ?? 'none';

  if (mapped === 'raw') {
    return {
      mode: 'raw',
      contentType: requestBody.options?.raw?.language
        ? `application/${requestBody.options.raw.language}`
        : 'application/json',
      content: requestBody.raw ?? '',
    };
  }

  if (mapped === 'form-data') {
    return { mode: 'form-data', content: toRecord(requestBody.formdata) };
  }

  if (mapped === 'x-www-form-urlencoded') {
    return { mode: 'x-www-form-urlencoded', content: toRecord(requestBody.urlencoded) };
  }

  if (mapped === 'binary') {
    return { mode: 'binary', content: requestBody.file?.src ?? '' };
  }

  return { mode: 'none' };
};

const serializeBody = (body: RequestDefinition['body']): PostmanRequest['body'] | undefined => {
  if (body.mode === 'none') {
    return undefined;
  }

  if (body.mode === 'raw') {
    return {
      mode: 'raw',
      raw: typeof body.content === 'string' ? body.content : JSON.stringify(body.content ?? ''),
      options: {
        raw: {
          language: body.contentType?.split('/')[1] ?? 'json',
        },
      },
    };
  }

  if (body.mode === 'form-data') {
    return { mode: 'formdata', formdata: fromRecord((body.content as Record<string, string>) ?? {}) };
  }

  if (body.mode === 'x-www-form-urlencoded') {
    return { mode: 'urlencoded', urlencoded: fromRecord((body.content as Record<string, string>) ?? {}) };
  }

  if (body.mode === 'binary') {
    return { mode: 'file', file: { src: String(body.content ?? '') } };
  }

  return undefined;
};

const parseItem = (item: PostmanItem, inheritedAuth?: AuthConfig): CollectionFolder | CollectionRequest => {
  const ownAuth = parseAuth(item.auth);
  const effectiveAuth = ownAuth ?? inheritedAuth;
  if (Array.isArray(item.item)) {
    const parsedChildren = item.item.map((entry) => parseItem(entry, effectiveAuth));
    return {
      id: item.id ?? genId(),
      name: item.name ?? 'Folder',
      folders: parsedChildren.filter((entry): entry is CollectionFolder => 'folders' in entry),
      requests: parsedChildren.filter((entry): entry is CollectionRequest => 'definition' in entry),
      auth: ownAuth,
    };
  }

  const request = item.request ?? {};
  const { rawUrl, query } = parseUrl(request.url);
  return {
    id: item.id ?? genId(),
    name: item.name ?? 'Request',
    definition: {
      method: normalizeMethod(request.method),
      url: rawUrl,
      headers: toRecord(request.header),
      query,
      body: parseBody(request.body),
    },
    auth: parseAuth(request.auth ?? item.auth) ?? inheritedAuth,
    variables: [],
  };
};

const serializeRequest = (request: CollectionRequest): PostmanItem => ({
  id: request.id,
  name: request.name,
  request: {
    method: request.definition.method,
    header: fromRecord(request.definition.headers),
    url: stringifyUrl(request.definition.url, request.definition.query),
    body: serializeBody(request.definition.body),
    auth: serializeAuth(request.auth),
  },
});

const serializeFolder = (folder: CollectionFolder): PostmanItem => ({
  id: folder.id,
  name: folder.name,
  auth: serializeAuth(folder.auth),
  item: [...folder.folders.map(serializeFolder), ...folder.requests.map(serializeRequest)],
});

export const importPostmanCollection = (raw: string): Collection => {
  const parsed = JSON.parse(raw) as PostmanCollection;
  const now = nowIso();
  const collectionAuth = parseAuth(parsed.auth);
  const allItems = (parsed.item ?? []).map((entry) => parseItem(entry, collectionAuth));

  return {
    id: genId(),
    name: parsed.info?.name ?? 'Imported Collection',
    description:
      typeof parsed.info?.description === 'string'
        ? parsed.info.description
        : parsed.info?.description?.content,
    folders: allItems.filter((entry): entry is CollectionFolder => 'folders' in entry),
    requests: allItems.filter((entry): entry is CollectionRequest => 'definition' in entry),
    auth: collectionAuth,
    createdAt: now,
    updatedAt: now,
  };
};

export const exportPostmanCollection = (collection: Collection): PostmanCollection => ({
  info: {
    name: collection.name,
    description: collection.description,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: serializeAuth(collection.auth),
  variable: flattenVariables(collection),
  item: [...collection.folders.map(serializeFolder), ...collection.requests.map(serializeRequest)],
});

const flattenVariables = (collection: Collection): Variable[] => {
  const all: Variable[] = [];
  for (const request of collection.requests) {
    all.push(...(request.variables ?? []));
  }

  const walk = (folder: CollectionFolder) => {
    for (const req of folder.requests) {
      all.push(...(req.variables ?? []));
    }
    for (const child of folder.folders) {
      walk(child);
    }
  };

  for (const folder of collection.folders) {
    walk(folder);
  }

  return all;
};
