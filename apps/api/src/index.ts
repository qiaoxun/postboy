import Fastify from 'fastify';
import { request as undiciRequest } from 'undici';
import type { Environment, RequestDefinition, ResponseSnapshot, Variable } from '@postboy/shared';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_RESPONSE_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_REDACT_HEADERS = ['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key'];

const server = Fastify({ logger: true });

type ExecutePayload = {
  request: RequestDefinition;
  environment?: Environment | null;
  overrides?: Record<string, string>;
  options?: {
    timeoutMs?: number;
    maxRedirects?: number;
    maxResponseSizeBytes?: number;
    downloadBinary?: boolean;
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObject(value) && Object.values(value).every((entry) => typeof entry === 'string');

const isValidRequestDefinition = (value: unknown): value is RequestDefinition => {
  if (!isObject(value)) {
    return false;
  }

  const body = value.body;
  if (!isObject(body) || typeof body.mode !== 'string') {
    return false;
  }

  const validMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  const validModes = new Set(['none', 'raw', 'form-data', 'x-www-form-urlencoded', 'binary']);

  return (
    validMethods.has(String(value.method)) &&
    typeof value.url === 'string' &&
    isStringRecord(value.headers) &&
    isStringRecord(value.query) &&
    validModes.has(String(body.mode))
  );
};

const normalizeHeaders = (headers: Record<string, string>): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.trim().toLowerCase()] = String(value);
  }
  return normalized;
};

const templateRegex = /{{\s*([\w.-]+)\s*}}/g;

const resolveTemplate = (input: string, variables: Record<string, string>): string =>
  input.replace(templateRegex, (fullMatch, key: string) => variables[key] ?? fullMatch);

const variableMapFromEnvironment = (environment?: Environment | null): Record<string, string> => {
  if (!environment) {
    return {};
  }

  return environment.variables.reduce<Record<string, string>>((acc, variable: Variable) => {
    if (variable.enabled) {
      acc[variable.key] = variable.value;
    }
    return acc;
  }, {});
};

const shouldTreatAsText = (contentType?: string): boolean => {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith('text/') ||
    normalized.includes('json') ||
    normalized.includes('xml') ||
    normalized.includes('javascript') ||
    normalized.includes('x-www-form-urlencoded')
  );
};

const parseBodyContent = (bodyText: string): unknown => {
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
};

const getRedactedHeaderNames = (): Set<string> => {
  const configured = process.env.REDACT_HEADERS?.split(',').map((key) => key.trim().toLowerCase()).filter(Boolean);
  return new Set(configured && configured.length > 0 ? configured : DEFAULT_REDACT_HEADERS);
};

const redactHeaders = (headers: Record<string, string>, headerNames: Set<string>): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = headerNames.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return result;
};

server.get('/health', async () => {
  const now = new Date().toISOString();
  const response: ResponseSnapshot = {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: { ok: true },
    bodyRaw: '{"ok":true}',
    bodyPretty: '{\n  "ok": true\n}',
    isBinary: false,
    timings: {
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      totalMs: 0,
    },
  };

  return response;
});

