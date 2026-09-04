const express = require("express");
const router = express.Router();

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function askClaude(system, userText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || "").join("\n");
  return text.replace(/```json|```/g, "").trim();
}

function requireKey(res) {
  if (!ANTHROPIC_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not set on the server." });
    return false;
  }
  return true;
}

// POST /api/ai/pick   { bookings: [...], catalog: [...] }
router.post("/pick", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    const { bookings = [], catalog = [] } = req.body || {};
    const system = `You are a turf recommendation engine for a sports-turf booking app in Pune. Given the user's past bookings and a turf catalog (both JSON), pick exactly one turf's place_id that best fits them — favor sports and areas that repeat in their history; with no history, pick a strong, highly-rated all-rounder. Respond with ONLY compact JSON, nothing else: {"placeId":"...","reason":"one short second-person sentence, under 16 words, on why this fits them"}`;
    const raw = await askClaude(system, JSON.stringify({ bookings, catalog }));
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/review-summary   { reviews: ["...", "..."] }
router.post("/review-summary", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    const { reviews = [] } = req.body || {};
    const system = `You summarize sports-turf reviews into a concise pros/cons breakdown for a booking app. Paraphrase in your own words — never quote the source text. Respond with ONLY compact JSON, nothing else: {"pros":["short bullet","short bullet"],"cons":["short bullet"]} with 2-4 pros and 1-3 cons, each bullet under 9 words.`;
    const raw = await askClaude(system, reviews.join("\n"));
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/assistant   { history: [{role,text}], message: "...", catalog: [...] }
router.post("/assistant", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    const { history = [], message = "", catalog = [] } = req.body || {};
    const system = `You are the AI booking assistant inside "AI Turf Booking App", a sports-turf discovery and booking app for Pune (covering both PCMC and PMC) inspired by BookMyShow's booking flow. You have this turf catalog (JSON): ${JSON.stringify(
      catalog
    )}. Read the conversation so far and the user's latest message (which may be a voice transcript), infer sport/area/budget/time preferences, and respond with ONLY compact JSON, nothing else: {"reply":"a short, friendly 1-3 sentence reply in plain text","matchedPlaceIds":["place_id_1","place_id_2"]} — matchedPlaceIds holds 0-4 catalog place_ids ordered best-first, or [] for greetings/general chat.`;
    const convoText = history.map((m) => `${m.role}: ${m.text}`).join("\n");
    const raw = await askClaude(system, `${convoText}\nuser: ${message}`);
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
