# SplitPay

Snap a receipt, tell the app who ate what, and it sends each person a PayPal invoice for their exact share.
Built for the "Build What's Next with PayPal and AI" hackathon.

**Status:** early. Done so far: split math (`lib/totals.ts`, tested) and a PayPal sandbox invoice test script.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your PayPal sandbox credentials and sandbox account emails.
3. `npm test` runs the split-math tests.
4. `npm run paypal:test` creates and sends one sandbox invoice. Add `-- --record-payment` to also mark it paid.
5. `npm run dev` starts the web app.

## Planned flow
Upload receipt, AI parses items, user reviews, AI assigns items from a typed sentence, totals are computed in code, invoices are created and sent through the PayPal Invoicing API, and webhooks update the status board.

## Tools
PayPal Invoicing API (sandbox), Next.js, TypeScript, Tailwind. AI model: Gemini
