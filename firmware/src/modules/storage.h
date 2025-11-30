/**
 * ============================================================================
 * Storage Module
 * ============================================================================
 * Handles local data storage (LittleFS) for buffering and persistence
 */

#ifndef STORAGE_H
#define STORAGE_H

#include <Arduino.h>
#include "types.h"

namespace Storage {
    /**
     * Initialize filesystem
     */
    void init();
    
    /**
     * Format the filesystem (WARNING: erases all data)
     */
    void format();
    
    /**
     * Buffer a measurement for later upload
     * @param state Current system state
     */
    void bufferMeasurement(const SystemState& state);
    
    /**
     * Flush buffered measurements to server
     * @return Number of measurements sent
     */
    int flushBuffer();
    
    /**
     * Get number of buffered measurements
     */
    int getBufferCount();
    
    /**
     * Clear all buffered measurements
     */
    void clearBuffer();
    
    /**
     * Save arbitrary data to a file
     */
    bool writeFile(const char* path, const char* data);
    
    /**
     * Read data from a file
     */
    String readFile(const char* path);
    
    /**
     * Delete a file
     */
    bool deleteFile(const char* path);
    
    /**
     * Check if file exists
     */
    bool exists(const char* path);
    
    /**
     * Get filesystem info
     */
    void getInfo(size_t* totalBytes, size_t* usedBytes);
}

#endif // STORAGE_H

