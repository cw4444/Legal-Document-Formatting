import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 3000;

const contentType = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function buildPrompt(input) {
  return `You are a benefits operations analyst.
Summarize the following brief for a non-technical audience in four sections: renewal logic, vendor audit, statutory compliance summary, and scaleability logic.
Return strict JSON with keys: renewal, vendor, compliance, scaleability, renewalScore, vendorScore, complianceScore, title, executiveSummary, nextSteps.
Use concise, executive-friendly language.
Keep each section to 2-4 sentences. Use plain English. Do not include markdown fences.

Brief:
${input}`;
}

function normalizeStructuredText(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeResponse(provider, raw) {
  let candidateText = "";
  if (provider === "openai") candidateText = raw.output_text || raw.output?.[0]?.content?.[0]?.text || "";
  else if (provider === "anthropic") candidateText = raw.content?.[0]?.text || "";
  else if (provider === "google") candidateText = raw.candidates?.[0]?.content?.parts?.[0]?.text || "";
  else if (provider === "xai") candidateText = raw.choices?.[0]?.message?.content || "";

  const parsed = normalizeStructuredText(candidateText);
  if (parsed) {
    return {
      provider,
      title: parsed.title || "Benefits Brief",
      renewal: parsed.renewal || "",
      vendor: parsed.vendor || "",
      compliance: parsed.compliance || "",
      scaleability: parsed.scaleability || parsed.scaleText || "",
      renewalScore: Number(parsed.renewalScore) || 0,
      vendorScore: Number(parsed.vendorScore) || 0,
      complianceScore: Number(parsed.complianceScore) || 0,
      executiveSummary: parsed.executiveSummary || "",
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      raw,
    };
  }

  return { provider, raw, title: "Benefits Brief" };
}

async function callOpenAI(apiKey, model, input) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "gpt-4.1-mini",
      input: buildPrompt(input),
    }),
  });
  return response.json();
}

async function callAnthropic(apiKey, model, input) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || "claude-3-5-sonnet-latest",
      max_tokens: 700,
      messages: [{ role: "user", content: buildPrompt(input) }],
    }),
  });
  return response.json();
}

async function callGoogle(apiKey, model, input) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.0-flash")}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      }),
    }
  );
  return response.json();
}

async function callXAI(apiKey, model, input) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "grok-2-latest",
      messages: [{ role: "user", content: buildPrompt(input) }],
      temperature: 0.2,
    }),
  });
  return response.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    const html = await readFile(path.join(__dirname, "index.html"), "utf8");
    res.writeHead(200, { "Content-Type": contentType[".html"] });
    res.end(html);
    return;
  }

  if (req.method === "GET") {
    const filePath = path.join(__dirname, url.pathname);
    const ext = path.extname(filePath);
    if (contentType[ext]) {
      try {
        const file = await readFile(filePath);
        res.writeHead(200, { "Content-Type": contentType[ext] });
        res.end(file);
        return;
      } catch {
        json(res, 404, { error: "Not found" });
        return;
      }
    }
  }

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const body = await readBody(req);
      const { provider, apiKey, model, input } = body;
      if (!apiKey || !provider) {
        json(res, 400, { error: "provider and apiKey are required" });
        return;
      }

      let raw;
      if (provider === "openai") raw = await callOpenAI(apiKey, model, input);
      else if (provider === "anthropic") raw = await callAnthropic(apiKey, model, input);
      else if (provider === "google") raw = await callGoogle(apiKey, model, input);
      else if (provider === "xai") raw = await callXAI(apiKey, model, input);
      else {
        json(res, 400, { error: "Unsupported provider" });
        return;
      }

      json(res, 200, { provider, normalized: normalizeResponse(provider, raw) });
    } catch (error) {
      json(res, 500, { error: error.message });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`Benefits Specialist Demo running on http://localhost:${port}`);
});
