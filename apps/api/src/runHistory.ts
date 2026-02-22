import type { RequestDefinition, ResponseSnapshot } from '@postboy/shared';

export type RunHistoryEntry = {
  id: string;
  requestName?: string;
  executedAt: string;
  request: RequestDefinition;
  response: ResponseSnapshot;
};

export const historyToJson = (entries: RunHistoryEntry[]): string => JSON.stringify(entries, null, 2);

const esc = (value: string): string => `"${value.replaceAll('"', '""')}"`;

export const historyToCsv = (entries: RunHistoryEntry[]): string => {
  const header = ['id', 'executedAt', 'requestName', 'method', 'url', 'status', 'durationMs'];
  const rows = entries.map((entry) => [
    entry.id,
    entry.executedAt,
    entry.requestName ?? '',
    entry.request.method,
    entry.request.url,
    String(entry.response.status),
    String(entry.response.timings.durationMs),
  ]);

  return [header, ...rows].map((row) => row.map((col) => esc(col)).join(',')).join('\n');
};
