# API Reference

All API routes are served from the Next.js app under `app/src/app/api`. All routes utilize the `ApiResponse` utility for consistent JSON structures.

Terminology note: “Roles” is the canonical product term (formerly “Spaces”). The API reflects this transition.

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
- `429` rate limit exceeded

### `POST /api/auth/login`
Auth.js credentials provider sign-in. Rate-limited via Redis.

---

## Chat

### `POST /api/chat`
Primary streaming chat endpoint. Orchestrated by `ChatService`.

Body:
```json
{
  "threadId": "thread_cuid",
  "model": "anthropic/claude-4-6-sonnet-20260315",
  "messages": [/* AI SDK UI messages */],
  "roleId": "optional_role_id",
  "webSearch": true,
  "trigger": "optional_trigger"
}
```

Behavior:
- Requires authenticated session.
- Enforces per-user rate limit via Redis.
- Streams assistant response and persists messages.
- Supports triggers like `regenerate-message`.

Responses:
- `200` SSE streaming response.
- `400` validation errors.
- `401` unauthorized.
- `429` rate limit exceeded.

---

## Roles (formerly Spaces)

### `GET /api/roles`
List current user's roles.

### `POST /api/roles`
Create a role.

### `DELETE /api/roles/[roleId]`
Delete a role and all dependent documents/chunks.

---

## Documents & Uploads

### `POST /api/roles/[roleId]/upload`
Upload a document (`pdf`, `docx`, `txt`, `md`, max 50MB).

Behavior:
- Validates ownership and file type.
- Queues processing via BullMQ.
- Returns immediately; processing happens in the background.

Responses:
- `202 Accepted` - Processing initiated.
- `400` Validation error / file too large.
- `401` Unauthorized.
- `404` Role not found.

### `GET /api/roles/[roleId]/documents`
List documents and their processing status (`processing`, `ready`, `failed`).

---

## Admin

### `GET /api/admin/users`
List system users with pagination and search. (Admin only)

Query Params:
- `q`: Search query (email/name)
- `page`: Page number (default 1)
- `limit`: Results per page (default 20)

### `PATCH /api/admin/users`
Update user administrative privileges. (Admin only)

Body:
```json
{
  "userId": "user_id",
  "isAdmin": true
}
```

---

## Settings

### `GET /api/settings`
Get global application settings and provider status.

### `POST /api/settings`
Update settings or API keys. API keys are encrypted at rest.
