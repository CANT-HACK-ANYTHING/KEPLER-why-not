import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RelayEV: Offline Rural EV Charging Mesh",
    short_name: "RelayEV",
    description: "Decentralized P2P EV charging infrastructure with cryptographic escrow over Web Bluetooth in cellular dead zones.",
    start_url: "/",
    id: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#059669",
    orientation: "portrait",
    categories: ["utilities", "travel", "navigation"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Community Mesh Map",
        short_name: "Map",
        url: "/",
        icons: [{ src: "/icons/icon-192.svg", sizes: "192x192" }],
      },
      {
        name: "Direct Charging",
        short_name: "Charge",
        url: "/charge",
        icons: [{ src: "/icons/icon-192.svg", sizes: "192x192" }],
      },
    ],
  };
}
