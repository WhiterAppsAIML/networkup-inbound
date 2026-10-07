# Gemini Comment Service — API Documentation

FastAPI microservice that uses Gemini to personalize LinkedIn outreach content: comment replies, post-connection DMs, connection notes, semantic intent detection on incoming comments, and lead scoring.

**Base URL (local dev):** `http://127.0.0.1:8000`

---

## Authentication

Every endpoint except `GET /health` requires a Bearer token, shared out-of-band with the caller.

```
Authorization: Bearer <SERVICE_TOKEN>
```

| Failure case | Status |
|---|---|
| Missing or malformed `Authorization` header | `401` |
| Token doesn't match `SERVICE_TOKEN` | `401` |

---

## Error Handling (applies to all endpoints)

| Status | Meaning |
|---|---|
| `200` | Success |
| `400` | Malformed request body (missing/invalid required fields) |
| `401` | Missing or invalid auth token |
| `500` | Internal error — Gemini timed out, Gemini API failed, or an unexpected error occurred |

**Any non-200 response should be treated as a failure by the caller.** This service does not return the original template on error — the caller is expected to fall back to their own default content (e.g. interpolating `{{firstName}}` into a base template they already have), since this service doesn't echo the request's template back on failure.

---

## Endpoints

### `GET /health`

Health check. No auth required.

**Response `200`:**
```json
{ "status": "ok" }
```

---

### `POST /api/v1/comment/improvise`

Rewrites a base comment template into a natural-sounding LinkedIn comment reply, referencing the commenter's own comment.

**Timeout:** 9s (internal budget; caller should allow up to 10s)

