(function () {
  var config = window.CHATBOT_CONFIG || {};
  var endpoint = config.endpoint || "";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
      return;
    }
    callback();
  }

  function buildKnowledge() {
    var blocks = document.querySelectorAll("section h2, section h3, section p, section li");
    return Array.prototype.slice.call(blocks)
      .map(function (node) {
        return node.textContent.replace(/\s+/g, " ").trim();
      })
      .filter(function (text) {
        return text.length > 35;
      });
  }

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function topContext(query, knowledge, limit) {
    var terms = tokenize(query);
    return knowledge
      .map(function (text) {
        var lower = text.toLowerCase();
        var score = terms.reduce(function (count, term) {
          return count + (lower.indexOf(term) >= 0 ? 1 : 0);
        }, 0);
        return { text: text, score: score };
      })
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, limit || 3)
      .map(function (item) {
        return item.text;
      });
  }

  function fallbackReply(query, context) {
    if (!context.length) {
      return "I could not find that on this portfolio yet. Try asking about skills, projects, research, experience, education, or contact.";
    }

    return "Here is what I found on this website:\n- " + context.join("\n- ");
  }

  async function fetchModelReply(question, context) {
    if (!endpoint) {
      return fallbackReply(question, context);
    }

    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: question,
        context: context
      })
    });

    if (!response.ok) {
      throw new Error("Model endpoint error.");
    }

    var data = await response.json();
    return data.answer || fallbackReply(question, context);
  }

  function addBubble(container, text, role) {
    var bubble = document.createElement("article");
    bubble.className = "chatbot-bubble " + (role === "user" ? "chatbot-bubble-user" : "chatbot-bubble-bot");
    bubble.textContent = text;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  ready(function () {
    var panel = document.getElementById("chatbotPanel");
    var toggle = document.getElementById("chatbotToggle");
    var close = document.getElementById("chatbotClose");
    var form = document.getElementById("chatbotForm");
    var input = document.getElementById("chatbotInput");
    var messages = document.getElementById("chatbotMessages");

    if (!panel || !toggle || !close || !form || !input || !messages) {
      return;
    }

    var knowledge = buildKnowledge();
    addBubble(messages, "Hi! Ask me anything about Loc's portfolio content.", "bot");

    function showPanel(show) {
      panel.hidden = !show;
      toggle.setAttribute("aria-expanded", String(show));
      if (show) {
        input.focus();
      }
    }

    toggle.addEventListener("click", function () {
      showPanel(panel.hidden);
    });

    close.addEventListener("click", function () {
      showPanel(false);
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var question = input.value.trim();

      if (!question) {
        return;
      }

      addBubble(messages, question, "user");
      input.value = "";
      input.disabled = true;

      var context = topContext(question, knowledge, 3);
      addBubble(messages, "Thinking...", "bot");
      var thinkingNode = messages.lastChild;

      try {
        var answer = await fetchModelReply(question, context);
        thinkingNode.textContent = answer;
      } catch (error) {
        thinkingNode.textContent = "I could not reach the model endpoint. For now, connect a serverless endpoint through window.CHATBOT_CONFIG.endpoint.";
      } finally {
        input.disabled = false;
        input.focus();
      }
    });
  });
})();