server.post('/execute', async (req, reply) => {
  const payload = req.body as ExecutePayload;

  if (!isObject(payload) || !isValidRequestDefinition(payload.request)) {
    return reply.status(400).send({ message: 'Invalid payload: request must match RequestDefinition.' });
  }

  const { request: requestDefinition, overrides = {}, options } = payload;

  if (!isStringRecord(overrides)) {
    return reply.status(400).send({ message: 'Invalid payload: overrides must be a key/value string map.' });
  }

  const timeoutMs = Math.max(1_000, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxRedirects = Math.max(0, options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS);
  const maxResponseSizeBytes = Math.max(1_024, options?.maxResponseSizeBytes ?? DEFAULT_MAX_RESPONSE_SIZE_BYTES);
  const downloadBinary = Boolean(options?.downloadBinary);

  const baseVariables = variableMapFromEnvironment(payload.environment);
  const resolvedVariables = { ...baseVariables, ...overrides };

  const resolvedUrl = resolveTemplate(requestDefinition.url, resolvedVariables);
  const resolvedQuery = Object.fromEntries(
    Object.entries(requestDefinition.query).map(([key, value]) => [key, resolveTemplate(value, resolvedVariables)]),
  );
  const resolvedHeaders = normalizeHeaders(
    Object.fromEntries(
      Object.entries(requestDefinition.headers).map(([key, value]) => [key, resolveTemplate(value, resolvedVariables)]),
    ),
  );

  let url: URL;
  try {
    url = new URL(resolvedUrl);
  } catch {
    return reply.status(400).send({ message: `Invalid URL after variable resolution: ${resolvedUrl}` });
  }

  for (const [key, value] of Object.entries(resolvedQuery)) {
    url.searchParams.set(key, value);
  }

  const startedAtEpoch = Date.now();
  const startedAtIso = new Date(startedAtEpoch).toISOString();

  const requestBody = (() => {
    const body = requestDefinition.body;
    if (body.mode === 'none') {
      return undefined;
    }

    if (body.mode === 'raw') {
      const content = typeof body.content === 'string' ? resolveTemplate(body.content, resolvedVariables) : JSON.stringify(body.content ?? {});
      if (!resolvedHeaders['content-type'] && body.contentType) {
        resolvedHeaders['content-type'] = body.contentType;
      }
      return content;
    }

    if (body.mode === 'x-www-form-urlencoded' && isObject(body.content)) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body.content)) {
        params.set(key, resolveTemplate(String(value), resolvedVariables));
      }
      resolvedHeaders['content-type'] = resolvedHeaders['content-type'] ?? 'application/x-www-form-urlencoded';
      return params.toString();
    }

    if (body.mode === 'binary' && typeof body.content === 'string') {
      return body.content;
    }

    if (body.mode === 'form-data' && isObject(body.content)) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(body.content)) {
        formData.append(key, resolveTemplate(String(value), resolvedVariables));
      }
      return formData;
    }

    return typeof body.content === 'string' ? resolveTemplate(body.content, resolvedVariables) : JSON.stringify(body.content ?? {});
  })();

  try {
    const response = await undiciRequest(url, {
      method: requestDefinition.method,
      headers: resolvedHeaders,
      body: requestBody,
      maxRedirections: maxRedirects,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });

    const ttfbAt = Date.now();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    let truncated = false;

    for await (const chunk of response.body) {
      const chunkLength = chunk.byteLength;
      if (byteLength + chunkLength > maxResponseSizeBytes) {
        const allowedLength = Math.max(maxResponseSizeBytes - byteLength, 0);
        if (allowedLength > 0) {
          chunks.push(chunk.slice(0, allowedLength));
          byteLength += allowedLength;
        }
        truncated = true;
        break;
      }
      chunks.push(chunk);
      byteLength += chunkLength;
    }

    if (truncated) {
      response.body.destroy();
    }

    const completedAtEpoch = Date.now();
    const completedAtIso = new Date(completedAtEpoch).toISOString();
    const rawBodyBuffer = Buffer.concat(chunks);
    const contentType = String(response.headers['content-type'] ?? '');
    const responseHeaders = normalizeHeaders(
      Object.fromEntries(
        Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]),
      ),
    );

    const isBinary = !shouldTreatAsText(contentType);
    const rawText = isBinary ? rawBodyBuffer.toString('base64') : rawBodyBuffer.toString('utf-8');

    const body = isBinary
      ? {
          encoding: 'base64',
          sizeBytes: rawBodyBuffer.byteLength,
          downloadable: downloadBinary,
          data: downloadBinary ? rawText : undefined,
        }
      : parseBodyContent(rawText);

    const bodyPretty = isBinary
      ? undefined
      : typeof body === 'string'
        ? body
        : JSON.stringify(body, null, 2);

    const snapshot: ResponseSnapshot = {
      status: response.statusCode,
      statusText: response.statusText,
      headers: responseHeaders,
      body,
      bodyRaw: rawText,
      bodyPretty,
      isBinary,
      truncated,
      finalUrl: url.toString(),
      timings: {
        startedAt: startedAtIso,
        completedAt: completedAtIso,
        durationMs: completedAtEpoch - startedAtEpoch,
        ttfbMs: ttfbAt - startedAtEpoch,
        totalMs: completedAtEpoch - startedAtEpoch,
      },
    };

    const redactedHeaders = redactHeaders(responseHeaders, getRedactedHeaderNames());
    req.log.info(
      {
        request: {
          method: requestDefinition.method,
          url: url.toString(),
          headers: redactHeaders(resolvedHeaders, getRedactedHeaderNames()),
        },
        response: {
          status: response.statusCode,
          headers: redactedHeaders,
          truncated,
          sizeBytes: rawBodyBuffer.byteLength,
        },
      },
      'Executed outbound request',
    );

    return snapshot;
  } catch (error) {
    req.log.error({ err: error }, 'Outbound request failed');
    return reply.status(502).send({
      message: 'Failed to execute outbound request.',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

const port = Number(process.env.PORT ?? 4000);
await server.listen({ port, host: '0.0.0.0' });
