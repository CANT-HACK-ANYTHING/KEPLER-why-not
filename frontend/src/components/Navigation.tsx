"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { label: "Overview", href: "/", icon: "📋" },
    { label: "Mesh Map", href: "/map", icon: "🗺️" },
    { label: "Charger", href: "/charge", icon: "⚡" },
    { label: "Escrow Settle", href: "/settle", icon: "🛡️" },
    { label: "Host Dashboard", href: "/host", icon: "📊" },
    { label: "Data Mule", href: "/mule", icon: "🚗" },
  ];

  return (
    <nav
      style={{
        background: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none",
            color: "#fff",
            fontWeight: 800,
            fontSize: "18px",
            letterSpacing: "-0.5px",
          }}
        >
          <span
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "grid",
              placeItems: "center",
              fontSize: "16px",
              boxShadow: "0 0 12px rgba(16, 185, 129, 0.5)",
            }}
          >
            ⚡
          </span>
          <span>
            Relay<span style={{ color: "#34d399" }}>EV</span>
          </span>
        </Link>
        <span
          style={{
            background: "rgba(16, 185, 129, 0.15)",
            color: "#34d399",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            fontSize: "10px",
            padding: "2px 8px",
            borderRadius: "12px",
            fontWeight: 700,
          }}
        >
          RURAL MESH
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#ffffff" : "#94a3b8",
                background: isActive ? "rgba(16, 185, 129, 0.2)" : "transparent",
                border: isActive ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid transparent",
                transition: "all 0.2s ease",
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
