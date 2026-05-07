export default function ApiDocsPage() {
  const baseUrl = "/api/v1";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Developer Docs</p>
        <h1 className="text-3xl font-bold tracking-tight">OpenAI-Compatible API</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Use Complexity as a drop-in chat backend for OpenAI-compatible clients. Authenticate with a personal API token from your profile page.
        </p>
      </div>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Base URL</h2>
        <div className="rounded-xl border bg-muted/40 p-4 font-mono text-sm">
          {baseUrl}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Authentication</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Send your personal token in either the `Authorization` header or `X-API-Key`.
        </p>
        <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-4 text-sm leading-6">
{`Authorization: Bearer ctok_...
X-API-Key: ctok_...`}
        </pre>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Chat Completions</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          `POST ${baseUrl}/chat/completions`
        </p>
        <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-4 text-sm leading-6">{`curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ctok_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-4-6-sonnet-latest",
    "messages": [
      { "role": "system", "content": "You are concise." },
      { "role": "user", "content": "Explain token auth in one sentence." }
    ],
    "stream": false
  }'`}</pre>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Models</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          `GET ${baseUrl}/models`
        </p>
        <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-4 text-sm leading-6">{`curl ${baseUrl}/models \\
  -H "Authorization: Bearer ctok_..."`}</pre>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Responses API</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          `POST ${baseUrl}/responses`
        </p>
        <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-4 text-sm leading-6">{`curl ${baseUrl}/responses \\
  -H "Authorization: Bearer ctok_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-4-6-sonnet-latest",
    "input": "Summarize token auth in one sentence.",
    "stream": false
  }'`}</pre>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Client Examples</h2>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Cursor and other OpenAI-compatible clients usually want a base URL of `https://your-host/api/v1` and the token as the API key.
          </p>
          <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-4 text-sm leading-6">{`Base URL: ${baseUrl}
API Key: ctok_...`}</pre>
          <p>
            Open WebUI can point to the same base URL and token. If it probes models first, `/api/v1/models` is already available.
          </p>
        </div>
      </section>
    </div>
  );
}
