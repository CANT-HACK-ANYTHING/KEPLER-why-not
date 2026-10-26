#include "relay_controller.h"

RelayController::RelayController()
    : _relayPin(23),
      _statusLedPin(2),
      _faultLedPin(4),
      _stopBtnPin(0),
      _isEnergized(false),
      _state(RELAY_STATE_IDLE),
      _sessionStartMs(0),
      _lastBlinkMs(0),
      _blinkToggle(false)
{
}

void RelayController::begin(int relayPin, int statusLedPin, int faultLedPin, int stopBtnPin) {
    _relayPin = relayPin;
    _statusLedPin = statusLedPin;
    _faultLedPin = faultLedPin;
    _stopBtnPin = stopBtnPin;

    // Failsafe configuration: Ensure relay is OPEN before configuring as OUTPUT
    pinMode(_relayPin, OUTPUT);
    digitalWrite(_relayPin, LOW); // De-energized

    pinMode(_statusLedPin, OUTPUT);
    digitalWrite(_statusLedPin, LOW);

    pinMode(_faultLedPin, OUTPUT);
    digitalWrite(_faultLedPin, LOW);

    pinMode(_stopBtnPin, INPUT_PULLUP);

    _isEnergized = false;
    _state = RELAY_STATE_IDLE;
    Serial.println("[Relay] Relay controller initialized in FAILSAFE OPEN state.");
}

bool RelayController::energize() {
    if (_state == RELAY_STATE_TRIPPED_OVERCURRENT) {
        Serial.println("[Relay] Refusing to energize: Overcurrent lockout active!");
        return false;
    }

    _isEnergized = true;
    _state = RELAY_STATE_ENERGIZED;
    _sessionStartMs = millis();
    digitalWrite(_relayPin, HIGH); // CLOSE 30A contacts
    digitalWrite(_statusLedPin, HIGH);
    digitalWrite(_faultLedPin, LOW);

    Serial.println("[Relay] ⚡ 30A Relay ENERGIZED. EV charging actively delivering power!");
    return true;
}

void RelayController::deenergize(RelayState reason) {
    _isEnergized = false;
    _state = reason;
    digitalWrite(_relayPin, LOW); // OPEN contacts immediately

    if (reason == RELAY_STATE_TRIPPED_OVERCURRENT || reason == RELAY_STATE_TRIPPED_EMERGENCY) {
        digitalWrite(_faultLedPin, HIGH);
        digitalWrite(_statusLedPin, LOW);
    }

    Serial.printf("[Relay] 🛑 Relay DE-ENERGIZED. Contacts OPEN. (Reason code: %d)\n", (int)reason);
}

void RelayController::update(float currentAmps, float energyKwh, float maxAllowedKwh) {
    // 1. Check physical emergency button
    if (digitalRead(_stopBtnPin) == LOW) {
        if (_isEnergized) {
            Serial.println("[Relay] 🚨 Emergency stop button pressed!");
            deenergize(RELAY_STATE_TRIPPED_EMERGENCY);
            return;
        }
    }

    // 2. Over-current safety trip
    if (_isEnergized && currentAmps > 32.5f) {
        Serial.printf("[Relay] 🚨 Over-current trip! Current: %.2fA > 32.0A limit\n", currentAmps);
        deenergize(RELAY_STATE_TRIPPED_OVERCURRENT);
        return;
    }

    // 3. Cutoff when driver's escrow quota is satisfied
    if (_isEnergized && energyKwh >= maxAllowedKwh && maxAllowedKwh > 0.001f) {
        Serial.printf("[Relay] 🏁 Energy cutoff reached! Dispensed: %.3f kWh >= Allowed: %.3f kWh\n",
                      energyKwh, maxAllowedKwh);
        deenergize(RELAY_STATE_TRIPPED_CUTOFF);
        return;
    }

    // 4. Update status LED pattern
    updateIndicators();
}

void RelayController::updateIndicators() {
    unsigned long now = millis();

    switch (_state) {
        case RELAY_STATE_IDLE:
            // Slow pulse / blink (1 Hz) indicating ready for BLE connection
            if (now - _lastBlinkMs >= 500) {
                _lastBlinkMs = now;
                _blinkToggle = !_blinkToggle;
                digitalWrite(_statusLedPin, _blinkToggle ? HIGH : LOW);
                digitalWrite(_faultLedPin, LOW);
            }
            break;

        case RELAY_STATE_ENERGIZED:
            // Solid on during active charging
            digitalWrite(_statusLedPin, HIGH);
            digitalWrite(_faultLedPin, LOW);
            break;

        case RELAY_STATE_TRIPPED_CUTOFF:
            // Fast blink (3 Hz) indicating session completed & receipt ready
            if (now - _lastBlinkMs >= 150) {
                _lastBlinkMs = now;
                _blinkToggle = !_blinkToggle;
                digitalWrite(_statusLedPin, _blinkToggle ? HIGH : LOW);
            }
            break;

        case RELAY_STATE_TRIPPED_OVERCURRENT:
        case RELAY_STATE_TRIPPED_EMERGENCY:
            // Solid red error
            digitalWrite(_statusLedPin, LOW);
            digitalWrite(_faultLedPin, HIGH);
            break;

        default:
            break;
    }
}

bool RelayController::isEnergized() const {
    return _isEnergized;
}

RelayState RelayController::getState() const {
    return _state;
}

uint32_t RelayController::getElapsedSeconds() const {
    if (_sessionStartMs == 0) return 0;
    return (millis() - _sessionStartMs) / 1000;
}
