/**
 * =============================================================================
 * RelayEV Offline Rural EV Charging Mesh - Hardware Node Firmware
 * =============================================================================
 * Microcontroller: ESP32 / ESP32-S3
 * Primary Sensor: Peacefair PZEM-004T v3.0 (AC Voltage, Current, Power, Energy)
 * Actuator: 30A Optoisolated Heavy-Duty Relay Module
 * Protocol: Web Bluetooth (WebBLE) GATT Server & Offline Data Mule Mesh
 * Cryptography: On-chip mbedtls HMAC-SHA256 & JWT verification
 * =============================================================================
 */

#include <Arduino.h>
#include "config.h"
#include "crypto_engine.h"
#include "pzem_meter.h"
#include "relay_controller.h"
#include "storage_manager.h"
#include "ble_manager.h"

// System Components
static CryptoEngine    crypto;
static PzemMeter       meter;
static RelayController relay;
static StorageManager  storage;
static BleManager      ble;

// Active Charging Session State
static SessionParameters activeSession;
static bool              isSessionActive = false;
static unsigned long     lastTelemetryMs = 0;
static String            lastReceiptJson = "";

// Forward declarations
void handleSessionToken(const String &tokenPayload);
void finalizeAndSignSession(const String &reason);
void processSerialCommands();

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n========================================================");
    Serial.println("   ⚡ RelayEV Offline EV Charging Node Firmware         ");
    Serial.printf ("   Node ID: %s | Firmware: %s\n", NODE_ID, FIRMWARE_VERSION);
    Serial.println("========================================================");

    // 1. Initialize Cryptographic Engine
    CryptoEngine::init();
    Serial.println("[System] Cryptographic engine (mbedtls SHA-256) initialized.");

    // 2. Initialize Persistent Flash Storage (SPIFFS)
    storage.begin();

    // 3. Initialize Relay Controller in Failsafe OFF state
    relay.begin(PIN_RELAY, PIN_LED_STATUS, PIN_LED_FAULT, PIN_MANUAL_STOP_BTN);

    // 4. Initialize PZEM-004T AC Energy Meter
    meter.begin(PZEM_RX_PIN, PZEM_TX_PIN, ALLOW_SENSOR_SIMULATION_FALLBACK);

    // 5. Register Data Mule callbacks
    ble.setMuleCallbacks(
        []() -> String {
            // Mule queries un-synced receipts
            return storage.getUnsyncedReceiptsJsonBatch(10);
        },
        [](const String &ack) {
            // Mule acknowledges synced receipts
            storage.markReceiptsSynced(ack);
        }
    );

    // 6. Register WebBLE token listener
    ble.setTokenCallback([](const String &token) {
        handleSessionToken(token);
    });

    // 7. Start BLE Stack
    ble.begin(NODE_ID);

    Serial.println("\n[System] ✓ RelayEV Node online and ready for EV drivers!\n");
    Serial.println("Available Serial Debug Commands:");
    Serial.println("  'START'  - Simulate incoming WebBLE session token (escrow voucher)");
    Serial.println("  'STOP'   - Prematurely stop charging and generate signed receipt");
    Serial.println("  'STATUS' - Display live sensor readings and flash storage status");
    Serial.println("  'MULE'   - Dump pending offline receipts stored for Data Mules");
    Serial.println("--------------------------------------------------------\n");
}

void loop() {
    // 1. Check for incoming WebBLE token
    String pendingToken;
    if (ble.hasPendingToken(pendingToken)) {
        handleSessionToken(pendingToken);
    }

    // 2. Update AC energy meter readings
    float maxKwh = isSessionActive ? activeSession.maxEnergyKwh : 0.0f;
    meter.update(relay.isEnergized(), maxKwh);
    MeterReading reading = meter.getReading();

    // 3. Watchdog & safety updates
    relay.update(reading.current, reading.energyKwh, maxKwh);

    // 4. Detect charging completion (auto-cutoff reached or safety trip)
    if (isSessionActive && !relay.isEnergized()) {
        RelayState state = relay.getState();
        if (state == RELAY_STATE_TRIPPED_CUTOFF) {
            finalizeAndSignSession("ESCROW_CUTOFF_REACHED");
        } else if (state == RELAY_STATE_TRIPPED_OVERCURRENT) {
            finalizeAndSignSession("SAFETY_OVERCURRENT_TRIP");
        } else if (state == RELAY_STATE_TRIPPED_EMERGENCY) {
            finalizeAndSignSession("MANUAL_EMERGENCY_STOP");
        }
    }

    // 5. Broadcast live telemetry to connected driver phone every 1000ms
    unsigned long now = millis();
    if (now - lastTelemetryMs >= HEARTBEAT_INTERVAL_MS) {
        lastTelemetryMs = now;

        if (ble.isClientConnected()) {
            char telemBuf[256];
            snprintf(telemBuf, sizeof(telemBuf),
                "{\"v\":%.1f,\"a\":%.2f,\"kw\":%.2f,\"kwh\":%.3f,\"elapsed\":%u,\"relay\":\"%s\"}",
                reading.voltage,
                reading.current,
                reading.powerKw,
                reading.energyKwh,
                relay.getElapsedSeconds(),
                relay.isEnergized() ? "CLOSED" : "OPEN"
            );
            ble.notifyTelemetry(String(telemBuf));
        }
    }

    // 6. Process interactive USB serial monitor commands
    processSerialCommands();

    delay(20); // FreeRTOS friendly yield
}

/**
 * Validates incoming escrow token, energizes 30A relay, and begins charging
 */
