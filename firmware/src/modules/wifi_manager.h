/**
 * ============================================================================
 * WiFi Manager Module
 * ============================================================================
 * Handles WiFi connection, reconnection, and AP fallback
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
     * Connect to configured WiFi network
     * @return true if connected successfully
     */
    bool connect();
    
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
}

#endif // WIFI_MANAGER_H

