/**
 * ============================================================================
 * Data Reporter Module
 * ============================================================================
 * Handles sending measurement data to the backend server
 */

#ifndef DATA_REPORTER_H
#define DATA_REPORTER_H

#include <Arduino.h>
#include "types.h"

namespace DataReporter {
    /**
     * Initialize the reporter
     */
    void init();

    /**
     * Send measurement data to server. Fields the sensors couldn't actually
     * read (state.waterLevelValid / state.temperatureValid false) are sent
     * as JSON null instead of a placeholder number, so they never pollute
     * server-side averages/graphs.
     * @param state Current system state
     * @return true if sent successfully
     */
    bool send(const SystemState &state);
    
    /**
     * Send buffered measurement (from storage)
     * @param jsonData JSON string of measurement
     * @return true if sent successfully
     */
    bool sendBuffered(const char* jsonData);
    
    /**
     * Check server for config updates
     * @return true if new config received
     */
    bool checkConfigUpdate();
    
    /**
     * Set custom server endpoint (for testing)
     */
    void setEndpoint(const char* host, int port, const char* path);
}

#endif // DATA_REPORTER_H


