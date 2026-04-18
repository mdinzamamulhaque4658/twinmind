import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── Transcription endpoint ────────────────────────────────────────────────────
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  const apiKey = req.headers["x-groq-api-key"];
  if (!apiKey) return res.status(401).json({ error: "Missing Groq API key" });
  if (!req.file) return res.status(400).json({ error: "No audio file" });

  try {
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: "audio.webm",
      contentType: req.file.mimetype || "audio/webm",
    });
    form.append("model", "whisper-large-v3");
    form.append("response_format", "json");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
        body: form,
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Transcription failed");
    res.json({ text: data.text || "" });
  } catch (err) {
    console.error("Transcribe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Suggestions endpoint ──────────────────────────────────────────────────────
app.post("/api/suggestions", async (req, res) => {
  const apiKey = req.headers["x-groq-api-key"];
  if (!apiKey) return res.status(401).json({ error: "Missing Groq API key" });

  const { transcript, systemPrompt, model, contextChars } = req.body;
  const trimmed = transcript?.slice(-(contextChars || 6000)) || "";

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "llama-3.3-70b-versatile",
        max_tokens: 600,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Here is the recent conversation transcript:\n\n${trimmed}\n\nGenerate exactly 3 suggestions as described.`,
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Suggestions failed");

    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { suggestions: [] };
    }
    res.json(parsed);
  } catch (err) {
    console.error("Suggestions error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Chat / detail endpoint (streaming) ───────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const apiKey = req.headers["x-groq-api-key"];
  if (!apiKey) return res.status(401).json({ error: "Missing Groq API key" });

  const { messages, systemPrompt, transcript, model, contextChars } = req.body;
  const trimmedTranscript = transcript?.slice(-(contextChars || 10000)) || "";

  const fullSystem = `${systemPrompt}\n\n## Current Meeting Transcript (recent context):\n${trimmedTranscript}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "llama-3.3-70b-versatile",
        max_tokens: 1000,
        temperature: 0.5,
        stream: true,
        messages: [{ role: "system", content: fullSystem }, ...messages],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      res.write(`data: ${JSON.stringify({ error: err.error?.message })}\n\n`);
      return res.end();
    }

    for await (const chunk of response.body) {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            res.write("data: [DONE]\n\n");
          } else {
            res.write(`${line}\n\n`);
          }
        }
      }
    }
    res.end();
  } catch (err) {
    console.error("Chat error:", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TwinMind running on http://localhost:${PORT}`));
