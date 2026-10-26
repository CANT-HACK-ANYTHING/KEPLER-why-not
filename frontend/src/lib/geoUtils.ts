/**
 * =============================================================================
 * RelayEV Geo & Route Utilities for Driver Navigation
 * Computes Haversine great-circle distances and turn-by-turn routing links
 * =============================================================================
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculates distance between two GPS coordinates in kilometers using Haversine formula
 */
export function calculateDistanceKm(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);

  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;

  return Math.round(d * 10) / 10; // 1 decimal place (e.g. 1.4 km)
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Generates an external turn-by-turn Google Maps navigation URL
 */
export function getGoogleMapsNavigationUrl(
  destination: Coordinates,
  destinationName?: string
): string {
  const query = destinationName
    ? encodeURIComponent(destinationName)
    : `${destination.latitude},${destination.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&destination_place_id=${query}`;
}

/**
 * Default fallback coordinates: Vellore Central / VIT Campus, Tamil Nadu
 */
export const DEFAULT_DRIVER_COORDS: Coordinates = {
  latitude: 12.9692,
  longitude: 79.1559,
};
