// Seed points covering both municipal corporations in the Pune metro.
// Google's Nearby/Text Search works off a center + radius, not a city
// boundary, so we sweep the metro as a set of locality centers and
// de-duplicate the results by place_id.

const PCMC_LOCALITIES = [
  { name: "Pimpri", lat: 18.6298, lng: 73.7997 },
  { name: "Chinchwad", lat: 18.6408, lng: 73.7997 },
  { name: "Nigdi", lat: 18.6486, lng: 73.7654 },
  { name: "Akurdi", lat: 18.6485, lng: 73.7659 },
  { name: "Wakad", lat: 18.5975, lng: 73.7644 },
  { name: "Ravet", lat: 18.6465, lng: 73.7469 },
  { name: "Moshi", lat: 18.6745, lng: 73.8465 },
  { name: "Chikhli", lat: 18.6564, lng: 73.8353 },
  { name: "Hinjewadi", lat: 18.5912, lng: 73.7389 },
];

const PMC_LOCALITIES = [
  { name: "Kothrud", lat: 18.5074, lng: 73.8077 },
  { name: "Baner", lat: 18.5590, lng: 73.7868 },
  { name: "Aundh", lat: 18.5620, lng: 73.8076 },
  { name: "Viman Nagar", lat: 18.5679, lng: 73.9143 },
  { name: "Hadapsar", lat: 18.5089, lng: 73.9260 },
  { name: "Kondhwa", lat: 18.4636, lng: 73.8875 },
  { name: "Shivajinagar", lat: 18.5304, lng: 73.8478 },
  { name: "Warje", lat: 18.4802, lng: 73.8067 },
  { name: "Magarpatta / Hadapsar", lat: 18.5158, lng: 73.9282 },
  { name: "Camp / Central Pune", lat: 18.5122, lng: 73.8794 },
];

const ALL_LOCALITIES = [...PCMC_LOCALITIES, ...PMC_LOCALITIES];

// Great-circle distance in km — used to label an OSM result with the
// nearest known locality name, since Overpass doesn't return one directly.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestLocality(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const loc of ALL_LOCALITIES) {
    const d = haversineKm(lat, lng, loc.lat, loc.lng);
    if (d < bestDist) { bestDist = d; best = loc; }
  }
  return best ? best.name : "Pune";
}

module.exports = { PCMC_LOCALITIES, PMC_LOCALITIES, ALL_LOCALITIES, nearestLocality };
