// api/parse-rule.js
// Vercel serverless function — calls Google Gemini, keeps the API key server-side.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'No rule text provided' })
  }

  const systemPrompt = `You convert a plain-English discount rule description into structured JSON.

Schema:
{
  "scope": "brand" | "platform" | "cart",
  "appliesTo": string or null (null only when scope is "cart"),
  "type": "percentage" | "flat",
  "value": number or null,
  "stackable": boolean,
  "minCartValue": number or null (required and >0 only when scope is "cart", otherwise null),
  "resolvable": boolean,
  "clarificationNeeded": string or null
}

Rules:
- If the description is missing a concrete value (e.g. "a discount", "some percent off") or, for a cart-scope rule, missing a threshold amount, set resolvable=false and put a short, specific question in clarificationNeeded. Leave value/appliesTo as null in that case.
- If scope is "cart", appliesTo must be null and minCartValue must be a positive number.
- If scope is "brand" or "platform", appliesTo must be a non-empty string and minCartValue must be null.
- Default stackable to false if not mentioned.
- Return ONLY the JSON object. No markdown, no prose, no code fences.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 300,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('Gemini API error:', errText)
      return res.status(502).json({ error: 'LLM request failed' })
    }

    const data = await response.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch {
      return res.status(502).json({ error: 'LLM returned invalid JSON', raw: rawText })
    }

    const validation = validateParsedRule(parsed)
    if (!validation.valid) {
      return res.status(200).json({
        resolvable: false,
        clarificationNeeded: validation.reason,
      })
    }

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('parse-rule handler error:', err)
    return res.status(500).json({ error: 'Unexpected server error' })
  }
}

function validateParsedRule(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, reason: 'Could not understand that rule. Please rephrase with a specific value.' }
  }
  if (parsed.resolvable === false) {
    return { valid: false, reason: parsed.clarificationNeeded || 'Please provide more specific details.' }
  }
  if (!['brand', 'platform', 'cart'].includes(parsed.scope)) {
    return { valid: false, reason: 'Could not determine if this is a brand, platform, or cart-wide offer.' }
  }
  if (!['percentage', 'flat'].includes(parsed.type)) {
    return { valid: false, reason: 'Could not determine if this is a percentage or flat discount.' }
  }
  if (typeof parsed.value !== 'number' || parsed.value <= 0) {
    return { valid: false, reason: 'Please specify a discount amount, e.g. "20% off" or "Rs.100 off".' }
  }
  if (parsed.scope === 'cart') {
    if (typeof parsed.minCartValue !== 'number' || parsed.minCartValue <= 0) {
      return { valid: false, reason: 'Please specify a minimum cart value, e.g. "if cart is over Rs.5,000".' }
    }
  } else {
    if (!parsed.appliesTo || typeof parsed.appliesTo !== 'string') {
      return { valid: false, reason: 'Please specify which brand or platform this applies to.' }
    }
  }
  return { valid: true }
}