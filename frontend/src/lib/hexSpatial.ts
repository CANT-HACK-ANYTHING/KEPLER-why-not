// Multi-Tier Hexagonal Spatial Mapping Engine for RelayEV Offline Mesh Networks
// Implements Hierarchical Macro (Tier 1) and Micro (Tier 2) Hexagonal Spatial Grids

export interface HexCellInfo {
  cellId: string;
  ring: number;
  ringLabel: string;
  distanceKm: number;
}

export interface MacroHexSector {
  id: string;
  code: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  color: string;
  stationIds: string[];
}

// Pre-defined Macro Hexagonal Sectors (Tier 1 - Regional Clusters)
export const MACRO_HEX_SECTORS: MacroHexSector[] = [
  {
    id: 'macro_sector_vlr_central',
    code: 'HEX-MACRO-VLR01',
    name: 'Vellore Urban & Educational Core',
    centerLat: 12.9250,
    centerLng: 79.1350,
    radiusKm: 12.0,
    color: '#06b6d4', // Cyan
    stationIds: [
      'node_esp32_01', // VIT Campus Solar Relay
      'node_esp32_02', // Katpadi Junction Charging Point
      'node_esp32_03', // Sripuram Golden Temple Hub
      'node_esp32_04', // Vellore Fort Heritage Tap
      'node_esp32_05', // Bagayam Rural Clean Hub
    ],
  },
  {
    id: 'macro_sector_vlr_corridor',
    code: 'HEX-MACRO-CORRIDOR02',
    name: 'Highway & Rural Feeder Corridor',
    centerLat: 12.9400,
    centerLng: 79.1500,
    radiusKm: 55.0,
    color: '#8b5cf6', // Violet
    stationIds: [
      'node_esp32_06', // Ranipet Industrial Corridor Relay
      'node_esp32_07', // Ambur Leather Town Node
      'node_esp32_08', // Sholinghur Hill Temple Relay
      'node_esp32_09', // Walajah Highway Toll Dhaba
      'node_esp32_10', // Gudiyatham Agricultural Feeder
    ],
  },
];

/**
 * Generates the 6 boundary vertices of a regular hexagon on the earth's surface
 * @param centerLat Center latitude
 * @param centerLng Center longitude
 * @param radiusKm Radius from center to each vertex in kilometers
 */
export function getHexagonPolygon(
  centerLat: number,
  centerLng: number,
  radiusKm: number = 2.4
): [number, number][] {
  const vertices: [number, number][] = [];
  
  // 1 degree of latitude ~ 110.574 km
  const latOffset = radiusKm / 110.574;
  
  // 1 degree of longitude ~ 111.320 km * cos(latitude)
  const lngOffset = radiusKm / (111.320 * Math.cos((centerLat * Math.PI) / 180));

  for (let i = 0; i < 6; i++) {
    // 60-degree increments, rotated 30 degrees for flat-topped hexagons
    const angleDeg = 60 * i + 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    
    const vertexLat = centerLat + latOffset * Math.sin(angleRad);
    const vertexLng = centerLng + lngOffset * Math.cos(angleRad);
    
    vertices.push([vertexLat, vertexLng]);
  }

  return vertices;
}

/**
 * Deterministically computes an H3-style Hexagonal Cell ID for any coordinate
 */
export function generateHexCellId(lat: number, lng: number): string {
  const latCode = Math.floor((lat + 90) * 100).toString(16).toUpperCase().padStart(4, '0');
  const lngCode = Math.floor((lng + 180) * 100).toString(16).toUpperCase().padStart(4, '0');
  return `87${latCode}${lngCode}FFFF`;
}

/**
 * Calculates distance in km between two lat/lng coordinates (Haversine formula)
 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the Active Macro Hexagon Sector based on the driver's location
 * If driver is inside a macro hexagon, returns that sector.
 * Otherwise, returns the nearest macro sector.
 */
export function getActiveMacroSector(
  userLat: number,
  userLng: number
): MacroHexSector {
  let closestSector = MACRO_HEX_SECTORS[0];
  let minDistance = Infinity;

  for (const sector of MACRO_HEX_SECTORS) {
    const dist = getDistanceKm(userLat, userLng, sector.centerLat, sector.centerLng);
    if (dist <= sector.radiusKm) {
      // User is physically inside this Macro Hexagon!
      return sector;
    }
    if (dist < minDistance) {
      minDistance = dist;
      closestSector = sector;
    }
  }

  return closestSector;
}

/**
 * Calculates the Hexagonal Mesh K-Ring (topological grid distance)
 */
export function getHexRingNeighborhood(distanceKm: number, cellRadiusKm: number = 2.4): {
  ring: number;
  label: string;
  badgeClass: string;
} {
  const hexDiameter = cellRadiusKm * 1.8;

  if (distanceKm <= cellRadiusKm) {
    return {
      ring: 0,
      label: 'Ring 0: Local Cell',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    };
  }

  const ringIndex = Math.ceil(distanceKm / hexDiameter);

  if (ringIndex === 1) {
    return {
      ring: 1,
      label: 'Ring 1: Adjacent Cell',
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    };
  }

  if (ringIndex === 2) {
    return {
      ring: 2,
      label: 'Ring 2: Secondary Mesh',
      badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    };
  }

  return {
    ring: ringIndex,
    label: `Ring ${ringIndex}: Highway Relay`,
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  };
}
