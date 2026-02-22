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
  headers: Record<string, string>;
  body: unknown;
  timings: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

export interface Variable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: Variable[];
}

export interface Folder {
  id: string;
  name: string;
  requestIds: string[];
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  folders: Folder[];
  requests: RequestDefinition[];
  environments: Environment[];
  createdAt: string;
  updatedAt: string;
}
