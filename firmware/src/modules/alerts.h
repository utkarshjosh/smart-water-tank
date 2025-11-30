/**
 * ============================================================================
 * Alerts Module
 * ============================================================================
 * Handles local audio alerts and LED indicators
 */

#ifndef ALERTS_H
#define ALERTS_H

#include <Arduino.h>

namespace Alerts {
    /**
     * Initialize alert system (speaker, LED)
     */
    void init();
    
    /**
     * Play startup sound
     */
    void playStartupSound();
    
    /**
     * Trigger tank full alert
     */
    void triggerTankFull();
    
    /**
     * Trigger tank low alert
     */
    void triggerTankLow();
    
    /**
     * Trigger battery low alert
     */
    void triggerBatteryLow();
    
    /**
     * Trigger generic alert
     * @param pattern Alert pattern (1=short, 2=long, 3=urgent)
     */
    void trigger(int pattern);
    
    /**
     * Stop any active alert
     */
    void stop();
    
    /**
     * Check if currently in quiet hours
     */
    bool isQuietHours();
    
    /**
     * Play a tone
     * @param frequency Frequency in Hz
     * @param duration Duration in ms
     */
    void playTone(int frequency, int duration);
    
    /**
     * Blink status LED
     * @param count Number of blinks
     * @param onTime On duration in ms
     * @param offTime Off duration in ms
     */
    void blinkLed(int count, int onTime = 100, int offTime = 100);
}

#endif // ALERTS_H

