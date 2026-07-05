/**
 * WiFi Manager Module Implementation (Wokwi / ESP32 build)
 *
 * Real firmware (firmware/src/modules/wifi_manager.cpp) uses the WiFiManager
 * library: an unpaired device hosts its own "WaterTank-Setup" access point,
 * you join it from a phone, and it serves a captive portal with a claim-code
 * field. Wokwi doesn't yet simulate a client actually connecting to a
 * simulated ESP softAP (wokwi/wokwi-features#304 is still open), so there's
 * no way to reach that page from a real browser inside the simulator.
 *
 * Workaround used here: join Wokwi's built-in "Wokwi-GUEST" network directly
 * (there's no real router to configure from inside a simulator anyway), and
 * serve the same pairing form from a plain web server on that connection.
 * wokwi.toml forwards it to http://localhost:8080 so you can open it in a
 * real browser. ClaimClient::claim() / Config::save() / the restart-detection
 * and 3-attempt retry logic are byte-for-byte the same as the real firmware -
 * only the transport for *reaching* the form changed.
 */

#include "wifi_manager.h"
#include "config.h"
#include "claim_client.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <LittleFS.h>

// Restart detection file path
#define RESTART_DETECT_FILE "/restart_detect.json"
#define PORTAL_PORT          80
#define PORTAL_TIMEOUT_MS    180000UL   // matches the real firmware's 3-minute portal timeout
#define MAX_CLAIM_ATTEMPTS   3

static unsigned long lastReconnectAttempt = 0;
static WebServer* portalServer = nullptr;
static String pendingClaimCode;
static volatile bool claimSubmitted = false;
static String portalMessage;

static void resetRestartCount() {
    if (LittleFS.begin(true)) {
        File file = LittleFS.open(RESTART_DETECT_FILE, "w");
        if (file) {
            JsonDocument doc;
            doc["restart_count"] = 0;
            doc["last_restart_time"] = millis();
            serializeJson(doc, file);
            file.close();
        }
    }
}

static const char PORTAL_PAGE_TEMPLATE[] =
    "<!DOCTYPE html><html><head><title>AquaMind Setup (Wokwi Sim)</title>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<style>body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#123}"
    "input{width:100%;box-sizing:border-box;padding:10px;font-size:16px;margin:8px 0;"
    "border:1px solid #99b;border-radius:4px}"
    "button{padding:10px 20px;font-size:16px;border:0;border-radius:4px;background:#2469c9;color:#fff}"
    ".msg{background:#eef4ff;border-radius:4px;padding:8px 12px}</style></head><body>"
    "<h2>AquaMind Device Setup</h2>"
    "<p style='color:#567'>Simulated config portal (Wokwi). On real hardware this page is "
    "served from the device's own <b>WaterTank-Setup</b> access point; here it's served over "
    "Wokwi-GUEST and forwarded to your browser via <code>wokwi.toml</code>.</p>"
    "%MESSAGE%"
    "<form method='POST' action='/claim'>"
    "<label>Pairing Code (from the AquaMind app)</label>"
    "<input name='claim_code' maxlength='20' autofocus autocomplete='off'>"
    "<button type='submit'>Pair Device</button>"
    "</form></body></html>";

static void handlePortalRoot() {
    String html = PORTAL_PAGE_TEMPLATE;
    String msg = portalMessage.length() ? ("<p class='msg'><b>" + portalMessage + "</b></p>") : "";
    html.replace("%MESSAGE%", msg);
    portalServer->send(200, "text/html", html);
}

static void handlePortalClaim() {
    pendingClaimCode = portalServer->arg("claim_code");
    claimSubmitted = true;
    portalServer->send(200, "text/html",
        "<html><body><p>Submitting claim code&hellip; watch the Serial monitor, "
        "then reload this page in a few seconds.</p>"
        "<p><a href='/'>Back</a></p></body></html>");
}

namespace WifiManager {
    void init() {
        WiFi.mode(WIFI_STA);
        WiFi.setAutoReconnect(true);
        WiFi.setSleep(false);

        // Load current config values
        Config::load();
    }

    bool shouldEnterConfigPortal() {
        // Ported verbatim from the real firmware's restart-detection strategy:
        // write a marker file with a timestamp on each boot; 3 boots within
        // 5 seconds of each other forces the pairing portal.
        uint32_t restartCount = 0;
        unsigned long currentTime = millis();

        if (LittleFS.begin(true)) {
            if (LittleFS.exists(RESTART_DETECT_FILE)) {
                File file = LittleFS.open(RESTART_DETECT_FILE, "r");
                if (file) {
                    JsonDocument doc;
                    DeserializationError error = deserializeJson(doc, file);
                    if (!error) {
                        restartCount = doc["restart_count"] | 0;
                        unsigned long lastTime = doc["last_restart_time"] | 0;
                        unsigned long timeDiff = (currentTime >= lastTime) ?
                            (currentTime - lastTime) : (currentTime + (ULONG_MAX - lastTime));

                        if (timeDiff <= 5000) {
                            restartCount++;
                            Serial.printf("[WiFi] Recent restart detected, count: %d\n", restartCount);
                        } else {
                            restartCount = 1;
                            Serial.println(F("[WiFi] Restart after delay, resetting count"));
                        }
                    }
                    file.close();
                }
            } else {
                restartCount = 1;
            }

            File file = LittleFS.open(RESTART_DETECT_FILE, "w");
            if (file) {
                JsonDocument doc;
                doc["restart_count"] = restartCount;
                doc["last_restart_time"] = currentTime;
                serializeJson(doc, file);
                file.close();
            }
        }

        if (restartCount >= 3) {
            Serial.println(F("[WiFi] 3 restarts within 5 seconds detected! Entering config portal..."));
            resetRestartCount();
            return true;
        }

        return false;
    }

