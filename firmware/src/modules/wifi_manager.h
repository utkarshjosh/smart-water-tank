/**
 * ============================================================================
 * WiFi Manager Module
 * ============================================================================
 * Handles WiFi connection, reconnection, and AP fallback using WiFiManager
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
     * Start AP mode for configuration
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
