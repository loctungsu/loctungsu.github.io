# loctungsu.github.io

## Portfolio chatbot

This repository now includes a portfolio chatbot widget on:

- `/home/runner/work/loctungsu.github.io/loctungsu.github.io/index.html`

### What is included

- Frontend chat UI and behavior:
  - `/home/runner/work/loctungsu.github.io/loctungsu.github.io/JS/chatbot.js`
  - `/home/runner/work/loctungsu.github.io/loctungsu.github.io/JS/chatbotContent.js`
- Styling:
  - `/home/runner/work/loctungsu.github.io/loctungsu.github.io/index.css`
- Backend API proxy (server-side):
  - `/home/runner/work/loctungsu.github.io/loctungsu.github.io/api/chat.js`

### Security model

- Browser never stores or sends an LLM API key.
- The API key must be configured on the backend only.
- Endpoint applies input checks, lightweight moderation, and rate limiting.

### Required server environment variables

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, default: `gpt-4o-mini`)

### Notes

- The chatbot is grounded using a local content index from portfolio sections and selected PDF assets metadata.
- If the API is unavailable, the frontend uses a local fallback answer from matched indexed content.