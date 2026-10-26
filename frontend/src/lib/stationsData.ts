export interface StationDetails {
  id: string;
  name: string;
  host: string;
  place: string;
  power: string;
  rate: number;
  latitude: number;
  longitude: number;
  hardwareNote: string;
  initials: string;
  status: "available" | "busy" | "offline_fault";
  statusLabel: "Available" | "Busy" | "Offline";
  isActive: boolean;
}

export const VELLORE_STATIONS: StationDetails[] = [
  // 6 Online / Available Stations
  {
    id: "node_esp32_01",
    name: "VIT Campus Solar Relay",
    host: "Rajesh Kumar (VIT Solar Grid)",
    place: "Near VIT Main Gate, Tiruvalam Road, Katpadi",
    power: "3.3 kW",
    rate: 8.00,
    latitude: 12.9692,
    longitude: 79.1559,
    hardwareNote: "100% Rooftop solar + PZEM-004T with shaded 2W bay",
    initials: "VC",
    status: "available",
    statusLabel: "Available",
    isActive: true,
  },
  {
    id: "node_esp32_03",
    name: "Sripuram Golden Temple Hub",
    host: "Lakshmi Narayani Trust",
    place: "Malaikodi, Sripuram Temple Road",
    power: "7.2 kW",
    rate: 6.80,
    latitude: 12.8998,
    longitude: 79.1162,
    hardwareNote: "Dual Type-2 Fast AC with pilgrimage visitor parking",
    initials: "SG",
    status: "available",
    statusLabel: "Available",
    isActive: true,
  },
  {
    id: "node_esp32_04",
    name: "Vellore Fort Heritage Tap",
    host: "Kannan Heritage Cafeteria",
    place: "Opp. Vellore Fort East Gate, Anna Salai",
    power: "3.3 kW",
    rate: 11.00,
    latitude: 12.9205,
    longitude: 79.1325,
    hardwareNote: "Heritage moat parking with shaded tree canopy",
    initials: "VF",
    status: "available",
    statusLabel: "Available",
    isActive: true,
  },
  {
    id: "node_esp32_06",
    name: "Ranipet Industrial Corridor Relay",
    host: "Ranipet Fleet Co-op",
    place: "SIPCOT Phase 1, Chennai Highway, Ranipet",
    power: "7.4 kW",
    rate: 17.55,
    latitude: 12.9275,
    longitude: 79.3330,
    hardwareNote: "Heavy-duty 32A industrial line for commercial cargo 3W",
    initials: "RI",
    status: "available",
    statusLabel: "Available",
    isActive: true,
  },
  {
    id: "node_esp32_09",
    name: "Walajah Highway Toll Dhaba",
    host: "Highway King Dhaba Tap",
    place: "NH-48 Toll Plaza Corridor, Walajapet",
    power: "7.2 kW",
    rate: 16.80,
    latitude: 12.9810,
    longitude: 79.3620,
    hardwareNote: "24/7 Dhaba dining with fenced overnight EV charging bay",
    initials: "WH",
    status: "available",
    statusLabel: "Available",
    isActive: true,
  },
  {
    id: "node_esp32_10",
    name: "Gudiyatham Agricultural Feeder",
    host: "Venkatesan Agro Solar",
    place: "Agricultural Market Yard, Gudiyatham Bypass",
    power: "3.3 kW",
    rate: 7.20,
    latitude: 12.9460,
    longitude: 78.8710,
    hardwareNote: "Subsidized farm community tariff with solar canopy",
    initials: "GA",
    status: "available",
    statusLabel: "Available",
    isActive: true,
  },

  // 2 Busy / In Use Stations
  {
    id: "node_esp32_02",
    name: "Katpadi Junction Charging Point",
    host: "Murugan S. (Station Relay)",
    place: "Near Katpadi Railway Station, NH-46",
    power: "3.3 kW",
    rate: 12.50,
    latitude: 12.9783,
    longitude: 79.1450,
    hardwareNote: "24/7 Chai point beside station parking, 30A relay",
    initials: "KJ",
    status: "busy",
    statusLabel: "Busy",
    isActive: true,
  },
  {
    id: "node_esp32_07",
    name: "Ambur Leather Town Node",
    host: "Ismail Leather Works",
    place: "NH-48 Bypass, Near Star Biryani, Ambur",
    power: "3.3 kW",
    rate: 14.40,
    latitude: 12.7905,
    longitude: 78.7160,
    hardwareNote: "Highway rest stop node with 24/7 tea & tire check",
    initials: "AL",
    status: "busy",
    statusLabel: "Busy",
    isActive: true,
  },

  // 2 Offline / Maintenance Stations
  {
    id: "node_esp32_05",
    name: "Bagayam Rural Clean Hub",
    host: "Dr. Anand Green Energy",
    place: "Near CMC Bagayam Campus, College Hill",
    power: "3.3 kW",
    rate: 9.50,
    latitude: 12.8710,
    longitude: 79.1350,
    hardwareNote: "Scheduled Solar Inverter & Battery Buffer Maintenance (Offline)",
    initials: "BR",
    status: "offline_fault",
    statusLabel: "Offline",
    isActive: false,
  },
  {
    id: "node_esp32_08",
    name: "Sholinghur Hill Temple Relay",
    host: "Govindarajan Temple Inn",
    place: "Foot of Yoga Narasimha Swamy Hill, Sholinghur",
    power: "3.3 kW",
    rate: 10.50,
    latitude: 13.1140,
    longitude: 79.4240,
    hardwareNote: "Hill Line Transformer Servicing & Battery Calibration (Offline)",
    initials: "SH",
    status: "offline_fault",
    statusLabel: "Offline",
    isActive: false,
  },
];

export function getStationById(id: string): StationDetails {
  const cleanId = id.trim();
  const found = VELLORE_STATIONS.find(
    (s) => s.id === cleanId || cleanId.includes(s.id) || s.id.includes(cleanId)
  );
  return found || VELLORE_STATIONS[0];
}
