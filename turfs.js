const express = require("express");
const supabase = require("../db/supabase");
const { nearestLocality } = require("../localities");

const router = express.Router();

// Public Overpass instance — free, no API key, no billing, rate-limited
// by courtesy (keep this to one combined query, not a loop of many).
// Self-host your own Overpass instance if you outgrow the public one.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Bounding box roughly covering both PCMC and PMC — Pimpri/Chinchwad/
// Wakad/Hinjewadi in the north-west through central Pune to Viman
// Nagar/Hadapsar/Kondhwa in the south-east.
const BBOX = { south: 18.44, west: 73.70, north: 18.68, east: 73.95 };

const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  node["leisure"="pitch"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["leisure"="pitch"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["leisure"="sports_centre"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["leisure"="sports_centre"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out center tags;
`;

const SPORT_TAG_MAP = {
  soccer: "Football",
  football: "Football",
  cricket: "Cricket",
  tennis: "Tennis",
  badminton: "Badminton",
  multi: "Football",
};

const DEFAULT_PRICE_BY_SPORT = { Badminton: 500, Tennis: 550, Cricket: 1000, Football: 850 };

function guessSports(tags = {}) {
  const sportTag = (tags.sport || "").toLowerCase();
  const sports = new Set();
  for (const key of sportTag.split(";")) {
    if (SPORT_TAG_MAP[key.trim()]) sports.add(SPORT_TAG_MAP[key.trim()]);
  }
  const name = (tags.name || "").toLowerCase();
  if (sports.size === 0) {
    if (name.includes("cricket")) sports.add("Cricket");
    if (name.includes("badminton")) sports.add("Badminton");
    if (name.includes("tennis")) sports.add("Tennis");
    if (name.includes("football") || name.includes("turf") || sports.size === 0) sports.add("Football");
  }
  return Array.from(sports);
}

function toTurfShape(el) {
  const tags = el.tags || {};
  const lat = el.type === "node" ? el.lat : el.center?.lat;
  const lng = el.type === "node" ? el.lon : el.center?.lon;
  if (!tags.name || lat == null || lng == null) return null; // skip unnamed/incomplete entries

  const sports = guessSports(tags);
  const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]].filter(Boolean);

  return {
    place_id: `${el.type}/${el.id}`, // OSM's stable id, used the same way Google's place_id was
    name: tags.name,
    area: nearestLocality(lat, lng),
    address: addressParts.join(", "),
    lat,
    lng,
    rating: null, // OSM doesn't carry ratings — see README for how to layer these in later
    ratings_count: 0,
    sports,
    price: DEFAULT_PRICE_BY_SPORT[sports[0]] || 800,
    raw: { tags, source: "openstreetmap" },
  };
}

// GET /api/turfs?refresh=true  → sweep OSM live and cache
// GET /api/turfs               → serve from cache (instant, zero cost)
router.get("/", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";

  if (!forceRefresh) {
    const { data, error } = await supabase.from("turfs_cache").select("*").order("name", { ascending: true });
    if (!error && data && data.length > 0) {
      return res.json({ source: "cache", count: data.length, turfs: data });
    }
  }

  let elements;
  try {
    const resp = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: OVERPASS_QUERY,
    });
    if (!resp.ok) throw new Error(`Overpass returned ${resp.status}`);
    const data = await resp.json();
    elements = data.elements || [];
  } catch (e) {
    console.error("[overpass] fetch failed:", e.message);
    return res.status(502).json({ error: "Overpass API request failed — it may be rate-limiting or temporarily down. Try again shortly.", detail: e.message });
  }

  const turfs = elements.map(toTurfShape).filter(Boolean);

  if (turfs.length > 0) {
    const { error: upsertError } = await supabase.from("turfs_cache").upsert(
      turfs.map((t) => ({ ...t, fetched_at: new Date().toISOString() })),
      { onConflict: "place_id" }
    );
    if (upsertError) console.error("[cache] upsert failed:", upsertError.message);
  }

  res.json({ source: "live", count: turfs.length, turfs });
});

module.exports = router;
