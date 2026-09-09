"use strict";

var rateBuckets = new Map();
var RATE_LIMIT_COUNT = 20;
var RATE_LIMIT_WINDOW_MS = 60 * 1000;
var MAX_QUESTION_LENGTH = 500;
var MODERATION_BLOCKLIST = [
  "hate",
  "kill",
  "bomb",
  "doxx",
  "racial slur",
];

function nowIso() {
  return new Date().toISOString();
}

function getClientId(req) {
  var header =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    "";
  return String(header).split(",")[0].trim() || "anonymous";
}

function isRateLimited(clientId) {
  var now = Date.now();
  var bucket = rateBuckets.get(clientId) || [];
  bucket = bucket.filter(function (ts) {
    return now - ts <= RATE_LIMIT_WINDOW_MS;
  });
  if (bucket.length >= RATE_LIMIT_COUNT) {
    rateBuckets.set(clientId, bucket);
    return true;
  }
  bucket.push(now);
  rateBuckets.set(clientId, bucket);
  return false;
}

function containsBlockedContent(text) {
  var value = String(text || "").toLowerCase();
  return MODERATION_BLOCKLIST.some(function (term) {
    return value.indexOf(term) !== -1;
  });
}

function buildContext(context) {
  if (!Array.isArray(context)) {
    return [];
  }
  return context
    .slice(0, 4)
    .map(function (item) {
      var source = String(item && item.source ? item.source : "Website content").slice(0, 120);
      var text = String(item && item.text ? item.text : "").slice(0, 1000);
      return { source: source, text: text };
    })
    .filter(function (entry) {
      return entry.text.trim().length > 0;
    });
}

function parseAnswer(content) {
  if (!content) {
    return { answer: "", sources: [] };
  }
  try {
    var parsed = JSON.parse(content);
    return {
      answer: String(parsed.answer || "").trim(),
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [],
    };
  } catch (err) {
    return { answer: String(content).trim(), sources: [] };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  var clientId = getClientId(req);
  if (isRateLimited(clientId)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  var question = String(req.body && req.body.question ? req.body.question : "").trim();
  var context = buildContext(req.body && req.body.context);

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: "Question is too long" });
  }
  if (containsBlockedContent(question)) {
    return res.status(400).json({ error: "Question failed safety checks" });
  }

  var apiKey = process.env.OPENAI_API_KEY;
  var model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    return res.status(503).json({
      answer: "Chat service is not configured yet. Please set OPENAI_API_KEY on the server.",
      sources: [],
      timestamp: nowIso(),
    });
  }

  var systemPrompt =
    "You are a portfolio website assistant. Answer only with information grounded in the provided context. " +
    "If the answer is not in context, explicitly say you cannot answer from this portfolio content. " +
    "Keep responses concise and professional. Do not expose personal private data beyond what is in context. " +
    "Return strict JSON with shape: {\"answer\":\"...\",\"sources\":[\"...\"]}.";

  var contextText = context
    .map(function (item, index) {
      return "[" + (index + 1) + "] " + item.source + ": " + item.text;
    })
    .join("\n");

  try {
    var response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              "Context:\n" +
              (contextText || "(none)") +
              "\n\nQuestion:\n" +
              question,
          },
        ],
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: "Upstream model error" });
    }

    var data = await response.json();
    var content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? data.choices[0].message.content
        : "";

    var parsed = parseAnswer(content);
    if (!parsed.answer) {
      parsed.answer = "I could not find a grounded answer in the current portfolio context.";
    }

    return res.status(200).json({
      answer: parsed.answer,
      sources: parsed.sources,
      timestamp: nowIso(),
    });
  } catch (err) {
    return res.status(500).json({ error: "Unexpected chat service error" });
  }
};
