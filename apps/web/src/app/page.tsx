import type { RequestDefinition } from '@postboy/shared';

const sampleRequest: RequestDefinition = {
  method: 'GET',
  url: 'https://api.example.com/health',
  headers: { accept: 'application/json' },
  query: {},
  body: {
    mode: 'none',
  },
};

export default function HomePage() {
  return (
    <main>
      <h1>Postboy Web</h1>
      <p>Workspace bootstrapped with Next.js + shared contracts.</p>
      <pre>{JSON.stringify(sampleRequest, null, 2)}</pre>
    </main>
  );
}
