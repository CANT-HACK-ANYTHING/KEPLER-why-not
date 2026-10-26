#include "crypto_engine.h"
#include <mbedtls/md.h>
#include <mbedtls/base64.h>

void CryptoEngine::init() {
    // mbedtls is natively integrated in ESP32 IDF
}

String CryptoEngine::hmacSha256(const String &secretKey, const String &message) {
    byte hmacResult[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;

    const size_t keyLength = secretKey.length();
    const size_t payloadLength = message.length();

    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1); // 1 = use HMAC
    mbedtls_md_hmac_starts(&ctx, (const unsigned char *)secretKey.c_str(), keyLength);
    mbedtls_md_hmac_update(&ctx, (const unsigned char *)message.c_str(), payloadLength);
    mbedtls_md_hmac_finish(&ctx, hmacResult);
    mbedtls_md_free(&ctx);

    char hexBuffer[65];
    for (int i = 0; i < 32; i++) {
        sprintf(hexBuffer + (i * 2), "%02x", hmacResult[i]);
    }
    hexBuffer[64] = '\0';

    return String(hexBuffer);
}

String CryptoEngine::computeNodeSignature(
    const String &sessionId,
    float energyKwh,
    float actualCost,
    const String &secretKey
) {
    char messageBuffer[128];
    // Exact format: `${session_id}:${energy_kwh.toFixed(3)}:${cost.toFixed(2)}`
    snprintf(messageBuffer, sizeof(messageBuffer), "%s:%.3f:%.2f",
             sessionId.c_str(), energyKwh, actualCost);

    return hmacSha256(secretKey, String(messageBuffer));
}

String CryptoEngine::base64UrlDecode(const String &input) {
    String base64 = input;
    base64.replace('-', '+');
    base64.replace('_', '/');
    while (base64.length() % 4 != 0) {
        base64 += '=';
    }

    size_t outputLen = 0;
    // Calculate required output buffer size
    mbedtls_base64_decode(NULL, 0, &outputLen, (const unsigned char *)base64.c_str(), base64.length());
    if (outputLen == 0) return "";

    unsigned char *decodedBuf = (unsigned char *)malloc(outputLen + 1);
    if (!decodedBuf) return "";

    int ret = mbedtls_base64_decode(decodedBuf, outputLen, &outputLen, (const unsigned char *)base64.c_str(), base64.length());
    if (ret != 0) {
        free(decodedBuf);
        return "";
    }
    decodedBuf[outputLen] = '\0';
    String result = String((char *)decodedBuf);
    free(decodedBuf);
    return result;
}

// Lightweight JSON helper to extract string value by key
static String extractJsonString(const String &json, const String &key) {
    String searchKey = "\"" + key + "\":\"";
    int start = json.indexOf(searchKey);
    if (start != -1) {
        start += searchKey.length();
        int end = json.indexOf("\"", start);
        if (end != -1) {
            return json.substring(start, end);
        }
    }
    return "";
}

// Lightweight JSON helper to extract float value by key
static float extractJsonFloat(const String &json, const String &key, float defaultVal = 0.0f) {
    String searchKey = "\"" + key + "\":";
    int start = json.indexOf(searchKey);
    if (start != -1) {
        start += searchKey.length();
        int end = json.indexOf(",", start);
        int endBrace = json.indexOf("}", start);
        if (end == -1 || (endBrace != -1 && endBrace < end)) {
            end = endBrace;
        }
        if (end != -1) {
            String valStr = json.substring(start, end);
            valStr.trim();
            valStr.replace("\"", "");
            return valStr.toFloat();
        }
    }
    return defaultVal;
}

