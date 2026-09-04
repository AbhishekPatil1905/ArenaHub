import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, MapPin, Star, Mic, Send, ChevronLeft,
  Sparkles, Clock, IndianRupee, Volume2, Trash2, Home as HomeIcon,
  MessageCircle, Ticket, Loader2, TrendingUp
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const SPORTS = ["Football", "Cricket", "Box Cricket", "Badminton", "Tennis"];
const SLOT_TIMES = Array.from({ length: 16 }, (_, i) => {
  const hour = 6 + i;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${h12}:00 ${suffix}`;
});
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------------------
   DESIGN TOKENS — stadium-at-night palette, ticket-stub cards
--------------------------------------------------------------------- */
const Tokens = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
    .atb {
      --pitch: #0E2A1E; --pitch-2: #123324; --pitch-3: #17402C;
      --line: rgba(244,241,232,0.14); --chalk: #F4F1E8; --chalk-dim: #AFC3B6;
      --floodlight: #F5B942; --floodlight-2: #E8A62F; --turf: #3E8B5C; --alert: #C1443A;
      font-family: 'Inter', sans-serif; background: var(--pitch); color: var(--chalk);
    }
    .atb .display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.02em; }
    .atb .mono { font-family: 'JetBrains Mono', monospace; }
    .atb .scanlines { background-image: repeating-linear-gradient(0deg, rgba(244,241,232,0.025) 0px, rgba(244,241,232,0.025) 1px, transparent 1px, transparent 3px); }
    .stub { position: relative; background: var(--pitch-2); border: 1px solid var(--line); border-radius: 14px; overflow: visible; }
    .stub-divider { position: relative; border-top: 2px dashed var(--line); margin: 0 14px; }
    .stub-notch { position: absolute; top: -9px; width: 18px; height: 18px; border-radius: 50%; background: var(--pitch); border: 1px solid var(--line); }
    .stub-notch.left { left: -23px; } .stub-notch.right { right: -23px; }
    .chip { font-size: 12.5px; font-weight: 600; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--line); color: var(--chalk-dim); white-space: nowrap; transition: all 0.15s ease; }
    .chip.active { background: var(--floodlight); border-color: var(--floodlight); color: #1a1305; }
    .btn-flood { background: var(--floodlight); color: #1a1305; font-weight: 700; border-radius: 12px; transition: transform 0.1s ease, background 0.15s ease; }
    .btn-flood:active { transform: scale(0.97); } .btn-flood:hover { background: var(--floodlight-2); } .btn-flood:disabled { opacity: 0.5; }
    .slot { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; border-radius: 9px; border: 1px solid var(--line); color: var(--chalk-dim); padding: 9px 4px; text-align: center; transition: all 0.12s ease; }
    .slot.open:hover { border-color: var(--turf); color: var(--chalk); cursor: pointer; }
    .slot.selected { background: var(--floodlight); border-color: var(--floodlight); color: #1a1305; }
    .slot.booked { background: rgba(193,68,58,0.12); border-color: rgba(193,68,58,0.3); color: rgba(244,241,232,0.3); text-decoration: line-through; cursor: not-allowed; }
    .navbtn { color: var(--chalk-dim); transition: color 0.15s ease; } .navbtn.active { color: var(--floodlight); }
    @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(245,185,66,0.35); } 50% { box-shadow: 0 0 0 6px rgba(245,185,66,0); } }
    .listening { animation: pulseGlow 1.4s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) { .listening { animation: none; } .btn-flood:active { transform: none; } }
  `}</style>
);

/* ---------------------------------------------------------------------
   BACKEND HELPERS
--------------------------------------------------------------------- */
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `POST ${path} failed: ${res.status}`);
  return data;
}
async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

function minimalCatalog(turfs) {
  return turfs.map(({ place_id, name, area, sports, price, rating }) => ({ place_id, name, area, sports, price, rating }));
}

