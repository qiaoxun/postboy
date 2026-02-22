export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type BodyMode = 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary';

export interface RequestDefinition {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: {
    mode: BodyMode;
    contentType?: string;
    content?: unknown;
  };
}

export interface ResponseSnapshot {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: unknown;
  bodyRaw?: string;
  bodyPretty?: string;
  isBinary?: boolean;
  truncated?: boolean;
  finalUrl?: string;
  timings: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    dnsMs?: number;
    connectMs?: number;
    ttfbMs?: number;
    totalMs?: number;
  };
}

export interface Variable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
  scope?: 'global' | 'environment' | 'local';
}

export interface Environment {
  id: string;
  name: string;
  variables: Variable[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionRequest {
  id: string;
  name: string;
  definition: RequestDefinition;
  variables?: Variable[];
}

export interface CollectionFolder {
  id: string;
  name: string;
  folders: CollectionFolder[];
  requests: CollectionRequest[];
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  folders: CollectionFolder[];
  requests: CollectionRequest[];
  createdAt: string;
  updatedAt: string;
}
