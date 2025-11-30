/**
 * ============================================================================
 * OTA Handler Module
 * ============================================================================
 * Handles Over-The-Air firmware updates
 */

#ifndef OTA_HANDLER_H
#define OTA_HANDLER_H

#include <Arduino.h>

namespace OTAHandler {
    /**
     * Initialize OTA (requires WiFi to be connected)
     */
    void init();
    
    /**
     * Handle OTA events (call in loop)
     */
    void handle();
    
    /**
     * Check for updates from server
     * @return true if update available
     */
    bool checkForUpdate();
    
    /**
     * Download and install update from URL
     * @param url Full URL to firmware binary
     * @return true if update successful
     */
    bool updateFromUrl(const char* url);
}

#endif // OTA_HANDLER_H

