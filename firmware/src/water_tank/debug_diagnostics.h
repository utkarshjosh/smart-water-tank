/** Focused timing diagnostics; compiled out of production builds. */
#ifndef DEBUG_DIAGNOSTICS_H
#define DEBUG_DIAGNOSTICS_H

#include <Arduino.h>
#include <ESP8266WiFi.h>

namespace DebugDiagnostics {
    class Scope {
    public:
#if defined(DEBUG) && DEBUG
        explicit Scope(const char* name, bool announce = false)
            : name_(name), started_(millis()), announce_(announce) {
            if (announce_) Serial.printf("[Debug] begin %s t=%lu\n", name_, started_);
        }
        ~Scope() {
            const unsigned long elapsed = millis() - started_;
            if (announce_ || elapsed >= 100) {
                Serial.printf("[Debug] end %s t=%lu elapsed=%lums heap=%u\n",
                    name_, millis(), elapsed, ESP.getFreeHeap());
            }
        }
    private:
        const char* name_;
        unsigned long started_;
        bool announce_;
#else
        explicit Scope(const char*, bool = false) {}
#endif
    };

    inline void loopTick() {
#if defined(DEBUG) && DEBUG
        static unsigned long previous = 0;
        static unsigned long lastLog = 0;
        static unsigned long maxGap = 0;
        static unsigned long passes = 0;
        const unsigned long now = millis();
        if (previous != 0) {
            const unsigned long gap = now - previous;
            if (gap > maxGap) maxGap = gap;
            if (gap >= 250) Serial.printf("[Debug] loop polling gap=%lums t=%lu\n", gap, now);
        }
        previous = now;
        ++passes;
        if (now - lastLog >= 10000) {
            Serial.printf("[Debug] alive t=%lu loops=%lu maxGap=%lums heap=%u largest=%u frag=%u%% wifi=%d\n",
                now, passes, maxGap, ESP.getFreeHeap(), ESP.getMaxFreeBlockSize(),
                ESP.getHeapFragmentation(), static_cast<int>(WiFi.status()));
            lastLog = now;
            maxGap = 0;
            passes = 0;
        }
#endif
    }
}
#endif
