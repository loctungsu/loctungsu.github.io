(function () {
  "use strict";

  var API_ENDPOINT = "/api/chat";
  var MAX_INPUT_LENGTH = 500;
  var RATE_LIMIT_COUNT = 6;
  var RATE_LIMIT_WINDOW_MS = 60 * 1000;
  var RATE_BUCKET = [];
  var RETRY_ATTEMPTS = 2;

  function normalize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    var tokens = normalize(text).split(" ").filter(Boolean);
    var unique = {};
    for (var i = 0; i < tokens.length; i += 1) {
      unique[tokens[i]] = true;
    }
    return Object.keys(unique);
  }

  function getRelevantChunks(question) {
    var terms = tokenize(question);
    var corpus = Array.isArray(window.PORTFOLIO_CHAT_CONTENT) ? window.PORTFOLIO_CHAT_CONTENT : [];
    var scored = corpus.map(function (entry) {
      var haystack = normalize((entry.source || "") + " " + (entry.text || ""));
      var score = 0;
      for (var i = 0; i < terms.length; i += 1) {
        if (terms[i].length >= 3 && haystack.indexOf(terms[i]) !== -1) {
          score += 1;
        }
      }
      return {
        source: entry.source || "Website content",
        text: entry.text || "",
        score: score,
      };
    });

    return scored
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 4);
  }

  function isRateLimited() {
    var now = Date.now();
    while (RATE_BUCKET.length && now - RATE_BUCKET[0] > RATE_LIMIT_WINDOW_MS) {
      RATE_BUCKET.shift();
    }
    if (RATE_BUCKET.length >= RATE_LIMIT_COUNT) {
      return true;
    }
    RATE_BUCKET.push(now);
    return false;
  }

  function renderMessage(container, text, role, sources) {
    var message = document.createElement("article");
    message.className = "chatbot-message " + (role === "user" ? "chatbot-message-user" : "chatbot-message-bot");
    message.textContent = text;

    if (Array.isArray(sources) && sources.length > 0) {
      var citation = document.createElement("small");
      citation.className = "chatbot-message-sources";
      citation.textContent = "Sources: " + sources.join(" | ");
      message.appendChild(citation);
    }

    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error("timeout"));
      }, timeoutMs);

      fetch(url, options)
        .then(function (response) {
          clearTimeout(timer);
          resolve(response);
        })
        .catch(function (error) {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  function fallbackAnswer(chunks) {
    if (!chunks.length) {
      return {
        answer: "I can only answer questions about content on this portfolio site (projects, skills, research, experience, and education).",
        sources: ["Portfolio scope guardrail"],
      };
    }

    var summary = chunks
      .slice(0, 2)
      .map(function (chunk) {
        return chunk.text;
      })
      .join(" ");

    return {
      answer: summary,
      sources: chunks.slice(0, 2).map(function (chunk) {
        return chunk.source;
      }),
    };
  }

  function trackEvent(name, payload) {
    if (window.umami && typeof window.umami.track === "function") {
      window.umami.track(name, payload || {});
    }

    try {
      var history = JSON.parse(localStorage.getItem("chatbot_telemetry") || "[]");
      history.push({
        event: name,
        timestamp: new Date().toISOString(),
        data: payload || {},
      });
      localStorage.setItem("chatbot_telemetry", JSON.stringify(history.slice(-100)));
    } catch (err) {
      // no-op
    }
  }

  function init() {
    var toggle = document.getElementById("chatbot-toggle");
    var panel = document.getElementById("chatbot-panel");
    var close = document.getElementById("chatbot-close");
    var form = document.getElementById("chatbot-form");
    var input = document.getElementById("chatbot-input");
    var messages = document.getElementById("chatbot-messages");

    if (!toggle || !panel || !close || !form || !input || !messages) {
      return;
    }

    function openPanel() {
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
      input.focus();
    }

    function closePanel() {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    }

    toggle.addEventListener("click", function () {
      if (panel.classList.contains("open")) {
        closePanel();
      } else {
        openPanel();
      }
    });
    close.addEventListener("click", closePanel);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var question = (input.value || "").trim();
      if (!question) {
        return;
      }
      if (question.length > MAX_INPUT_LENGTH) {
        renderMessage(messages, "Please keep your question under " + MAX_INPUT_LENGTH + " characters.", "bot");
        return;
      }
      if (isRateLimited()) {
        renderMessage(messages, "Too many requests. Please wait a minute and try again.", "bot");
        return;
      }

      input.value = "";
      renderMessage(messages, question, "user");

      var chunks = getRelevantChunks(question);
      var loading = document.createElement("article");
      loading.className = "chatbot-message chatbot-message-bot";
      loading.textContent = "Thinking...";
      messages.appendChild(loading);
      messages.scrollTop = messages.scrollHeight;

      trackEvent("chat_question_sent", {
        length: question.length,
        has_context: chunks.length > 0,
      });

      var start = Date.now();
      var requestBody = {
        question: question,
        context: chunks.map(function (chunk) {
          return {
            source: chunk.source,
            text: chunk.text,
          };
        }),
      };

      var attempt = 0;
      function sendRequest() {
        attempt += 1;
        return fetchWithTimeout(
          API_ENDPOINT,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          },
          15000
        );
      }

      function handleFailure() {
        var fallback = fallbackAnswer(chunks);
        messages.removeChild(loading);
        renderMessage(messages, fallback.answer, "bot", fallback.sources);
        trackEvent("chat_fallback_used", {
          latency_ms: Date.now() - start,
        });
      }

      function processAttempt() {
        sendRequest()
          .then(function (response) {
            if (!response.ok) {
              throw new Error("http_" + response.status);
            }
            return response.json();
          })
          .then(function (data) {
            messages.removeChild(loading);
            renderMessage(
              messages,
              data && data.answer ? data.answer : "I could not generate a response right now.",
              "bot",
              data && Array.isArray(data.sources) ? data.sources : []
            );
            trackEvent("chat_response_received", {
              latency_ms: Date.now() - start,
              has_sources: !!(data && Array.isArray(data.sources) && data.sources.length),
            });
          })
          .catch(function () {
            if (attempt < RETRY_ATTEMPTS) {
              processAttempt();
            } else {
              handleFailure();
            }
          });
      }

      processAttempt();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
