#include "ble_manager.h"
#include "config.h"

// Characteristic callback for incoming session authorization token
class TokenCharCallbacks : public BLECharacteristicCallbacks {
public:
    TokenCharCallbacks(BleManager* manager) : _manager(manager) {}

    void onWrite(BLECharacteristic *pChar) override {
        String rxValue = pChar->getValue();
        if (rxValue.length() > 0) {
            _manager->handleTokenWrite(rxValue);
        }
    }

private:
    BleManager* _manager;
};

// Characteristic callback for Data Mule queries and acknowledgments
class MuleCharCallbacks : public BLECharacteristicCallbacks {
public:
    MuleCharCallbacks(BleManager* manager) : _manager(manager) {}

    void onRead(BLECharacteristic *pChar) override {
        String batchJson = _manager->handleMuleRead();
        pChar->setValue(batchJson.c_str());
        Serial.printf("[BLE-Mule] Serving %d bytes of stranded offline receipts to Data Mule.\n",
                      (int)batchJson.length());
    }

    void onWrite(BLECharacteristic *pChar) override {
        String ackValue = pChar->getValue();
        if (ackValue.length() > 0) {
            _manager->handleMuleWrite(ackValue);
        }
    }

private:
    BleManager* _manager;
};

BleManager::BleManager()
    : _deviceName("RelayEV-Node-01"),
      _deviceConnected(false),
      _oldDeviceConnected(false),
      _pendingToken(""),
      _hasPendingToken(false),
      _pServer(nullptr),
      _pService(nullptr),
      _pTokenChar(nullptr),
      _pReceiptChar(nullptr),
      _pTelemetryChar(nullptr),
      _pMuleChar(nullptr)
{
}

void BleManager::begin(const String &deviceName) {
    _deviceName = deviceName;

    Serial.printf("[BLE] Initializing Web Bluetooth stack as '%s'...\n", _deviceName.c_str());
    BLEDevice::init(_deviceName.c_str());

    // Increase MTU to 512 bytes for full JWT voucher payloads
    BLEDevice::setMTU(512);

    _pServer = BLEDevice::createServer();
    _pServer->setCallbacks(this);

    _pService = _pServer->createService(SERVICE_UUID);

    // 1. Session Token Write Characteristic (Browser writes JWT/JSON here)
    _pTokenChar = _pService->createCharacteristic(
        TOKEN_WRITE_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    _pTokenChar->setCallbacks(new TokenCharCallbacks(this));

    // 2. Receipt Notify Characteristic (ESP32 notifies signed receipt to phone)
    _pReceiptChar = _pService->createCharacteristic(
        RECEIPT_NOTIFY_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    _pReceiptChar->addDescriptor(new BLE2902());

    // 3. Live Telemetry Characteristic (Streams V, A, kW, kWh every second)
    _pTelemetryChar = _pService->createCharacteristic(
        TELEMETRY_NOTIFY_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    _pTelemetryChar->addDescriptor(new BLE2902());

    // 4. Drive-By Data Mule Mesh Characteristic (Read unsynced receipts, Write sync ACK)
    _pMuleChar = _pService->createCharacteristic(
        MULE_SYNC_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
    );
    _pMuleChar->setCallbacks(new MuleCharCallbacks(this));

    // Start service
    _pService->start();

    // Start advertising
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06); // Functions that help with iPhone connections issue
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.println("[BLE] ✓ BLE GATT Server running & advertising RelayEV Primary Service!");
}

void BleManager::setTokenCallback(TokenReceivedCallback cb) {
    _tokenCallback = cb;
}

void BleManager::setMuleCallbacks(MuleReadBatchCallback readCb, MuleAckCallback ackCb) {
    _muleReadCallback = readCb;
    _muleAckCallback = ackCb;
}

void BleManager::notifyReceipt(const String &receiptJson) {
    if (_pReceiptChar) {
        _pReceiptChar->setValue(receiptJson.c_str());
        if (_deviceConnected) {
            _pReceiptChar->notify();
            Serial.printf("[BLE] 🚀 Dispatched signed receipt notification (%d bytes) to phone!\n",
                          (int)receiptJson.length());
        }
    }
}

void BleManager::notifyTelemetry(const String &telemetryJson) {
    if (_pTelemetryChar) {
        _pTelemetryChar->setValue(telemetryJson.c_str());
        if (_deviceConnected) {
            _pTelemetryChar->notify();
        }
    }
}

bool BleManager::isClientConnected() const {
    return _deviceConnected;
}

bool BleManager::hasPendingToken(String &outToken) {
    if (_hasPendingToken) {
        outToken = _pendingToken;
        _hasPendingToken = false;
        _pendingToken = "";
        return true;
    }
    return false;
}

void BleManager::onConnect(BLEServer* pServer) {
    _deviceConnected = true;
    Serial.println("[BLE] 📲 Client phone connected over Web Bluetooth!");
}

void BleManager::onDisconnect(BLEServer* pServer) {
    _deviceConnected = false;
    Serial.println("[BLE] 📴 Client phone disconnected. Restarting BLE advertising...");
    delay(100);
    pServer->startAdvertising(); // Restart advertising for next driver or mule
}

void BleManager::handleTokenWrite(const String &value) {
    Serial.printf("[BLE] 📥 Received session token payload (%d bytes) over WebBLE.\n", (int)value.length());
    _pendingToken = value;
    _hasPendingToken = true;

    if (_tokenCallback) {
        _tokenCallback(value);
    }
}

void BleManager::handleMuleWrite(const String &value) {
    Serial.printf("[BLE-Mule] 📥 Received Data Mule sync acknowledgment: %s\n", value.c_str());
    if (_muleAckCallback) {
        _muleAckCallback(value);
    }
}

String BleManager::handleMuleRead() {
    if (_muleReadCallback) {
        return _muleReadCallback();
    }
    return "[]";
}
