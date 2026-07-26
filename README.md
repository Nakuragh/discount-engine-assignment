# Opptra Discount Engine — FDE Intern Assignment

## Live Deployment
https://discount-engine-assignment-delta.vercel.app

## Run Locally

```bash
git clone https://github.com/Nakuragh/discount-engine-assignment.git
cd discount-engine-assignment
npm install && npm run dev
```

Open the local URL printed in the terminal, upload `sample-data/rules.csv` and `sample-data/cart.csv`, and click **Calculate Discounts**.

To test the natural language rule input locally (Task 2), you'll need a Gemini API key. Create a `.env` file in the project root:

GEMINI_API_KEY=your_key_here

and run `vercel dev` instead of `npm run dev` (the Vercel CLI is required to run the `/api` serverless function locally).

---

## What's Implemented

### Base Engine
CSV upload for rules and cart, item-level discount calculation (largest non-stackable discount wins, stackable rules apply on top), customer-facing reasoning strings.

### Task 1 — Cart-Level Offer
Extended `discountEngine.js` with `calculateCart()`, which runs item-level discounts first, then checks cart-level rules (scope: `cart`) against the summed final prices. The cart offer row only appears when the threshold is met, and shows the exact rupee amount saved separately from item-level discounts.

### Task 2 — Natural Language Rule Input
A text field lets the user describe a rule in plain English (e.g. *"20% off Natura Casa, stackable with other offers"*). This is parsed by an LLM into a structured `DiscountRule` object, shown in a confirmation card, and only added to the active rules after the user explicitly confirms. Ambiguous input (e.g. *"give a discount for big orders"*) is detected and surfaced as a clarification request instead of guessing or crashing.

**LLM provider note:** the assignment brief doesn't mandate a specific vendor ("an LLM parses it"), so this uses **Google Gemini** (`gemini-3.5-flash`) via a Vercel serverless function, rather than Claude — Gemini's free tier requires no billing setup, which kept iteration fast. The API key is kept server-side in an environment variable, never exposed to the client.

The parsed output is **schema-constrained** (`responseSchema`) rather than relying purely on prompt instructions — an earlier prompt-only approach occasionally produced truncated JSON under tight token budgets due to the model's internal reasoning overhead; constraining the response shape at the decoding level resolved this reliably. The backend also re-validates every field before accepting it — the model's own `resolvable` flag is not trusted blindly.

### Task 3 — PDF Cart Upload
PDF parsing runs entirely client-side via `pdfjs-dist`, consistent with the assignment's note that a backend is optional. Column boundaries (Product / Brand / Platform / Base Price) are inferred per-row from the largest horizontal gaps between text fragments, rather than assuming a fixed spacing threshold — this adapts to how a given PDF generator happens to encode column spacing, rather than relying on a brittle fixed-width assumption.

**Malformed row handling:** rows that don't resolve to a valid price or are missing required columns are skipped and explicitly reported to the user (e.g. *"Skipped unparseable row: ..."*), rather than silently dropped or causing the whole upload to fail. This was a deliberate fail-safe choice — better to flag a row a human should look at than to guess and produce a wrong price.

---

## Assumptions & Tradeoffs

- **Cart-level rule conflicts:** if multiple cart-scope rules are eligible simultaneously, the same "largest saving wins" logic used for item-level rules applies.
- **PDF spacing assumption:** column detection assumes at least a small, non-zero horizontal gap between columns in the source PDF. Extremely tight or unusual spacing in some PDF generators could cause a row to be skipped rather than mis-parsed — this fails safe by design.
- **Custom rule IDs:** rules added via natural language get an auto-generated ID (`RULE-CUSTOM-N`) to distinguish them from the CSV-sourced rules.
- **No persistence:** state is in-memory for the session only, per the assignment's instructions.

---

## Loom Walkthrough
https://www.loom.com/share/09aee68e758d4d76b8ceb3ce28bc7ad9