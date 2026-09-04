const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn(
    "[db] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — booking and turf-cache routes will fail until .env is filled in."
  );
}

// Service key (not the anon key) is used because this runs server-side only
// and needs to bypass row-level security to enforce the unique-slot
// constraint reliably. Never ship this key to the frontend.
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

module.exports = supabase;
