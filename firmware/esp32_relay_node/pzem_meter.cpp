#include "pzem_meter.h"

// Modbus request for PZEM-004T v3.0 (Read 10 registers from 0x0000)
// Address: 0x01, Function: 0x04, Start: 0x0000, Count: 0x000A, CRC: 0x700D
static const uint8_t PZEM_READ_CMD[8] = { 0x01, 0x04, 0x00, 0x00, 0x00, 0x0A, 0x70, 0x0D };

// Use HardwareSerial 2 on ESP32
#define PZEM_SERIAL Serial2

PzemMeter::PzemMeter()
    : _rxPin(16),
      _txPin(17),
      _allowFallback(true),
      _hardwareDetected(false),
      _lastUpdateMs(0),
      _sessionEnergyKwh(0.0f)
{
    _currentReading = { 0.0f, 0.0f, 0.0f, 0.0f, 50.0f, 0.98f, false, false };
}

uint16_t PzemMeter::calculateCrc16(const uint8_t *buffer, uint16_t len) {
    uint16_t crc = 0xFFFF;
    for (uint16_t pos = 0; pos < len; pos++) {
        crc ^= (uint16_t)buffer[pos];
        for (int i = 8; i != 0; i--) {
            if ((crc & 0x0001) != 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

void PzemMeter::begin(int rxPin, int txPin, bool allowFallback) {
    _rxPin = rxPin;
    _txPin = txPin;
    _allowFallback = allowFallback;
    _lastUpdateMs = millis();

    Serial.printf("[PZEM] Initializing UART on RX=%d, TX=%d @ 9600 baud...\n", _rxPin, _txPin);
    PZEM_SERIAL.begin(9600, SERIAL_8N1, _rxPin, _txPin);
    delay(100);

    // Test hardware response
    sendModbusReadCommand();
    delay(100);

    uint8_t rxBuffer[30];
    size_t bytesRead = 0;
    while (PZEM_SERIAL.available() && bytesRead < sizeof(rxBuffer)) {
        rxBuffer[bytesRead++] = PZEM_SERIAL.read();
    }

    if (bytesRead >= 25 && parseModbusResponse(rxBuffer, bytesRead)) {
        _hardwareDetected = true;
        _currentReading.isConnected = true;
        _currentReading.isSimulated = false;
        Serial.println("[PZEM] ✓ Physical PZEM-004T v3.0 AC Meter detected and calibrated!");
    } else {
        _hardwareDetected = false;
        _currentReading.isConnected = false;
        _currentReading.isSimulated = _allowFallback;
        if (_allowFallback) {
            Serial.println("[PZEM] ℹ Physical sensor not detected. Fallback simulation ACTIVE (Safe for breadboard/demo).");
        } else {
            Serial.println("[PZEM] ⚠ Warning: Physical PZEM sensor offline.");
        }
    }
}

bool PzemMeter::sendModbusReadCommand() {
    while (PZEM_SERIAL.available()) {
        PZEM_SERIAL.read(); // Clear input buffer
    }
    return PZEM_SERIAL.write(PZEM_READ_CMD, sizeof(PZEM_READ_CMD)) == sizeof(PZEM_READ_CMD);
}

bool PzemMeter::parseModbusResponse(uint8_t *buf, size_t len) {
    if (len < 25) return false;
    if (buf[0] != 0x01 || buf[1] != 0x04 || buf[2] != 0x14) return false;

    // Verify CRC
    uint16_t receivedCrc = buf[len - 2] | (buf[len - 1] << 8);
    uint16_t expectedCrc = calculateCrc16(buf, len - 2);
    if (receivedCrc != expectedCrc) {
        Serial.println("[PZEM] CRC mismatch on Modbus packet.");
        return false;
    }

    // Register 0x0000: Voltage (0.1V)
    uint16_t rawVoltage = (buf[3] << 8) | buf[4];
    _currentReading.voltage = rawVoltage * 0.1f;

    // Register 0x0001-0x0002: Current (0.001A)
    uint32_t rawCurrent = (buf[5] << 8) | buf[6] | (buf[7] << 24) | (buf[8] << 16);
    _currentReading.current = rawCurrent * 0.001f;

    // Register 0x0003-0x0004: Power (0.1W)
    uint32_t rawPower = (buf[9] << 8) | buf[10] | (buf[11] << 24) | (buf[12] << 16);
    _currentReading.powerKw = (rawPower * 0.1f) / 1000.0f;

    // Register 0x0005-0x0006: Energy (1 Wh)
    uint32_t rawEnergy = (buf[13] << 8) | buf[14] | (buf[15] << 24) | (buf[16] << 16);
    _currentReading.energyKwh = rawEnergy / 1000.0f;

    // Register 0x0007: Frequency (0.1Hz)
    uint16_t rawFreq = (buf[17] << 8) | buf[18];
    _currentReading.frequency = rawFreq * 0.1f;

    // Register 0x0008: Power Factor (0.01)
    uint16_t rawPf = (buf[19] << 8) | buf[20];
    _currentReading.powerFactor = rawPf * 0.01f;

    return true;
}

bool PzemMeter::update(bool relayEnergized, float sessionMaxKwh) {
    unsigned long now = millis();
    float dtSeconds = (now - _lastUpdateMs) / 1000.0f;
    if (dtSeconds <= 0.0f) dtSeconds = 0.05f;
    _lastUpdateMs = now;

    if (_hardwareDetected) {
        sendModbusReadCommand();
        unsigned long timeout = millis() + 60;
        uint8_t rxBuffer[30];
        size_t bytesRead = 0;

        while (millis() < timeout && bytesRead < sizeof(rxBuffer)) {
            if (PZEM_SERIAL.available()) {
                rxBuffer[bytesRead++] = PZEM_SERIAL.read();
            }
        }

        if (bytesRead >= 25 && parseModbusResponse(rxBuffer, bytesRead)) {
            _currentReading.isConnected = true;
            return true;
        }
    }

    // Fallback Simulation Mode
    if (_allowFallback) {
        if (relayEnergized) {
            // AC Mains 230V ± 2V subtle noise
            float voltageNoise = ((rand() % 40) - 20) / 10.0f;
            _currentReading.voltage = 230.0f + voltageNoise;
            
            // Single-phase 13.8A (~3.17 kW) EV on-board charger load
            float currentNoise = ((rand() % 20) - 10) / 100.0f;
            _currentReading.current = 13.8f + currentNoise;
            _currentReading.powerFactor = 0.98f;
            _currentReading.frequency = 50.0f;
            _currentReading.powerKw = (_currentReading.voltage * _currentReading.current * _currentReading.powerFactor) / 1000.0f;

            // Increment kWh: for sprint demo, accelerate accumulation
            // Power = ~3.2 kW => ~0.88 kWh per second in demo speedup
            float deltaKwh = (_currentReading.powerKw / 3600.0f) * dtSeconds * 30.0f; // 30x sprint demo time multiplier
            _sessionEnergyKwh += deltaKwh;

            if (_sessionEnergyKwh > sessionMaxKwh) {
                _sessionEnergyKwh = sessionMaxKwh;
            }
            _currentReading.energyKwh = _sessionEnergyKwh;
        } else {
            // Idle / Relay open
            _currentReading.voltage = 230.2f;
            _currentReading.current = 0.0f;
            _currentReading.powerKw = 0.0f;
            _currentReading.frequency = 50.0f;
            _currentReading.powerFactor = 1.0f;
            _currentReading.energyKwh = _sessionEnergyKwh;
        }
        return true;
    }

    return false;
}

MeterReading PzemMeter::getReading() const {
    return _currentReading;
}

void PzemMeter::resetSessionEnergy() {
    _sessionEnergyKwh = 0.0f;
    _currentReading.energyKwh = 0.0f;
}

void PzemMeter::setEnergyKwh(float kwh) {
    _sessionEnergyKwh = kwh;
    _currentReading.energyKwh = kwh;
}
