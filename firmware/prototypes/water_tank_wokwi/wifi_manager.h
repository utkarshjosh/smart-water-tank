/**
 * ============================================================================
 * WiFi Manager Module (Wokwi / ESP32 build)
 * ============================================================================
 * Same public API as firmware/src/modules/wifi_manager.h so water_tank.ino
 * doesn't need to change. The implementation differs: Wokwi doesn't yet
 * simulate a client actually associating with an ESP softAP (see README), so
 * instead of hosting its own "WaterTank-Setup" access point, this build joins
 * Wokwi-GUEST and serves the pairing page from there - forwarded to your
 * browser via wokwi.toml. The claim/pairing logic itself (ClaimClient::claim,
 * Config::save, the 3-attempt retry loop) is unchanged.
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>

namespace WifiManager {
    /**
     * Initialize WiFi
     */
    void init();

    /**
     * Connect to configured WiFi network or start config portal
     * @param forceConfigPortal Force start config portal (e.g., after 3 restarts)
     * @return true if connected successfully
     */
    bool connect(bool forceConfigPortal = false);

    /**
     * Check if WiFi is currently connected
     */
    bool isConnected();

    /**
     * Attempt to reconnect if disconnected
     */
    void reconnect();

    /**
     * Start the pairing portal (blocks until paired, exhausted, or timed out,
     * then restarts the device - matches the real firmware's contract)
     */
    void startConfigPortal();

    /**
     * Get current RSSI (signal strength)
     */
    int getRssi();

    /**
     * Get IP address as string
     */
    String getIpAddress();

    /**
     * Get MAC address as string
     */
    String getMacAddress();

    /**
     * Check if device should enter config portal (3 restarts within 5 seconds)
     * @return true if should enter config portal
     */
    bool shouldEnterConfigPortal();
}

#endif // WIFI_MANAGER_H
