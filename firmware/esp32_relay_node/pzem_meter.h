#pragma once

#include <Arduino.h>

struct MeterReading {
    float voltage;        // Volts AC (e.g. 230.4 V)
    float current;        // Amperes (e.g. 13.82 A)
    float powerKw;        // Active power in kW (e.g. 3.18 kW)
    float energyKwh;      // Cumulative energy in kWh
    float frequency;      // Grid frequency (e.g. 50.0 Hz)
    float powerFactor;    // Power factor (0.0 - 1.0)
    bool isConnected;     // True if physical PZEM-004T is responding
    bool isSimulated;     // True if using fallback breadboard simulation
};

class PzemMeter {
public:
    PzemMeter();

    /**
     * Initializes UART communication with PZEM-004T v3.0 module
     */
    void begin(int rxPin, int txPin, bool allowFallback = true);

    /**
     * Polls the meter registers or advances the simulation accumulator
     */
    bool update(bool relayEnergized, float sessionMaxKwh = 999.0f);

    /**
     * Returns the latest meter telemetry
     */
    MeterReading getReading() const;

    /**
     * Resets session energy accumulator to 0.000 kWh
     */
    void resetSessionEnergy();

    /**
     * Manually override energy reading (useful for unit testing)
     */
    void setEnergyKwh(float kwh);

private:
    int _rxPin;
    int _txPin;
    bool _allowFallback;
    bool _hardwareDetected;
    MeterReading _currentReading;
    unsigned long _lastUpdateMs;
    float _sessionEnergyKwh;

    // Modbus-RTU Helper functions
    bool sendModbusReadCommand();
    bool parseModbusResponse(uint8_t *buffer, size_t len);
    static uint16_t calculateCrc16(const uint8_t *buffer, uint16_t len);
};
