#pragma once

#include <Arduino.h>

struct SessionParameters {
    String sessionId;
    String nodeId;
    String userId;
    float escrowAmount;
    float ratePerKwh;
    float maxEnergyKwh;
    String nonce;
    uint32_t issuedAt;
    uint32_t expiresAt;
    bool isValid;
};

class CryptoEngine {
public:
    /**
     * Initializes cryptographic sub-modules (mbedtls)
     */
    static void init();

    /**
     * Computes raw HMAC-SHA256 hex digest of a message using secretKey.
     * Output is a 64-character lowercase hex string.
     */
    static String hmacSha256(const String &secretKey, const String &message);

    /**
     * Produces exact HMAC signature matching Python backend and Next.js frontend:
     * Message format: f"{session_id}:{energy_kwh:.3f}:{cost:.2f}"
     */
    static String computeNodeSignature(
        const String &sessionId,
        float energyKwh,
        float actualCost,
        const String &secretKey
    );

    /**
     * Decodes Base64Url string into regular String
     */
    static String base64UrlDecode(const String &input);

    /**
     * Parses incoming WebBLE token (either backend-signed JWT or JSON voucher)
     * and extracts session authorization parameters.
     */
    static bool parseSessionToken(
        const String &token,
        const String &expectedNodeId,
        const String &nodeSecret,
        SessionParameters &outParams
    );

    /**
     * Builds standard JSON charging receipt with hardware HMAC signature
     */
    static String createReceiptJson(
        const String &sessionId,
        const String &nodeId,
        const String &userId,
        float energyKwh,
        float actualCost,
        uint32_t timestamp,
        const String &nonce,
        const String &nodeSignature
    );
};
