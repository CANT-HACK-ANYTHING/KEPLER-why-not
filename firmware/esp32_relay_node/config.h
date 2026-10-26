#pragma once

#include <Arduino.h>

// =============================================================================
// HARDWARE PIN DEFINITIONS (ESP32-WROOM-32 / ESP32-S3)
// =============================================================================
#define PIN_RELAY           23      // 30A Optoisolated Heavy-Duty Relay (Active HIGH)
#define PIN_LED_STATUS      2       // Onboard Blue/Green Status LED (Blinks = BLE Ready, Solid = Charging)
#define PIN_LED_FAULT       4       // Red Fault / Overload LED
#define PIN_MANUAL_STOP_BTN 0       // Boot button used as Emergency Manual Stop

// PZEM-004T v3.0 UART Pinout (HardwareSerial 2)
#define PZEM_RX_PIN         16      // Connects to PZEM TX (with 1k resistor divider if 5V)
#define PZEM_TX_PIN         17      // Connects to PZEM RX

// =============================================================================
// CRYPTOGRAPHIC & CLOUD IDENTITY SETTINGS
// =============================================================================
#define NODE_ID             "RelayEV-Node-01"
#define NODE_NAME           "RelayEV Community Mesh Node #01"
#define HARDWARE_SECRET     "relay_ev_hardware_master_secret_2026"
#define FIRMWARE_VERSION    "v1.2.0-mesh-pzem"

// Default tariff in INR (if not overridden by backend JWT token)
#define DEFAULT_RATE_PER_KWH 10.00f

// Safety limits
#define MAX_CURRENT_AMPS    32.0f   // Safety trip threshold (32 Amperes)
#define MAX_POWER_KW        7.4f    // Maximum rating for single-phase 32A charger
#define HEARTBEAT_INTERVAL_MS 1000  // Live telemetry broadcast period (1 second)

// =============================================================================
// BLUETOOTH LOW ENERGY (BLE) GATT SERVICE & CHARACTERISTIC UUIDS
// Must match frontend/src/lib/bleService.ts and types/ble.ts
// =============================================================================
#define SERVICE_UUID            "4fafc201-1fb5-459e-8fcc-c5c9c331914b" // Primary RelayEV Service
#define TOKEN_WRITE_UUID        "beb5483e-36e1-4688-b7f5-ea07361b26a8" // Write session_token (JWT or JSON)
#define RECEIPT_NOTIFY_UUID     "1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e" // Read / Notify final signed receipt
#define TELEMETRY_NOTIFY_UUID   "5b9d36e8-23f4-4a5c-9c7a-8f1d3e5b7a9c" // Live V, A, kW, kWh telemetry
#define MULE_SYNC_UUID          "c18d09f2-66b2-4d1e-84b7-5a12ef8b3a01" // Drive-By Data Mule batch receipts

// =============================================================================
// SIMULATION FALLBACK
// =============================================================================
// When TRUE: If physical PZEM-004T is disconnected, smoothly simulates real AC power
// allows testing without live 230V mains power connected.
#define ALLOW_SENSOR_SIMULATION_FALLBACK true
