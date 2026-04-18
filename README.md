# TwinMind — Live Suggestions

An always-on AI meeting copilot that listens to live audio and continuously surfaces 3 context-aware suggestions. Built for the TwinMind Full-Stack / Prompt Engineer assignment.

## Live Demo
**Deployed URL:** `<your-vercel-url>`

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS | Zero build overhead, instant load, easy to deploy |
| Backend | Node.js + Express | Lightweight, handles streaming SSE, multipart audio upload |
| Transcription | Groq Whisper Large V3 | Fastest Whisper inference available |
| LLM | Llama 4 Maverick 17B via Groq | Best OSS model on Groq at time of writing — fast, smart |
| Deployment | Vercel | Free tier, zero-config, instant CI/CD |

## Setup

### Local Development

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/twinmind-live-suggestions
cd twinmind-live-suggestions

# 2. Install deps
npm install

# 3. Run
npm run dev
# → http://localhost:3000

# 4. Open in browser, click Settings, paste your Groq API key
```

### Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Vercel auto-detects `vercel.json` and deploys the Express backend + static frontend.

## Architecture

```
Browser (MediaRecorder API)
  │
  ├─ /api/transcribe  → Groq Whisper Large V3
  │    Audio blob every ~30s → text chunk appended to transcript
  │
  ├─ /api/suggestions → Groq LLM (JSON mode)
  │    Last N chars of transcript → 3 typed suggestions
  │
  └─ /api/chat        → Groq LLM (streaming SSE)
       Full transcript + history → detailed answer streamed token by token
```

## Prompt Strategy

### Suggestion Prompt Design

The core insight is that generic "what should I ask next?" prompts produce bland, one-dimensional suggestions. The solution is **typed suggestions with selection rules**:

**5 suggestion types:**
- `question` — A sharp question to ask when there's a gap or unexplored angle
- `talking_point` — A fact or argument to raise when there's an opportunity
- `answer` — A direct answer when something in the transcript went unanswered
- `fact_check` — Flag an inaccurate/exaggerated claim and correct it
- `clarification` — Expand a term or concept that needs definition

**Selection rules baked into the prompt:**
- "If a direct question was just asked, prioritize `answer` type"
- "If a questionable claim was made, prioritize `fact_check`"
- "Vary the types — don't give 3 of the same"

**Context window:** Default 6,000 chars (~last 2-3 minutes of speech) for suggestions. This keeps the model focused on recency rather than diluting attention across the whole meeting.

**Preview field design:** The `preview` field is explicitly prompted to "deliver standalone value." This means clicking is optional — the card itself is informative.

**`detail_prompt` field:** Each suggestion includes a ready-to-send prompt for the chat model that includes relevant context from the transcript. This produces much better expanded answers than just passing the suggestion title.

### Chat Prompt Design

- Instructed to "lead with the answer" — important in a live meeting context
- Markdown formatting for scannable output
- Explicitly told to reference things said in the transcript
- Separate larger context window (12,000 chars default) since chat can afford more deliberation

### Why JSON mode for suggestions?

Using `response_format: { type: "json_object" }` guarantees parseable output without needing to strip markdown fences or handle parsing failures gracefully beyond a simple try/catch.

## Tradeoffs

| Decision | Why |
|---|---|
| No React/Next.js | This app has minimal state — vanilla JS is faster to ship, easier to debug, and doesn't need a build step |
| Audio chunked every 30s client-side | Matches the transcript refresh cadence; avoids long silences accumulating and breaking transcription |
| Suggestions fetched server-side | API key never touches the client network tab outside of the `x-groq-api-key` header to our own backend |
| Streaming chat | First token appears in ~200ms vs waiting for the full response; dramatically improves perceived latency |
| No persistence | Per spec — session export covers evaluation needs |

## Features

- 🎙 Live mic capture with 30s auto-chunking
- 📝 Real-time transcript with timestamps
- 💡 3 typed suggestions every 30s (or on demand)
- 💬 Streaming chat with full transcript context
- ⬇ Full session export (JSON)
- ⚙ Editable prompts, context windows, model selection in UI
- 🔑 API key stored in memory/localStorage (never hardcoded)