**Request:**
```json
{
  "baseTemplate": "Great post! Thanks for sharing.",
  "leadContext": {
    "firstName": "John",
    "fullName": "John Doe",
    "commentText": "Love the AI automation angle"
  },
  "isConnected": false
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `baseTemplate` | string | yes | Original template, may contain `{{firstName}}` |
| `leadContext.firstName` | string \| null | no | Used for personalization if present |
| `leadContext.fullName` | string \| null | no | Accepted but **not** used in the prompt (see note below) |
| `leadContext.commentText` | string | no | The commenter's original comment |
| `isConnected` | boolean | no, default `false` | Whether the lead is already a connection |

**Response `200`:**
```json
{
  "improvisedComment": "John, that automation angle is spot on. Great share.",
  "tokensUsed": { "prompt": 237, "completion": 19 },
  "model": "gemini-3.5-flash-lite"
}
```

**Constraints:**
- `improvisedComment` is capped at **300 characters** (truncated in code if Gemini exceeds it)
- Output avoids em dashes/hyphens as punctuation (prompted to sound less AI-written or not look salesy)

> **Important:** `fullName` is intentionally excluded from the prompt sent to Gemini. Only `firstName` is used for personalization — this was a deliberate fix after `fullName` caused the model to reference a name even when `firstName` was empty.

---

### `POST /api/v1/message/personalize`

Writes a personalized DM to send after a connection request is accepted, referencing the lead's comment and/or the post they engaged with.

**Timeout:** 9s (internal budget; spec allows up to 10s)

**Request:**
```json
{
  "baseTemplate": "Thanks for connecting, {{firstName}}! Happy to share examples if useful.",
  "leadContext": {
    "firstName": "John",
    "fullName": "John Doe",
    "company": "Acme Inc",
    "jobTitle": "VP Engineering",
    "commentText": "Great insights on AI automation",
    "engagementType": "COMMENT"
  },
  "postContext": {
    "postUrl": "https://linkedin.com/posts/example",
    "postContent": "5 ways AI can reduce SaaS support costs by 30%",
    "actionWords": ["AI", "automation", "demo"]
  },
  "isConnected": true
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `baseTemplate` | string | yes | Original DM template |
| `leadContext` | object | yes | Same shape as the comment endpoint, plus `company`, `jobTitle`, `engagementType` |
| `postContext` | object \| null | no | Omit entirely if not available |
| `postContext.postUrl` | string \| null | no | Not currently used in the prompt |
| `postContext.postContent` | string \| null | no | Used to reference the post topic |
| `postContext.actionWords` | string[] \| null | no | Accepted but not used by this endpoint |
| `isConnected` | boolean | no, default `true` | |

**Response `200`:**
```json
{
  "improvisedMessage": "Thanks for connecting, John! Saw your comment on the AI automation post. Happy to share a couple of relevant examples if useful.",
  "tokensUsed": { "prompt": 339, "completion": 26 },
  "model": "gemini-3.5-flash-lite"
}
```

**Constraints:**
- No hard character limit — **recommended** under 500 characters (logged as a warning if exceeded, not truncated)

---

### `POST /api/v1/connection/note`

Writes a short connection-request note from scratch (no base template provided by the caller).

**Timeout:** 7s (internal budget; spec requires under 8s)

**Request:**
```json
{
  "leadContext": {
    "firstName": "John",
    "fullName": "John Doe",
    "company": "Acme Inc",
    "jobTitle": "VP Engineering",
    "commentText": "Love the AI automation angle",
    "engagementType": "COMMENT"
  },
  "postContext": {
    "postContent": "5 ways AI can reduce SaaS support costs by 30%",
    "actionWords": ["AI", "automation", "demo"]
  },
  "maxChars": 300
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `leadContext` | object | yes | |
| `postContext` | object \| null | no | |
| `maxChars` | integer | no, default `300` | Hard limit — see below |

**Response `200`:**
```json
{
  "connectionNote": "Hi John, loved your comment on the AI automation angle. Connecting to share more.",
  "tokensUsed": { "prompt": 180, "completion": 35 },
  "model": "gemini-3.5-flash-lite"
}
```

**Constraints:**
- `connectionNote` length is **hard-capped at `maxChars`** (default 300) — this is a real LinkedIn UI limit, enforced in code regardless of what Gemini returns, no exceptions
- If Gemini's output is empty, falls back to a generic `"Hi {firstName}, would love to connect."`, still respecting `maxChars`

---

### `POST /api/v1/action-words/analyze`

Determines whether a comment semantically expresses interest matching a given list of action words (e.g. "demo", "pricing") — catching synonyms, paraphrases, and negation, not just exact substring matches.

**Timeout:** 4s (internal budget; spec requires under 5s)

**Request:**
```json
{
  "commentText": "Would love a demo of this solution",
  "actionWords": ["demo", "trial", "pricing", "interested", "information"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `commentText` | string | yes | |
| `actionWords` | string[] | yes | The candidate words/phrases to match against |

**Response `200`:**
```json
{
  "matched": true,
  "matchedWords": ["demo"],
  "confidence": 0.95,
  "reason": "explicit demo request with 'would love a demo'"
}
```

**Note:** unlike the other three endpoints, this response has **no `tokensUsed` or `model` field** — matches the original spec's contract exactly.

| Field | Type | Notes |
|---|---|---|
| `matched` | boolean | |
| `matchedWords` | string[] | Guaranteed to only contain words that were present in the request's `actionWords` — any word Gemini invents is filtered out |
| `confidence` | float, 0.0-1.0 | Self-reported by the model, not a calibrated statistical probability. Clamped to `[0, 1]` in code as a safety net. |
| `reason` | string | Short human-readable explanation, capped at 500 characters |

**Caller-side guidance (from spec):** treat `matched: true` as meaningful only when `confidence >= 0.7`.

---

### `POST /api/v1/lead/score`

Scores how promising a lead is (0-100) based on engagement type, job seniority, company/industry fit, and buying-intent signals in their comment — used by `EngagementScannerWorker` after new leads are created (batch or stream).

**Timeout:** 4s (internal budget; spec requires under 5s)

**Request:**
```json
{
  "leadContext": {
    "firstName": "John",
    "company": "Acme Inc",
    "jobTitle": "VP Engineering",
    "engagementType": "COMMENT",
    "commentText": "Would love a demo — we're evaluating vendors"
  },
  "postContext": {
    "postContent": "5 ways AI can reduce SaaS support costs by 30%",
    "actionWords": ["demo", "pricing", "evaluation"]
  },
  "profileData": {
    "companySize": "201-500",
    "industry": "SaaS",
    "seniority": "director_plus"
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `leadContext` | object | yes | |
| `leadContext.firstName` | string \| null | no | Accepted but **not** used in the scoring prompt (scoring doesn't personalize by name) |
| `leadContext.fullName` | string \| null | no | Accepted but **not** used |
| `leadContext.company` | string \| null | no | Accepted but **not** used — company fit is scored from `profileData.companySize`/`profileData.industry` instead, not this field |
| `leadContext.jobTitle` | string \| null | no | Used to assess decision-maker seniority (VP, Director, Head, C-level) |
| `leadContext.engagementType` | string \| null | no | e.g. `"COMMENT"` or `"LIKE"` — comments are weighted more heavily than likes |
| `leadContext.commentText` | string | no | Used to assess specificity, length, and buying-intent language |
| `postContext` | object \| null | no | |
| `postContext.postUrl` | string \| null | no | Not used in the prompt |
| `postContext.postContent` | string \| null | no | Used to assess topic/industry fit |
| `postContext.actionWords` | string[] \| null | no | Passed to the model as the available action words for this post |
| `profileData` | object \| null | no | |
| `profileData.companySize` | string \| null | no | e.g. `"201-500"` |
| `profileData.industry` | string \| null | no | e.g. `"SaaS"` |
| `profileData.seniority` | string \| null | no | e.g. `"director_plus"` |

**Response `200`:**
```json
{
  "score": 87,
  "tier": "HIGH",
  "factors": ["comment_engagement", "decision_maker_role", "action_word_match", "buying_signal"]
}
```

**Constraints:**
- `score`: integer, clamped to `[0, 100]` in code regardless of what Gemini returns
- `tier`: computed in Python from `score` — `HIGH` (≥75), `MEDIUM` (40-74), `LOW` (<40). Gemini is explicitly prompted not to return a tier at all, so this is never trusted from the model
- `factors`: filtered server-side to a closed, predefined vocabulary — any factor string Gemini invents outside the allowed set is silently dropped (same filtering approach as `matchedWords` on `/api/v1/action-words/analyze`)

**Predefined Factor Strings**
```
comment_engagement, like_engagement, decision_maker_role, influencer_role,
action_word_match, strong_buying_signal, buying_signal, company_fit,
industry_fit, seniority_fit, long_comment, short_comment, no_comment
```

> **Note:** unlike `comment/improvise`, `message/personalize`, and `connection/note`, this endpoint has **no internal 200-level fallback** for empty or malformed Gemini output — even a JSON-parsing failure on Gemini's response is deliberately left uncaught and results in a `500`. Fallback duty (`score: 50, tier: "MEDIUM"`) belongs entirely to the caller, same as the response shape's `tokensUsed`/`model` omission below.

> **Note:** like `action-words/analyze`, this response has **no `tokensUsed` or `model` field** — matches the original spec's contract exactly. (Token usage and model are still recorded server-side in the request log, per the shared logging behavior below — they're just not returned to the caller.)

---

## Shared Behavior Across All Generation Endpoints

- **Model:** all endpoints currently use `gemini-3.5-flash-lite`
- **Fallback on empty Gemini output:** `comment/improvise`, `message/personalize`, and `connection/note` each have their own internal fallback (interpolating the base template, or a generic note) — this returns a normal `200`, not an error, since Gemini technically succeeded but returned nothing useful. `lead/score` is the exception — it has no internal fallback and raises to a `500` even on malformed/empty output (see note above)
- **Fallback on real failure (timeout/error):** the service returns `500` and does **not** attempt to construct fallback content itself — that responsibility belongs to the caller
- **Logging:** every request logs `endpoint`, `status` (success/timeout/error), `prompt_tokens`, `completion_tokens`, `latency_ms`, and `model` to the console