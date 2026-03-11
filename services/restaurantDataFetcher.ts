import Restaurant from "../models/restaurantModel.js";
import { fetchOverpass, getCoords, buildAddress, findDuplicates, OverpassElement } from "./overpassFetcher.js";

const OVERPASS_QUERY = `[out:json][timeout:120];
area[name="Gent"]["admin_level"="8"]->.a;
(
  node["amenity"="restaurant"](area.a);
  way["amenity"="restaurant"](area.a);
);
out center body;`;

interface ParsedRestaurant {
  osmId: number;
  name: string;
  address: string;
  cuisine: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  takeaway?: boolean;
  lat: number;
  lng: number;
}

function parseElement(el: OverpassElement): ParsedRestaurant | null {
  const tags = el.tags || {};
  if (!tags.name) return null;

  const coords = getCoords(el);
  if (!coords) return null;

  return {
    osmId: el.id,
    name: tags.name,
    address: buildAddress(tags),
    cuisine: tags.cuisine || "restaurant",
    phone: tags.phone || tags["contact:phone"],
    website: tags.website || tags["contact:website"],
    openingHours: tags.opening_hours,
    takeaway: tags.takeaway === "yes" ? true : tags.takeaway === "no" ? false : undefined,
    lat: coords.lat,
    lng: coords.lng,
  };
}

export async function syncRestaurantData() {
  const elements = await fetchOverpass(OVERPASS_QUERY, "RestaurantFetcher");

  const parsed: ParsedRestaurant[] = [];
  for (const el of elements) {
    const r = parseElement(el);
    if (r) parsed.push(r);
  }

  const duplicates = findDuplicates(parsed);
  const unique = parsed.filter((_, i) => !duplicates.has(i));

  let created = 0;
  let updated = 0;

  for (const r of unique) {
    const result = await Restaurant.updateOne(
      { identifier: r.osmId },
      {
        $set: {
          name: r.name,
          address: r.address,
          cuisine: r.cuisine,
          identifier: r.osmId,
          phone: r.phone || "",
          website: r.website || "",
          openingHours: r.openingHours || "",
          takeaway: r.takeaway,
          location: {
            type: "Point",
            coordinates: [r.lng, r.lat],
          },
        },
        $setOnInsert: {
          intensity: 0,
          rating: 0,
          isDeleted: false,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  return {
    total: elements.length,
    parsed: parsed.length,
    duplicatesSkipped: duplicates.size,
    unique: unique.length,
    created,
    updated,
  };
}
