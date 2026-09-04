require("dotenv").config();
const express = require("express");
const cors = require("cors");

const turfsRoute = require("./routes/turfs");
const bookingsRoute = require("./routes/bookings");
const aiRoute = require("./routes/ai");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/turfs", turfsRoute);
app.use("/api/bookings", bookingsRoute);
app.use("/api/ai", aiRoute);

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AI Turf Booking backend running on http://localhost:${PORT}`);
  console.log(`Try: GET /api/turfs?refresh=true  (first call — sweeps PCMC + PMC live)`);
  console.log(`Then: GET /api/turfs               (fast, served from cache)`);
});