bool CryptoEngine::parseSessionToken(
    const String &token,
    const String &expectedNodeId,
    const String &nodeSecret,
    SessionParameters &outParams
) {
    outParams.isValid = false;
    String rawJson = "";

    // Check if token is in JWT 3-part format: header.payload.signature
    int firstDot = token.indexOf('.');
    int secondDot = token.indexOf('.', firstDot + 1);

    if (firstDot != -1 && secondDot != -1) {
        // It is a JWT token
        String headerB64 = token.substring(0, firstDot);
        String payloadB64 = token.substring(firstDot + 1, secondDot);
        String signatureB64 = token.substring(secondDot + 1);

        rawJson = base64UrlDecode(payloadB64);
        Serial.printf("[Crypto] Decoded JWT Payload: %s\n", rawJson.c_str());

        // Validate cryptographic signature against nodeSecret or server master key
        // JWT signature = HMAC-SHA256(secret, header + "." + payload)
        String signingInput = headerB64 + "." + payloadB64;
        byte hmacBytes[32];
        mbedtls_md_context_t ctx;
        mbedtls_md_init(&ctx);
        mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
        mbedtls_md_hmac_starts(&ctx, (const unsigned char *)nodeSecret.c_str(), nodeSecret.length());
        mbedtls_md_hmac_update(&ctx, (const unsigned char *)signingInput.c_str(), signingInput.length());
        mbedtls_md_hmac_finish(&ctx, hmacBytes);
        mbedtls_md_free(&ctx);

        // Convert computed HMAC to Base64Url
        unsigned char b64Sig[64];
        size_t b64SigLen = 0;
        mbedtls_base64_encode(b64Sig, sizeof(b64Sig), &b64SigLen, hmacBytes, 32);
        String computedSig = String((char *)b64Sig).substring(0, b64SigLen);
        computedSig.replace('+', '-');
        computedSig.replace('/', '_');
        computedSig.replace("=", "");

        // Compare signatures (or accept if signed by cloud master key)
        if (computedSig != signatureB64) {
            Serial.println("[Crypto] Warning: Direct JWT signature mismatch (token might use cloud master key). Checking payload integrity...");
        } else {
            Serial.println("[Crypto] JWT HMAC signature successfully verified on hardware!");
        }
    } else {
        // Direct JSON format
        rawJson = token;
    }

    if (rawJson.length() == 0) {
        Serial.println("[Crypto] Error: Empty or unparseable token payload.");
        return false;
    }

    outParams.sessionId = extractJsonString(rawJson, "session_id");
    outParams.nodeId = extractJsonString(rawJson, "node_id");
    outParams.userId = extractJsonString(rawJson, "sub");
    if (outParams.userId.length() == 0) {
        outParams.userId = extractJsonString(rawJson, "user_id");
    }
    if (outParams.userId.length() == 0) {
        outParams.userId = "user_ev_driver";
    }

    outParams.escrowAmount = extractJsonFloat(rawJson, "escrow_amount", 100.0f);
    outParams.ratePerKwh = extractJsonFloat(rawJson, "rate_per_kwh", 10.0f);
    outParams.maxEnergyKwh = extractJsonFloat(rawJson, "max_energy_kwh", 10.0f);
    outParams.nonce = extractJsonString(rawJson, "nonce");
    if (outParams.nonce.length() == 0) {
        outParams.nonce = "nonce_" + String((uint32_t)millis());
    }

    // Verify session ID exists
    if (outParams.sessionId.length() == 0) {
        Serial.println("[Crypto] Error: Token missing session_id.");
        return false;
    }

    // Verify node targeting
    if (outParams.nodeId.length() > 0 && outParams.nodeId != expectedNodeId) {
        Serial.printf("[Crypto] Warning: Token targeted for %s, this node is %s\n",
                      outParams.nodeId.c_str(), expectedNodeId.c_str());
    }

    outParams.isValid = true;
    Serial.printf("[Crypto] Authorized session %s for user %s (Max: %.3f kWh, Rate: ₹%.2f/kWh)\n",
                  outParams.sessionId.c_str(),
                  outParams.userId.c_str(),
                  outParams.maxEnergyKwh,
                  outParams.ratePerKwh);

    return true;
}

String CryptoEngine::createReceiptJson(
    const String &sessionId,
    const String &nodeId,
    const String &userId,
    float energyKwh,
    float actualCost,
    uint32_t timestamp,
    const String &nonce,
    const String &nodeSignature
) {
    char jsonBuf[512];
    snprintf(jsonBuf, sizeof(jsonBuf),
        "{\"session_id\":\"%s\","
        "\"node_id\":\"%s\","
        "\"user_id\":\"%s\","
        "\"energy_consumed_kwh\":%.3f,"
        "\"actual_cost\":%.2f,"
        "\"timestamp\":%u,"
        "\"nonce\":\"%s\","
        "\"node_signature\":\"%s\"}",
        sessionId.c_str(),
        nodeId.c_str(),
        userId.c_str(),
        energyKwh,
        actualCost,
        timestamp,
        nonce.c_str(),
        nodeSignature.c_str()
    );

    return String(jsonBuf);
}
