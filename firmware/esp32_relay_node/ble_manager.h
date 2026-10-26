#pragma once

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <functional>

typedef std::function<void(const String &token)> TokenReceivedCallback;
typedef std::function<void(const String &muleAck)> MuleAckCallback;
typedef std::function<String()> MuleReadBatchCallback;

class BleManager : public BLEServerCallbacks {
public:
    BleManager();

    /**
     * Initializes BLE GATT server, characteristics, and begins advertising
     */
    void begin(const String &deviceName);

    /**
     * Registers listener for incoming Web Bluetooth session tokens
     */
    void setTokenCallback(TokenReceivedCallback cb);

    /**
     * Registers listener for Drive-By Data Mule requests
     */
    void setMuleCallbacks(MuleReadBatchCallback readCb, MuleAckCallback ackCb);

    /**
     * Sends signed receipt notification to connected EV driver phone
     */
    void notifyReceipt(const String &receiptJson);

    /**
     * Broadcasts live telemetry (voltage, current, kW, kWh) to phone
     */
    void notifyTelemetry(const String &telemetryJson);

    /**
     * Returns true if phone or central is actively connected
     */
    bool isClientConnected() const;

    /**
     * Returns true if a new token was received and needs processing
     */
    bool hasPendingToken(String &outToken);

    // BLEServerCallbacks overrides
    void onConnect(BLEServer* pServer) override;
    void onDisconnect(BLEServer* pServer) override;

    // Internal characteristic write callback hooks
    void handleTokenWrite(const String &value);
    void handleMuleWrite(const String &value);
    String handleMuleRead();

private:
    String _deviceName;
    bool _deviceConnected;
    bool _oldDeviceConnected;
    String _pendingToken;
    bool _hasPendingToken;

    BLEServer* _pServer;
    BLEService* _pService;
    BLECharacteristic* _pTokenChar;
    BLECharacteristic* _pReceiptChar;
    BLECharacteristic* _pTelemetryChar;
    BLECharacteristic* _pMuleChar;

    TokenReceivedCallback _tokenCallback;
    MuleReadBatchCallback _muleReadCallback;
    MuleAckCallback _muleAckCallback;
};
