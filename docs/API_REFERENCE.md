# API Reference

All API routes are served from the Next.js app under `app/src/app/api`.

Terminology note: “Roles” is the canonical product term. For database compatibility, roles are stored in the `spaces` table and referenced via `space_id` foreign keys.

## Auth

### `POST /api/auth/register`
Create a credentials-based user account.

Body:

```json
{
  "email": "user@example.com",
  "password": "min-8-chars",
  "name": "Optional"
}
```

Responses:

- `200` success
- `400` invalid payload
- `409` email already exists

### `/api/auth/[...nextauth]`
Auth.js handler for credentials session management.

## Chat

### `POST /api/chat`
Primary streaming chat endpoint.

Body:

```json
{
  "threadId": "thread_cuid",
  "model": "pro-search",
  "messages": [/* AI SDK UI messages */],
  "spaceId": "optional_space_id"
}
```

Behavior:

- Requires authenticated session
- Enforces per-user rate limit via Redis
- Uses Redis response caching for repeated prompts
- Validates thread ownership and space ownership
- Injects RAG context when `spaceId` is present
- Streams assistant response and persists messages

Responses:

- `200` streaming response
- `400` validation errors / thread-space mismatch
- `401` unauthorized
- `404` thread or space not found
- `429` rate limit exceeded

## Threads

### `GET /api/threads`
List current user's threads ordered by most recent update.

### `POST /api/threads`
Create a new thread.

Body:

```json
{
  "title": "Thread title",
  "model": "pro-search",
  "spaceId": "optional_space_id"
}
```

### `GET /api/threads/[threadId]`
Get thread metadata and all persisted messages.

### `PATCH /api/threads/[threadId]`
Rename a thread.

### `DELETE /api/threads/[threadId]`
Delete a thread and related messages.

## Spaces

### `GET /api/spaces`
List current user's spaces.

### `POST /api/spaces`
Create a space.

Body:

```json
{
  "name": "Space name",
  "description": "Optional"
}
```

### `GET /api/spaces/[spaceId]`
Get one space (owned by current user).

### `PATCH /api/spaces/[spaceId]`
Update space name/description.

### `DELETE /api/spaces/[spaceId]`
Delete a space and dependent documents/chunks.

## Documents

### `GET /api/spaces/[spaceId]/documents`
List documents for a space.

### `POST /api/spaces/[spaceId]/upload`
Upload one document (`pdf`, `docx`, `txt`, `md`, max 20MB).

Flow:

1. Validate ownership and file
2. Insert `documents` row (`processing`)
3. Extract text and chunk
4. Get embeddings from embedder service
5. Insert chunk vectors
6. Mark document `ready` or `failed`