void handleSessionToken(const String &tokenPayload) {
    Serial.println("\n--------------------------------------------------------");
    Serial.println("[Session] Processing incoming Web Bluetooth session token...");

    SessionParameters params;
    if (!CryptoEngine::parseSessionToken(tokenPayload, NODE_ID, HARDWARE_SECRET, params)) {
        Serial.println("[Session] ❌ Token rejected: Invalid cryptographic signature or format.");
        return;
    }

    // Reset meter accumulator for fresh session
    meter.resetSessionEnergy();

    // Store active session parameters
    activeSession = params;
    isSessionActive = true;

    // Energize 30A relay contacts
    if (relay.energize()) {
        Serial.printf("[Session] ⚡ Charging started for session %s!\n", activeSession.sessionId.c_str());
        Serial.printf("          Driver: %s | Max Allowed: %.3f kWh | Tariff: ₹%.2f/kWh\n",
                      activeSession.userId.c_str(),
                      activeSession.maxEnergyKwh,
                      activeSession.ratePerKwh);
    } else {
        Serial.println("[Session] ❌ Hardware lockout: Relay failed to energize.");
        isSessionActive = false;
    }
    Serial.println("--------------------------------------------------------\n");
}

/**
 * Shuts off relay, computes final PZEM AC kWh, calculates HMAC-SHA256,
 * saves to flash for Data Mules, and notifies driver's phone over WebBLE.
 */
void finalizeAndSignSession(const String &reason) {
    if (!isSessionActive) return;

    Serial.println("\n========================================================");
    Serial.printf ("[Session] Finalizing session %s (Reason: %s)\n",
                   activeSession.sessionId.c_str(), reason.c_str());

    // Ensure relay contacts are open
    relay.deenergize(RELAY_STATE_IDLE);

    // Get final verified energy reading from meter
    MeterReading finalReading = meter.getReading();
    float finalKwh = finalReading.energyKwh;
    if (finalKwh < 0.001f) finalKwh = 0.001f; // Minimum granularity

    // Calculate actual cost
    float actualCost = finalKwh * activeSession.ratePerKwh;

    // Compute hardware HMAC-SHA256 signature
    String signature = CryptoEngine::computeNodeSignature(
        activeSession.sessionId,
        finalKwh,
        actualCost,
        HARDWARE_SECRET
    );

    uint32_t timestamp = (uint32_t)(millis() / 1000);

    // Build standard JSON receipt
    String receiptJson = CryptoEngine::createReceiptJson(
        activeSession.sessionId,
        NODE_ID,
        activeSession.userId,
        finalKwh,
        actualCost,
        timestamp,
        activeSession.nonce,
        signature
    );

    lastReceiptJson = receiptJson;

    Serial.println("[Session] 🔏 Cryptographic HMAC-SHA256 signature generated:");
    Serial.printf ("          Digest: %s\n", signature.c_str());
    Serial.printf ("          Final Bill: %.3f kWh @ ₹%.2f/kWh = ₹%.2f\n",
                   finalKwh, activeSession.ratePerKwh, actualCost);

    // 1. Save to flash storage (guarantees receipt survival for Data Mules even if phone disconnects)
    storage.saveReceipt(activeSession.sessionId, receiptJson);

    // 2. Transmit signed receipt to EV driver's phone via GATT notification
    ble.notifyReceipt(receiptJson);

    // Mark session completed
    isSessionActive = false;

    Serial.println("[Session] ✓ Signed receipt dispatched to phone & cached for Data Mules!");
    Serial.println("========================================================\n");
}

/**
 * Allows hardware testing and demo execution directly via Serial Monitor
 */
void processSerialCommands() {
    if (!Serial.available()) return;

    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "START") {
        // Synthesize an authorized escrow token for instant hardware testing
        String testToken = "{\"session_id\":\"REV-TEST-" + String((uint32_t)millis()).substring(4) + "\","
                           "\"node_id\":\"" + String(NODE_ID) + "\","
                           "\"sub\":\"user_88\","
                           "\"escrow_amount\":100.0,"
                           "\"rate_per_kwh\":10.0,"
                           "\"max_energy_kwh\":8.420,"
                           "\"nonce\":\"nonce_test_" + String((uint32_t)millis()) + "\"}";
        Serial.println("[Serial] Injecting test session voucher...");
        handleSessionToken(testToken);
    }
    else if (cmd == "STOP") {
        if (isSessionActive) {
            Serial.println("[Serial] Stopping active session on operator command...");
            finalizeAndSignSession("USER_MANUAL_STOP");
        } else {
            Serial.println("[Serial] No active charging session.");
        }
    }
    else if (cmd == "STATUS") {
        MeterReading r = meter.getReading();
        Serial.println("\n--- [RelayEV Node Status Report] ---");
        Serial.printf("Voltage:      %.1f V AC\n", r.voltage);
        Serial.printf("Current:      %.2f A\n", r.current);
        Serial.printf("Power:        %.2f kW\n", r.powerKw);
        Serial.printf("Session kWh:  %.3f kWh\n", r.energyKwh);
        Serial.printf("Relay State:  %s\n", relay.isEnergized() ? "CLOSED (Conducting)" : "OPEN (Failsafe)");
        Serial.printf("BLE Client:   %s\n", ble.isClientConnected() ? "CONNECTED" : "ADVERTISING");
        Serial.printf("Flash Mules:  %d un-synced receipts\n", (int)storage.getUnsyncedCount());
        Serial.println("------------------------------------\n");
    }
    else if (cmd == "MULE") {
        Serial.println("\n--- [Pending Drive-By Data Mule Receipts] ---");
        Serial.println(storage.getUnsyncedReceiptsJsonBatch(10));
        Serial.println("---------------------------------------------\n");
    }
}
