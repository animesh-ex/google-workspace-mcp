import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG_DIR } from "../auth.js";
import { tool, READ } from "../util.js";

export const MAPS_CONFIG_PATH = path.join(CONFIG_DIR, "maps.json");

export function loadMapsKey(): string | null {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  if (!fs.existsSync(MAPS_CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(MAPS_CONFIG_PATH, "utf8")).apiKey || null;
}

function key() {
  const k = loadMapsKey();
  if (!k) {
    throw new Error(`Google Maps isn't configured. Create a Maps Platform API key (billing must be enabled) and save it with google_setup action 'configure_maps', or in ${MAPS_CONFIG_PATH} as {"apiKey": "..."}. See README.`);
  }
  return k;
}

async function call(url: string, init: { method?: string; body?: unknown; fieldMask?: string } = {}) {
  const headers: Record<string, string> = { "X-Goog-Api-Key": key() };
  if (init.fieldMask) headers["X-Goog-FieldMask"] = init.fieldMask;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method: init.method || (init.body ? "POST" : "GET"), headers, body: init.body ? JSON.stringify(init.body) : undefined });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Maps API ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const PLACE_FIELDS = "id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,primaryTypeDisplayName,websiteUri,nationalPhoneNumber,internationalPhoneNumber,googleMapsUri,businessStatus,currentOpeningHours.openNow,regularOpeningHours.weekdayDescriptions";

function place(p: any) {
  return {
    placeId: p.id, name: p.displayName?.text, type: p.primaryTypeDisplayName?.text, address: p.formattedAddress,
    lat: p.location?.latitude, lng: p.location?.longitude, rating: p.rating, reviews: p.userRatingCount, priceLevel: p.priceLevel,
    openNow: p.currentOpeningHours?.openNow, hours: p.regularOpeningHours?.weekdayDescriptions,
    phone: p.internationalPhoneNumber || p.nationalPhoneNumber, website: p.websiteUri, mapsUrl: p.googleMapsUri, status: p.businessStatus,
  };
}

