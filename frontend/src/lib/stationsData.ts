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
}

export const VELLORE_STATIONS: StationDetails[] = [
  {
    id: "node_esp32_01",
    name: "VIT Campus Solar Relay",
    host: "Rajesh Kumar (VIT Solar Grid)",
    place: "Near VIT Main Gate, Tiruvalam Road, Katpadi",
    power: "3.3 kW",
    rate: 10.00,
    latitude: 12.9692,
    longitude: 79.1559,
    hardwareNote: "100% Rooftop solar + PZEM-004T with shaded 2W bay",
    initials: "VC",
  },
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
  },
  {
    id: "node_esp32_03",
    name: "Sripuram Golden Temple Hub",
    host: "Lakshmi Narayani Trust",
    place: "Malaikodi, Sripuram Temple Road",
    power: "7.2 kW",
    rate: 8.50,
    latitude: 12.8998,
    longitude: 79.1162,
    hardwareNote: "Dual Type-2 Fast AC with pilgrimage visitor parking",
    initials: "SG",
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
  },
  {
    id: "node_esp32_05",
    name: "Bagayam Rural Clean Hub",
    host: "Dr. Anand Green Energy",
    place: "Near CMC Bagayam Campus, College Hill",
    power: "3.3 kW",
    rate: 9.50,
    latitude: 12.8710,
    longitude: 79.1350,
    hardwareNote: "Solar battery buffer, open for public 2W/3W charging",
    initials: "BR",
  },
  {
    id: "node_esp32_06",
    name: "Ranipet Industrial Corridor Relay",
    host: "Ranipet Fleet Co-op",
    place: "SIPCOT Phase 1, Chennai Highway, Ranipet",
    power: "7.4 kW",
    rate: 13.00,
    latitude: 12.9275,
    longitude: 79.3330,
    hardwareNote: "Heavy-duty 32A industrial line for commercial cargo 3W",
    initials: "RI",
  },
  {
    id: "node_esp32_07",
    name: "Ambur Leather Town Node",
    host: "Ismail Leather Works",
    place: "NH-48 Bypass, Near Star Biryani, Ambur",
    power: "3.3 kW",
    rate: 12.00,
    latitude: 12.7905,
    longitude: 78.7160,
    hardwareNote: "Highway rest stop node with 24/7 tea & tire check",
    initials: "AL",
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
    hardwareNote: "Solar off-grid battery backed charging tap",
    initials: "SH",
  },
  {
    id: "node_esp32_09",
    name: "Walajah Highway Toll Dhaba",
    host: "Highway King Dhaba Tap",
    place: "NH-48 Toll Plaza Corridor, Walajapet",
    power: "7.2 kW",
    rate: 14.00,
    latitude: 12.9810,
    longitude: 79.3620,
    hardwareNote: "24/7 Dhaba dining with fenced overnight EV charging bay",
    initials: "WH",
  },
  {
    id: "node_esp32_10",
    name: "Gudiyatham Agricultural Feeder",
    host: "Venkatesan Agro Solar",
    place: "Agricultural Market Yard, Gudiyatham Bypass",
    power: "3.3 kW",
    rate: 9.00,
    latitude: 12.9460,
    longitude: 78.8710,
    hardwareNote: "Subsidized farm community tariff with solar canopy",
    initials: "GA",
  },
];

export function getStationById(id: string): StationDetails {
  const cleanId = id.trim();
  const found = VELLORE_STATIONS.find(
    (s) => s.id === cleanId || cleanId.includes(s.id) || s.id.includes(cleanId)
  );
  return found || VELLORE_STATIONS[0];
}
