#pragma once

#include <Arduino.h>

enum RelayState {
    RELAY_STATE_IDLE,
    RELAY_STATE_ENERGIZED,
    RELAY_STATE_TRIPPED_CUTOFF,
    RELAY_STATE_TRIPPED_OVERCURRENT,
    RELAY_STATE_TRIPPED_TIMEOUT,
    RELAY_STATE_TRIPPED_EMERGENCY
};

class RelayController {
public:
    RelayController();

    /**
     * Initializes GPIO pins for relay and indicators in failsafe OFF state
     */
    void begin(int relayPin, int statusLedPin, int faultLedPin, int stopBtnPin);

    /**
     * Closes the 30A relay to start delivering high-voltage AC power
     */
    bool energize();

    /**
     * Opens the relay immediately to disconnect AC load
     */
    void deenergize(RelayState reason = RELAY_STATE_IDLE);

    /**
     * Periodic watchdog and LED state update
     */
    void update(float currentAmps, float energyKwh, float maxAllowedKwh);

    /**
     * Returns true if the relay contacts are closed
     */
    bool isEnergized() const;

    /**
     * Returns current operational state
     */
    RelayState getState() const;

    /**
     * Returns charging duration in seconds
     */
    uint32_t getElapsedSeconds() const;

private:
    int _relayPin;
    int _statusLedPin;
    int _faultLedPin;
    int _stopBtnPin;
    bool _isEnergized;
    RelayState _state;
    unsigned long _sessionStartMs;
    unsigned long _lastBlinkMs;
    bool _blinkToggle;

    void updateIndicators();
};
