-- Run this in the Supabase SQL editor once, before starting the server.

-- Cached copy of OpenStreetMap (Overpass API) results so we don't re-sweep
-- the public Overpass endpoint on every Home screen load. place_id here
-- stores OSM's own id in "type/id" form (e.g. "way/123456").
create table if not exists turfs_cache (
  place_id text primary key,
  name text not null,
  area text,
  address text,
  lat double precision,
  lng double precision,
  rating numeric,
  ratings_count integer,
  sports text[] default '{}',
  price integer default 800, -- OSM has no price data; seeded default, editable later via an admin screen
  raw jsonb,
  fetched_at timestamptz default now()
);

-- Real booking schedule. The unique constraint is what actually prevents
-- two people from booking the same turf + date + slot at the same time —
-- Postgres rejects the second insert instead of the app trying to check
-- and insert as two separate steps (which has a race condition).
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  turf_place_id text not null references turfs_cache(place_id),
  turf_name text not null,
  area text,
  booking_date date not null,
  slot_time text not null,
  price integer,
  user_id text, -- swap for a real auth user id once auth is added
  created_at timestamptz default now(),
  unique (turf_place_id, booking_date, slot_time)
);

create index if not exists idx_bookings_turf_date
  on bookings (turf_place_id, booking_date);