const latLng = z.object({ lat: z.number(), lng: z.number() });
const loc = z.union([z.string(), latLng]).describe("Address/place name, or {lat, lng}");
const waypoint = (l: z.infer<typeof loc>) => (typeof l === "string" ? { address: l } : { location: { latLng: { latitude: l.lat, longitude: l.lng } } });
const label = (l: z.infer<typeof loc>) => (typeof l === "string" ? l : `${l.lat},${l.lng}`);
const fmtDur = (s?: string) => {
  const n = parseInt(s || "0", 10);
  const h = Math.floor(n / 3600), m = Math.round((n % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

const MODES = ["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"] as const;
const MODE_URL: Record<string, string> = { DRIVE: "driving", WALK: "walking", BICYCLE: "bicycling", TRANSIT: "transit", TWO_WHEELER: "two-wheeler" };

export function registerMaps(server: McpServer) {
  tool(server, "maps_search_places",
    "Search Google Maps for places by text (e.g. 'jewelry stores in Surat', 'coffee near Times Square'). Returns address, rating, hours, phone, website and a Maps link.",
    {
      query: z.string(), maxResults: z.number().int().min(1).max(20).default(10),
      near: latLng.optional().describe("Bias results around this point"), radiusMeters: z.number().default(5000),
      openNow: z.boolean().optional(), minRating: z.number().min(0).max(5).optional(),
    },
    async ({ query, maxResults, near, radiusMeters, openNow, minRating }) => {
      const r = await call("https://places.googleapis.com/v1/places:searchText", {
        fieldMask: PLACE_FIELDS.split(",").map((f) => `places.${f}`).join(","),
        body: {
          textQuery: query, pageSize: maxResults, openNow, minRating,
          locationBias: near ? { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: radiusMeters } } : undefined,
        },
      });
      return (r.places || []).map(place);
    }, READ);

  tool(server, "maps_nearby", "Find places of given types around a point (e.g. types ['restaurant'] or ['jewelry_store']).",
    { center: latLng, radiusMeters: z.number().max(50000).default(1500), types: z.array(z.string()).min(1), maxResults: z.number().int().min(1).max(20).default(10), rankBy: z.enum(["POPULARITY", "DISTANCE"]).default("POPULARITY") },
    async ({ center, radiusMeters, types, maxResults, rankBy }) => {
      const r = await call("https://places.googleapis.com/v1/places:searchNearby", {
        fieldMask: PLACE_FIELDS.split(",").map((f) => `places.${f}`).join(","),
        body: { includedTypes: types, maxResultCount: maxResults, rankPreference: rankBy, locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters } } },
      });
      return (r.places || []).map(place);
    }, READ);

  tool(server, "maps_place_details", "Full details for one place by placeId, including recent reviews.",
    { placeId: z.string(), includeReviews: z.boolean().default(true) },
    async ({ placeId, includeReviews }) => {
      const r = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        fieldMask: PLACE_FIELDS + (includeReviews ? ",reviews.rating,reviews.text.text,reviews.relativePublishTimeDescription,reviews.authorAttribution.displayName,editorialSummary" : ""),
      });
      return {
        ...place(r), summary: r.editorialSummary?.text,
        reviews: r.reviews?.map((v: any) => ({ rating: v.rating, when: v.relativePublishTimeDescription, author: v.authorAttribution?.displayName, text: v.text?.text })),
      };
    }, READ);

  tool(server, "maps_geocode", "Convert an address to coordinates, or coordinates to an address (reverse geocode).",
    { address: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() },
    async ({ address, lat, lng }) => {
      if (!address && (lat === undefined || lng === undefined)) throw new Error("Provide address, or lat and lng.");
      const q = address ? `address=${encodeURIComponent(address)}` : `latlng=${lat},${lng}`;
      const r = await call(`https://maps.googleapis.com/maps/api/geocode/json?${q}&key=${encodeURIComponent(key())}`);
      if (r.status !== "OK" && r.status !== "ZERO_RESULTS") throw new Error(`Geocoding ${r.status}: ${r.error_message || ""}`);
      return (r.results || []).slice(0, 5).map((x: any) => ({
        address: x.formatted_address, lat: x.geometry?.location?.lat, lng: x.geometry?.location?.lng, placeId: x.place_id, types: x.types,
      }));
    }, READ);

  tool(server, "maps_directions",
    "Route between two places: distance, travel time (traffic-aware for driving), turn-by-turn steps and a Google Maps link. Optional stops and alternatives.",
    {
      origin: loc, destination: loc, stops: z.array(loc).optional(),
      mode: z.enum(MODES).default("DRIVE"),
      departureTime: z.string().optional().describe("ISO date-time; default now"),
      avoidTolls: z.boolean().optional(), avoidHighways: z.boolean().optional(),
      alternatives: z.boolean().default(false), includeSteps: z.boolean().default(true),
      units: z.enum(["METRIC", "IMPERIAL"]).default("METRIC"),
    },
    async (a) => {
      const traffic = a.mode === "DRIVE" || a.mode === "TWO_WHEELER";
      const r = await call("https://routes.googleapis.com/directions/v2:computeRoutes", {
        fieldMask: "routes.description,routes.distanceMeters,routes.duration,routes.staticDuration,routes.localizedValues,routes.warnings,routes.legs.distanceMeters,routes.legs.duration" +
          (a.includeSteps ? ",routes.legs.steps.navigationInstruction,routes.legs.steps.localizedValues,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.stopDetails" : ""),
        body: {
          origin: waypoint(a.origin), destination: waypoint(a.destination),
          intermediates: a.stops?.map(waypoint), travelMode: a.mode,
          routingPreference: traffic ? "TRAFFIC_AWARE" : undefined,
          departureTime: a.departureTime ? new Date(a.departureTime).toISOString() : undefined,
          computeAlternativeRoutes: a.alternatives, units: a.units,
          routeModifiers: traffic ? { avoidTolls: a.avoidTolls, avoidHighways: a.avoidHighways } : undefined,
        },
      });
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(label(a.origin))}&destination=${encodeURIComponent(label(a.destination))}&travelmode=${MODE_URL[a.mode]}` +
        (a.stops?.length ? `&waypoints=${encodeURIComponent(a.stops.map(label).join("|"))}` : "");
      return {
        mapsUrl,
        routes: (r.routes || []).map((rt: any) => ({
          via: rt.description, distance: rt.localizedValues?.distance?.text, duration: rt.localizedValues?.duration?.text || fmtDur(rt.duration),
          durationWithoutTraffic: rt.localizedValues?.staticDuration?.text, warnings: rt.warnings,
          steps: a.includeSteps ? rt.legs?.flatMap((l: any) => (l.steps || []).map((s: any) => [
            s.navigationInstruction?.instructions, s.localizedValues?.distance?.text, s.transitDetails?.transitLine?.nameShort,
          ].filter(Boolean).join(" · "))).filter(Boolean) : undefined,
        })),
      };
    }, READ);

  tool(server, "maps_distance_matrix", "Travel time and distance from several origins to several destinations (e.g. which store is closest to each customer).",
    { origins: z.array(loc).min(1).max(25), destinations: z.array(loc).min(1).max(25), mode: z.enum(MODES).default("DRIVE") },
    async ({ origins, destinations, mode }) => {
      const traffic = mode === "DRIVE" || mode === "TWO_WHEELER";
      const r = await call("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        fieldMask: "originIndex,destinationIndex,distanceMeters,duration,condition,localizedValues",
        body: {
          origins: origins.map((o) => ({ waypoint: waypoint(o) })), destinations: destinations.map((d) => ({ waypoint: waypoint(d) })),
          travelMode: mode, routingPreference: traffic ? "TRAFFIC_AWARE" : undefined,
        },
      });
      return (Array.isArray(r) ? r : []).sort((x: any, y: any) => x.originIndex - y.originIndex || x.destinationIndex - y.destinationIndex).map((e: any) => ({
        from: label(origins[e.originIndex ?? 0]), to: label(destinations[e.destinationIndex ?? 0]),
        distance: e.localizedValues?.distance?.text ?? (e.distanceMeters ? `${(e.distanceMeters / 1000).toFixed(1)} km` : undefined),
        duration: e.localizedValues?.duration?.text ?? fmtDur(e.duration), reachable: e.condition !== "ROUTE_NOT_FOUND",
      }));
    }, READ);
}