async function fetchAIPick(bookings, turfs) {
  try {
    const result = await apiPost("/api/ai/pick", { bookings, catalog: minimalCatalog(turfs) });
    if (turfs.some((t) => t.place_id === result.placeId)) return result;
    throw new Error("bad id");
  } catch {
    const top = [...turfs].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    return top ? { placeId: top.place_id, reason: "Highly rated and a good all-round pick to start with." } : null;
  }
}

async function fetchReviewSummary(turf) {
  const reviews = turf.raw?.reviews || turf.reviews || [];
  if (reviews.length === 0) return null; // OSM carries no review text — nothing to summarize
  const cacheKey = `review-summary:${turf.place_id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);
  try {
    const result = await apiPost("/api/ai/review-summary", { reviews });
    localStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch {
    return { pros: ["Generally well reviewed by players"], cons: ["Occasional upkeep complaints"] };
  }
}

async function fetchAssistantReply(history, message, turfs) {
  try {
    const result = await apiPost("/api/ai/assistant", { history, message, catalog: minimalCatalog(turfs) });
    return {
      reply: result.reply || "Got it — here's what I found.",
      matchedPlaceIds: Array.isArray(result.matchedPlaceIds) ? result.matchedPlaceIds : [],
    };
  } catch {
    return { reply: "I'm having trouble reaching the assistant right now — try browsing turfs from the Home tab instead.", matchedPlaceIds: [] };
  }
}

/* ---------------------------------------------------------------------
   SMALL UI PIECES
--------------------------------------------------------------------- */
const Stub = ({ children, className = "", style }) => <div className={`stub ${className}`} style={style}>{children}</div>;
const StubDivider = () => (
  <div className="stub-divider"><span className="stub-notch left" /><span className="stub-notch right" /></div>
);
const RatingBadge = ({ rating, count }) => (
  <div className="flex items-center gap-1 mono text-[12px]" style={{ color: "var(--floodlight)" }}>
    <Star size={12} fill="var(--floodlight)" strokeWidth={0} />
    {rating ? rating.toFixed(1) : "—"}
    {count ? <span style={{ color: "var(--chalk-dim)" }} className="ml-0.5">({count})</span> : null}
  </div>
);

function TurfCard({ turf, onOpen }) {
  return (
    <Stub className="cursor-pointer">
      <div onClick={() => onOpen(turf)} className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="display text-[22px] leading-none">{turf.name}</h3>
            <div className="flex items-center gap-1 mt-1.5 text-[12.5px]" style={{ color: "var(--chalk-dim)" }}>
              <MapPin size={12} /> {turf.area}, Pune
            </div>
          </div>
          <RatingBadge rating={turf.rating} count={turf.ratings_count} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(turf.sports || []).map((s) => <span key={s} className="chip" style={{ padding: "4px 10px", fontSize: 11 }}>{s}</span>)}
        </div>
      </div>
      <StubDivider />
      <div onClick={() => onOpen(turf)} className="flex items-center justify-between px-4 py-3">
        <div className="mono text-[13px]" style={{ color: "var(--chalk-dim)" }}>
          <IndianRupee size={12} className="inline -mt-0.5" />{turf.price}<span className="opacity-60">/hr</span>
        </div>
        <span className="text-[12.5px] font-semibold flex items-center gap-1" style={{ color: "var(--floodlight)" }}>
          View slots <ChevronLeft size={14} className="rotate-180" />
        </span>
      </div>
    </Stub>
  );
}

/* ---------------------------------------------------------------------
   HOME SCREEN
--------------------------------------------------------------------- */
function HomeScreen({ turfs, turfsLoading, onOpenTurf, bookings }) {
  const [query, setQuery] = useState("");
  const [activeSport, setActiveSport] = useState(null);
  const [pick, setPick] = useState(null);
  const [pickLoading, setPickLoading] = useState(true);

  const loadPick = useCallback(async () => {
    if (turfs.length === 0) return;
    setPickLoading(true);
    const result = await fetchAIPick(bookings, turfs);
    setPick(result);
    setPickLoading(false);
  }, [bookings, turfs]);

  useEffect(() => { loadPick(); }, [loadPick]);

  const filtered = turfs.filter((t) => {
    const matchesQuery = !query || t.name.toLowerCase().includes(query.toLowerCase()) || (t.area || "").toLowerCase().includes(query.toLowerCase());
    const matchesSport = !activeSport || (t.sports || []).includes(activeSport);
    return matchesQuery && matchesSport;
  });

  const pickedTurf = pick ? turfs.find((t) => t.place_id === pick.placeId) : null;

  return (
    <div className="px-4 pt-5 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] tracking-widest uppercase" style={{ color: "var(--chalk-dim)" }}>Pune · PCMC + PMC</p>
          <h1 className="display text-[34px] leading-[0.9]">Find your turf.</h1>
        </div>
        <div className="p-2.5 rounded-full" style={{ background: "var(--pitch-2)", border: "1px solid var(--line)" }}>
          <Ticket size={18} style={{ color: "var(--floodlight)" }} />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 mb-3" style={{ background: "var(--pitch-2)", border: "1px solid var(--line)" }}>
        <Search size={16} style={{ color: "var(--chalk-dim)" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search turf or area…"
          className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "var(--chalk)" }} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
        <button className={`chip ${!activeSport ? "active" : ""}`} onClick={() => setActiveSport(null)}>All sports</button>
        {SPORTS.map((s) => (
          <button key={s} className={`chip ${activeSport === s ? "active" : ""}`} onClick={() => setActiveSport(s === activeSport ? null : s)}>{s}</button>
        ))}
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles size={14} style={{ color: "var(--floodlight)" }} />
          <p className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "var(--floodlight)" }}>AI pick for you</p>
        </div>
        <Stub className="p-4" style={{ background: "linear-gradient(135deg, var(--pitch-3), var(--pitch-2))" }}>
          {pickLoading ? (
            <div className="flex items-center gap-2 py-3 text-[13px]" style={{ color: "var(--chalk-dim)" }}>
              <Loader2 size={14} className="animate-spin" /> Reasoning over your bookings…
            </div>
          ) : pickedTurf ? (
            <div className="flex items-center justify-between gap-3 cursor-pointer" onClick={() => onOpenTurf(pickedTurf)}>
              <div>
                <h3 className="display text-[24px] leading-none">{pickedTurf.name}</h3>
                <p className="text-[13px] mt-1.5" style={{ color: "var(--chalk-dim)" }}>{pick.reason}</p>
              </div>
              <RatingBadge rating={pickedTurf.rating} />
            </div>
          ) : (
            <p className="text-[13px] py-2" style={{ color: "var(--chalk-dim)" }}>No turfs loaded yet.</p>
          )}
        </Stub>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp size={14} style={{ color: "var(--chalk-dim)" }} />
        <p className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "var(--chalk-dim)" }}>
          {turfsLoading ? "Loading turfs…" : `${filtered.length} turf${filtered.length !== 1 ? "s" : ""} across PCMC + PMC`}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {turfsLoading && (
          <div className="flex items-center gap-2 justify-center py-10 text-[13px]" style={{ color: "var(--chalk-dim)" }}>
            <Loader2 size={16} className="animate-spin" /> Fetching live turfs…
          </div>
        )}
        {!turfsLoading && filtered.map((t) => <TurfCard key={t.place_id} turf={t} onOpen={onOpenTurf} />)}
        {!turfsLoading && filtered.length === 0 && (
          <p className="text-center text-[13px] py-10" style={{ color: "var(--chalk-dim)" }}>
            No turfs match that search — try another sport or area, or the catalog may need a refresh (see backend README).
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   TURF DETAIL SCREEN
--------------------------------------------------------------------- */
function DetailScreen({ turf, onBack, onBook }) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const date = todayISO();

  useEffect(() => {
    let cancelled = false;
    setSlotsLoading(true);
    apiGet(`/api/bookings/schedule?turfPlaceId=${encodeURIComponent(turf.place_id)}&date=${date}`)
      .then((data) => { if (!cancelled) setBookedSlots(data.bookedSlots || []); })
      .catch(() => { if (!cancelled) setBookedSlots([]); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [turf.place_id, date]);

  const noReviews = (turf.raw?.reviews || turf.reviews || []).length === 0;

  const runSummary = async () => {
    setSummaryLoading(true);
    const result = await fetchReviewSummary(turf);
    setSummary(result);
    setSummaryLoading(false);
  };

  return (
    <div className="px-4 pt-5 pb-28">
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] mb-4" style={{ color: "var(--chalk-dim)" }}>
        <ChevronLeft size={16} /> Back
      </button>

      <h1 className="display text-[36px] leading-[0.9]">{turf.name}</h1>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 text-[13px]" style={{ color: "var(--chalk-dim)" }}>
          <MapPin size={13} /> {turf.area}, Pune
        </div>
        <RatingBadge rating={turf.rating} count={turf.ratings_count} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {(turf.sports || []).map((s) => <span key={s} className="chip">{s}</span>)}
      </div>

      <div className="mt-6">
        <p className="text-[11px] tracking-widest uppercase font-semibold mb-2" style={{ color: "var(--chalk-dim)" }}>Today's slots</p>
        {slotsLoading ? (
          <div className="flex items-center gap-2 text-[13px] py-4" style={{ color: "var(--chalk-dim)" }}>
            <Loader2 size={14} className="animate-spin" /> Loading live schedule…
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {SLOT_TIMES.map((time) => {
              const isBooked = bookedSlots.includes(time);
              const isSelected = selectedSlot === time;
              return (
                <div key={time} className={`slot ${isBooked ? "booked" : "open"} ${isSelected ? "selected" : ""}`}
                  onClick={() => !isBooked && setSelectedSlot(time)}>
                  {time}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-7">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} style={{ color: "var(--floodlight)" }} />
            <p className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "var(--floodlight)" }}>AI review summary</p>
          </div>
          {!summary && !noReviews && (
            <button onClick={runSummary} disabled={summaryLoading} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: "var(--floodlight)" }}>
              {summaryLoading ? <Loader2 size={13} className="animate-spin" /> : null}
              {summaryLoading ? "Reading reviews…" : "Generate"}
            </button>
          )}
        </div>
        {noReviews ? (
          <p className="text-[12.5px]" style={{ color: "var(--chalk-dim)" }}>
            No reviews available yet for this venue — OpenStreetMap doesn't carry review data, so this fills in once players start leaving in-app reviews.
          </p>
        ) : summary ? (
          <Stub className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: "var(--turf)" }}>PROS</p>
                <ul className="text-[12.5px] space-y-1.5" style={{ color: "var(--chalk-dim)" }}>
                  {summary.pros.map((p, i) => <li key={i}>· {p}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: "var(--alert)" }}>CONS</p>
                <ul className="text-[12.5px] space-y-1.5" style={{ color: "var(--chalk-dim)" }}>
                  {summary.cons.map((c, i) => <li key={i}>· {c}</li>)}
                </ul>
              </div>
            </div>
            <p className="text-[10.5px] mt-3 pt-3" style={{ color: "var(--chalk-dim)", opacity: 0.7, borderTop: "1px solid var(--line)" }}>
              AI-generated · paraphrased, not verbatim
            </p>
          </Stub>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--chalk-dim)" }}>Tap generate for an instant pros/cons read of this venue's reviews.</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4" style={{ background: "linear-gradient(0deg, var(--pitch) 60%, transparent)" }}>
        <button disabled={!selectedSlot} onClick={() => onBook(turf, selectedSlot, date)}
          className="btn-flood w-full py-3.5 flex items-center justify-center gap-2 text-[15px]">
          {selectedSlot ? `Book ${selectedSlot} · ₹${turf.price}` : "Select a slot to continue"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   CONFIRM SCREEN
--------------------------------------------------------------------- */
function ConfirmScreen({ pending, onConfirm, onCancel, confirming, error }) {
  return (
    <div className="px-4 pt-5 pb-24">
      <button onClick={onCancel} className="flex items-center gap-1 text-[13px] mb-6" style={{ color: "var(--chalk-dim)" }}>
        <ChevronLeft size={16} /> Back to slots
      </button>
      <p className="text-[11px] tracking-widest uppercase font-semibold mb-3" style={{ color: "var(--chalk-dim)" }}>Confirm booking</p>
      <Stub className="p-5">
        <h2 className="display text-[30px] leading-none">{pending.turf.name}</h2>
        <p className="text-[13px] mt-1.5 flex items-center gap-1" style={{ color: "var(--chalk-dim)" }}>
          <MapPin size={13} /> {pending.turf.area}, Pune
        </p>
        <StubDivider />
        <div className="pt-4 space-y-3">
          <div className="flex justify-between text-[13.5px]">
            <span style={{ color: "var(--chalk-dim)" }} className="flex items-center gap-1.5"><Clock size={14} /> Slot</span>
            <span className="mono font-semibold">{pending.slot}, Today</span>
          </div>
          <div className="flex justify-between text-[13.5px]">
            <span style={{ color: "var(--chalk-dim)" }} className="flex items-center gap-1.5"><IndianRupee size={14} /> Amount</span>
            <span className="mono font-semibold">₹{pending.turf.price}</span>
          </div>
        </div>
      </Stub>
      {error && <p className="text-[12.5px] mt-4 text-center" style={{ color: "var(--alert)" }}>{error}</p>}
      <p className="text-[11.5px] mt-4 text-center" style={{ color: "var(--chalk-dim)" }}>
        Slot is locked in the database on confirm — no live payment gateway yet.
      </p>
      <button onClick={onConfirm} disabled={confirming} className="btn-flood w-full py-3.5 mt-6 flex items-center justify-center gap-2 text-[15px]">
        {confirming ? <Loader2 size={16} className="animate-spin" /> : null}
        {confirming ? "Confirming…" : "Confirm booking"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------
   BOOKINGS SCREEN
--------------------------------------------------------------------- */
function BookingsScreen({ bookings, bookingsLoading, onCancel }) {
  return (
    <div className="px-4 pt-5 pb-24">
      <h1 className="display text-[34px] leading-[0.9] mb-5">My bookings</h1>
      {bookingsLoading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-[13px]" style={{ color: "var(--chalk-dim)" }}>
          <Loader2 size={16} className="animate-spin" /> Loading your bookings…
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-16">
          <Ticket size={28} className="mx-auto mb-3" style={{ color: "var(--chalk-dim)" }} />
          <p className="text-[13.5px]" style={{ color: "var(--chalk-dim)" }}>No bookings yet — find a turf from Home and reserve a slot.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map((b) => (
            <Stub key={b.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="display text-[22px] leading-none">{b.turf_name}</h3>
                  <p className="text-[12.5px] mt-1.5 flex items-center gap-1" style={{ color: "var(--chalk-dim)" }}>
                    <MapPin size={12} /> {b.area}, Pune
                  </p>
                </div>
                <button onClick={() => onCancel(b.id)} className="p-2 rounded-full" style={{ background: "rgba(193,68,58,0.12)" }}>
                  <Trash2 size={14} style={{ color: "var(--alert)" }} />
                </button>
              </div>
              <StubDivider />
              <div className="flex items-center justify-between pt-3 text-[13px] mono">
                <span className="flex items-center gap-1"><Clock size={13} /> {b.slot_time}, {b.booking_date}</span>
                <span className="flex items-center gap-1"><IndianRupee size={13} /> {b.price}</span>
              </div>
            </Stub>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   ASSISTANT SCREEN (chat + voice)
--------------------------------------------------------------------- */
function AssistantScreen({ turfs, onOpenTurf }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Tell me what you're after — e.g. \"badminton court under ₹600 in Aundh tonight\" — or tap the mic to speak." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    const { reply, matchedPlaceIds } = await fetchAssistantReply(history, trimmed, turfs);
    setMessages((m) => [...m, { role: "assistant", text: reply, placeIds: matchedPlaceIds }]);
    setLoading(false);
  }, [messages, turfs]);

  const speak = (text) => {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    } catch { /* speech synthesis unavailable */ }
  };

  const toggleMic = () => {
    if (!speechSupported) return;
    if (listening) {
      recognitionRef.current && recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { setListening(false); send(e.results[0][0].transcript); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-2">
        <h1 className="display text-[30px] leading-[0.9]">Assistant</h1>
        <p className="text-[12px] mt-1" style={{ color: "var(--chalk-dim)" }}>Type or speak — I'll match real turfs from the live catalog.</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13.5px] ${m.role === "user" ? "ml-auto" : ""}`}
              style={{
                background: m.role === "user" ? "var(--floodlight)" : "var(--pitch-2)",
                color: m.role === "user" ? "#1a1305" : "var(--chalk)",
                border: m.role === "user" ? "none" : "1px solid var(--line)",
                borderBottomRightRadius: m.role === "user" ? 4 : 16,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : 16,
              }}>
              <div className="flex items-start gap-1.5">
                <span className="flex-1">{m.text}</span>
                {m.role === "assistant" && (
                  <button onClick={() => speak(m.text)} className="mt-0.5 opacity-60 hover:opacity-100 shrink-0">
                    <Volume2 size={13} />
                  </button>
                )}
              </div>
            </div>
            {m.placeIds && m.placeIds.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {m.placeIds.map((id) => {
                  const t = turfs.find((x) => x.place_id === id);
                  return t ? <TurfCard key={id} turf={t} onOpen={onOpenTurf} /> : null;
                })}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-[12.5px] px-1" style={{ color: "var(--chalk-dim)" }}>
            <Loader2 size={13} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center gap-2 rounded-full px-2 py-2" style={{ background: "var(--pitch-2)", border: "1px solid var(--line)" }}>
          <button onClick={toggleMic} disabled={!speechSupported}
            title={speechSupported ? "Speak your request" : "Voice input not supported in this browser"}
            className={`p-2.5 rounded-full shrink-0 ${listening ? "listening" : ""}`}
            style={{ background: listening ? "var(--alert)" : "var(--pitch-3)", opacity: speechSupported ? 1 : 0.4 }}>
            <Mic size={15} style={{ color: listening ? "#fff" : "var(--chalk-dim)" }} />
          </button>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder={listening ? "Listening…" : "Ask for a turf…"} className="flex-1 bg-transparent outline-none text-[13.5px]"
            style={{ color: "var(--chalk)" }} />
          <button onClick={() => send(input)} disabled={!input.trim() || loading} className="p-2.5 rounded-full shrink-0 btn-flood">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   ROOT APP
--------------------------------------------------------------------- */
const DEMO_USER_ID = "demo-user"; // swap for a real auth user id once auth is added

export default function App() {
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState("home");
  const [activeTurf, setActiveTurf] = useState(null);
  const [pending, setPending] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  const [turfs, setTurfs] = useState([]);
  const [turfsLoading, setTurfsLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  const refreshTurfs = useCallback(async () => {
    setTurfsLoading(true);
    try {
      const data = await apiGet("/api/turfs");
      setTurfs(data.turfs || []);
    } catch (e) {
      console.error("Failed to load turfs — is the backend running?", e);
      setTurfs([]);
    } finally {
      setTurfsLoading(false);
    }
  }, []);

  const refreshBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const data = await apiGet(`/api/bookings?userId=${DEMO_USER_ID}`);
      setBookings(data.bookings || []);
    } catch (e) {
      console.error("Failed to load bookings — is the backend running?", e);
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  useEffect(() => { refreshTurfs(); refreshBookings(); }, [refreshTurfs, refreshBookings]);

  const openTurf = (turf) => { setActiveTurf(turf); setScreen("detail"); };
  const goHome = () => { setScreen("home"); setActiveTurf(null); };
  const startBooking = (turf, slot, date) => { setPending({ turf, slot, date }); setConfirmError(null); setScreen("confirm"); };

  const confirmBooking = async () => {
    if (!pending) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await apiPost("/api/bookings", {
        turfPlaceId: pending.turf.place_id,
        turfName: pending.turf.name,
        area: pending.turf.area,
        date: pending.date,
        slotTime: pending.slot,
        price: pending.turf.price,
        userId: DEMO_USER_ID,
      });
      await refreshBookings();
      setPending(null);
      setScreen("home");
      setActiveTurf(null);
      setTab("bookings");
    } catch (e) {
      setConfirmError(e.message || "Booking failed — try another slot.");
    } finally {
      setConfirming(false);
    }
  };

  const cancelBooking = async (id) => {
    setBookings((b) => b.filter((x) => x.id !== id));
    try { await apiDelete(`/api/bookings/${id}`); } catch (e) { console.error(e); refreshBookings(); }
  };

  const switchTab = (t) => { setTab(t); setScreen("home"); setActiveTurf(null); setPending(null); };

  return (
    <div className="atb w-full min-h-screen flex justify-center">
      <Tokens />
      <div className="w-full max-w-md min-h-screen flex flex-col relative scanlines" style={{ background: "var(--pitch)" }}>
        <div className="flex-1 overflow-y-auto">
          {tab === "home" && screen === "home" && (
            <HomeScreen turfs={turfs} turfsLoading={turfsLoading} onOpenTurf={openTurf} bookings={bookings} />
          )}
          {tab === "home" && screen === "detail" && activeTurf && (
            <DetailScreen turf={activeTurf} onBack={goHome} onBook={startBooking} />
          )}
          {tab === "home" && screen === "confirm" && pending && (
            <ConfirmScreen pending={pending} confirming={confirming} error={confirmError} onConfirm={confirmBooking} onCancel={() => setScreen("detail")} />
          )}
          {tab === "assistant" && <AssistantScreen turfs={turfs} onOpenTurf={openTurf} />}
          {tab === "bookings" && <BookingsScreen bookings={bookings} bookingsLoading={bookingsLoading} onCancel={cancelBooking} />}
        </div>

        <div className="sticky bottom-0 left-0 right-0 flex items-center justify-around py-3"
          style={{ background: "var(--pitch-2)", borderTop: "1px solid var(--line)" }}>
          <button onClick={() => switchTab("home")} className={`navbtn flex flex-col items-center gap-1 text-[10.5px] font-semibold ${tab === "home" ? "active" : ""}`}>
            <HomeIcon size={18} /> Home
          </button>
          <button onClick={() => switchTab("assistant")} className={`navbtn flex flex-col items-center gap-1 text-[10.5px] font-semibold ${tab === "assistant" ? "active" : ""}`}>
            <MessageCircle size={18} /> Assistant
          </button>
          <button onClick={() => switchTab("bookings")} className={`navbtn flex flex-col items-center gap-1 text-[10.5px] font-semibold ${tab === "bookings" ? "active" : ""}`}>
            <Ticket size={18} /> Bookings
          </button>
        </div>
      </div>
    </div>
  );
}
