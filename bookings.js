const express = require("express");
const supabase = require("../db/supabase");

const router = express.Router();

// GET /api/bookings/schedule?turfPlaceId=xxx&date=2026-09-01
// Returns which slots are already taken for a turf on a given date,
// so the frontend slot grid reflects the real schedule instead of a mock.
router.get("/schedule", async (req, res) => {
  const { turfPlaceId, date } = req.query;
  if (!turfPlaceId || !date) {
    return res.status(400).json({ error: "turfPlaceId and date are required" });
  }
  const { data, error } = await supabase
    .from("bookings")
    .select("slot_time")
    .eq("turf_place_id", turfPlaceId)
    .eq("booking_date", date);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ bookedSlots: data.map((r) => r.slot_time) });
});

// POST /api/bookings  { turfPlaceId, turfName, area, date, slotTime, price, userId }
// The unique constraint on (turf_place_id, booking_date, slot_time) is what
// actually stops a double-booking — if two people submit the same slot at
// the same moment, only the first insert succeeds; the second gets a 409.
router.post("/", async (req, res) => {
  const { turfPlaceId, turfName, area, date, slotTime, price, userId } = req.body || {};
  if (!turfPlaceId || !turfName || !date || !slotTime) {
    return res.status(400).json({ error: "turfPlaceId, turfName, date, and slotTime are required" });
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      turf_place_id: turfPlaceId,
      turf_name: turfName,
      area,
      booking_date: date,
      slot_time: slotTime,
      price,
      user_id: userId || "demo-user",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "That slot was just booked by someone else — pick another." });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ booking: data });
});

// GET /api/bookings?userId=demo-user  → a user's bookings, for the My Bookings screen
router.get("/", async (req, res) => {
  const userId = req.query.userId || "demo-user";
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ bookings: data });
});

// DELETE /api/bookings/:id  → cancel, frees the slot back up
router.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("bookings").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
