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
    "Search Google Maps for businesses/places by text (e.g. 'jewelry stores in Surat', 'diamond wholesalers Mumbai'). Returns address, rating, review count, hours, phone, website and Maps link; up to 60 results with paging. includeSummaries adds Google's AI review summary when available.",
    {
      query: z.string(), maxResults: z.number().int().min(1).max(60).default(20),
      near: latLng.optional().describe("Bias results around this point"), radiusMeters: z.number().default(5000),
      openNow: z.boolean().optional(), minRating: z.number().min(0).max(5).optional(),
      includedType: z.string().optional().describe("Restrict to one place type, e.g. 'jewelry_store'"),
      includeSummaries: z.boolean().default(false),
    },
    async ({ query, maxResults, near, radiusMeters, openNow, minRating, includedType, includeSummaries }) => {
      const fields = PLACE_FIELDS + (includeSummaries ? ",reviewSummary.text.text,generativeSummary.overview.text,editorialSummary" : "");
      const out: any[] = [];
      let pageToken: string | undefined;
      do {
        const r = await call("https://places.googleapis.com/v1/places:searchText", {
          fieldMask: fields.split(",").map((f) => `places.${f}`).join(",") + ",nextPageToken",
          body: {
            textQuery: query, pageSize: Math.min(20, maxResults - out.length), openNow, minRating, includedType, pageToken,
            locationBias: near ? { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: radiusMeters } } : undefined,
          },
        });
        out.push(...(r.places || []).map((p: any) => ({
          ...place(p),
          ...(includeSummaries ? { aiReviewSummary: p.reviewSummary?.text?.text, aiOverview: p.generativeSummary?.overview?.text, editorialSummary: p.editorialSummary?.text } : {}),
        })));
        pageToken = r.nextPageToken;
      } while (pageToken && out.length < maxResults);
      return { count: out.length, places: out };
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

  tool(server, "maps_place_details",
    "All business details for one place: contact info, hours, price range, ratings, up to 5 recent reviews, Google's AI summaries (overview, review summary, neighborhood), amenities, payment/parking/accessibility options, service options, address parts and photo references.",
    { placeId: z.string(), language: z.string().optional().describe("e.g. 'en'") },
    async ({ placeId, language }) => {
      const r = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${language ? `?languageCode=${encodeURIComponent(language)}` : ""}`, { fieldMask: "*" });
      const flags = Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === "boolean"));
      return {
        ...place(r),
        shortAddress: r.shortFormattedAddress, types: r.types, plusCode: r.plusCode?.globalCode,
        addressParts: r.addressComponents?.map((c: any) => ({ [c.types?.[0] || "part"]: c.longText })),
        utcOffsetMinutes: r.utcOffsetMinutes,
        priceRange: r.priceRange ? [r.priceRange.startPrice, r.priceRange.endPrice].filter(Boolean).map((p: any) => `${p.currencyCode} ${p.units}`).join(" – ") : undefined,
        aiOverview: r.generativeSummary?.overview?.text, aiDescription: r.generativeSummary?.description?.text,
        aiReviewSummary: r.reviewSummary?.text?.text, neighborhoodSummary: r.neighborhoodSummary?.overview?.content?.text,
        editorialSummary: r.editorialSummary?.text,
        serviceOptionsAndAmenities: Object.keys(flags).length ? flags : undefined,
        paymentOptions: r.paymentOptions, parkingOptions: r.parkingOptions, accessibilityOptions: r.accessibilityOptions,
        secondaryHours: r.regularSecondaryOpeningHours?.map((h: any) => ({ type: h.secondaryHoursType, hours: h.weekdayDescriptions })),
        links: r.googleMapsLinks,
        reviews: r.reviews?.map((v: any) => ({ rating: v.rating, when: v.relativePublishTimeDescription, author: v.authorAttribution?.displayName, text: v.text?.text || v.originalText?.text })),
        photoCount: r.photos?.length, photoNames: r.photos?.slice(0, 10).map((p: any) => p.name),
      };
    }, READ);

  tool(server, "maps_place_photos", "Get viewable image URLs for a place's photos (from maps_place_details photoNames, or by placeId).",
    { placeId: z.string().optional(), photoNames: z.array(z.string()).optional(), max: z.number().int().min(1).max(10).default(5), maxWidthPx: z.number().int().min(100).max(4800).default(1200) },
    async ({ placeId, photoNames, max, maxWidthPx }) => {
      let names = photoNames;
      if (!names?.length) {
        if (!placeId) throw new Error("Provide placeId or photoNames.");
        const r = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { fieldMask: "photos" });
        names = (r.photos || []).map((p: any) => p.name);
      }
      const urls = [];
      for (const n of names!.slice(0, max)) {
        const r = await call(`https://places.googleapis.com/v1/${n}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`);
        urls.push(r.photoUri);
      }
      return { photos: urls };
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