    // Blocking join of Wokwi-GUEST (or whatever Config::wifiSsid points at).
    static bool connectSta(unsigned long timeoutMs) {
        WiFi.hostname(Config::getOtaHostname().c_str());
        WiFi.begin(Config::wifiSsid.c_str(), Config::wifiPassword.c_str());

        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && (millis() - start < timeoutMs)) {
            delay(250);
            Serial.print('.');
        }
        Serial.println();
        return WiFi.status() == WL_CONNECTED;
    }

    bool connect(bool forceConfigPortal) {
        if (forceConfigPortal || shouldEnterConfigPortal()) {
            Serial.println(F("[WiFi] Starting configuration portal..."));
            startConfigPortal();
            return false; // Will return after portal closes
        }

        Serial.printf("[WiFi] Connecting to %s...\n", Config::wifiSsid.c_str());

        if (!connectSta(WIFI_CONNECT_TIMEOUT_MS)) {
            Serial.println(F("[WiFi] Connection failed, starting config portal..."));
            startConfigPortal();
            return false;
        }

        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());

        resetRestartCount();
        return true;
    }

    bool isConnected() {
        return WiFi.status() == WL_CONNECTED;
    }

    void reconnect() {
        unsigned long now = millis();

        if (now - lastReconnectAttempt < WIFI_RECONNECT_INTERVAL_MS) {
            return;
        }
        lastReconnectAttempt = now;

        Serial.println(F("[WiFi] Attempting reconnect..."));
        WiFi.disconnect();
        delay(100);

        if (Config::wifiSsid.length() > 0) {
            WiFi.begin(Config::wifiSsid.c_str(), Config::wifiPassword.c_str());
        }
        // Non-blocking: just start the connection attempt, loop checks status later.
    }

    void startConfigPortal() {
        const int MAX_ATTEMPTS = MAX_CLAIM_ATTEMPTS;
        String hardwareId = ClaimClient::getHardwareId();

        Serial.println(F("[WiFi] (Wokwi sim) Joining Wokwi-GUEST to host the pairing page..."));
        if (!connectSta(20000)) {
            Serial.println(F("[WiFi] Could not join Wokwi-GUEST - will retry the portal on next boot"));
            delay(2000);
            ESP.restart();
        }

        Serial.printf("[WiFi] Pairing page: http://%s/  (forwarded to http://localhost:8080/ via wokwi.toml)\n",
            WiFi.localIP().toString().c_str());

        if (!portalServer) portalServer = new WebServer(PORTAL_PORT);
        portalServer->on("/", HTTP_GET, handlePortalRoot);
        portalServer->on("/claim", HTTP_POST, handlePortalClaim);
        portalServer->begin();

        unsigned long portalStart = millis();
        int attempt = 0;
        bool claimedNow = false;
        String newDeviceToken, newDeviceId;
        portalMessage = "";

        while (millis() - portalStart < PORTAL_TIMEOUT_MS) {
            portalServer->handleClient();

            if (claimSubmitted) {
                claimSubmitted = false;
                attempt++;
                claimedNow = ClaimClient::claim(pendingClaimCode, hardwareId, newDeviceToken, newDeviceId);

                if (claimedNow) {
                    portalMessage = "Paired! Restarting the device...";
                    break;
                }

                Serial.printf("[WiFi] Pairing failed (attempt %d/%d)\n", attempt, MAX_ATTEMPTS);
                if (attempt >= MAX_ATTEMPTS) {
                    portalMessage = "Pairing failed after " + String(MAX_ATTEMPTS) + " attempts. Restarting...";
                    break;
                }
                portalMessage = "Pairing failed (attempt " + String(attempt) + "/" + String(MAX_ATTEMPTS) + "). Try again.";
            }

            delay(10);
        }

        portalServer->stop();

        if (claimedNow) {
            Config::deviceId = newDeviceId;
            Config::deviceToken = newDeviceToken;
            Config::claimed = true;
        } else {
            Serial.println(F("[WiFi] Config portal timed out/exhausted without pairing"));
        }

        // Save to flash (claimed values if pairing succeeded, otherwise
        // unclaimed - the device will re-enter the portal on next boot).
        Config::save();
        resetRestartCount();

        Serial.println(F("[WiFi] Config saved! Restarting..."));
        Serial.println();
        delay(2000);
        ESP.restart();
    }

    int getRssi() {
        if (isConnected()) {
            return WiFi.RSSI();
        }
        return 0;
    }

    String getIpAddress() {
        if (isConnected()) {
            return WiFi.localIP().toString();
        }
        return "0.0.0.0";
    }

    String getMacAddress() {
        return WiFi.macAddress();
    }
}
