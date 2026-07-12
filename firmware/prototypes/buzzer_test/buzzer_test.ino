#define BUZZER_PIN 14 //D5   //  GPIO14

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
}

void beep(int freq, int durationMs) {
  analogWriteFreq(freq);
  analogWrite(BUZZER_PIN, 512);  // 50% duty, range 0-1023
  delay(durationMs);
  analogWrite(BUZZER_PIN, 0);
}

void loop() {
  // beep(2500, 100);  // 2.5 kHz beep for 100 ms

  shortBeep();
  delay(3000);
  doubleBeep();
   delay(3000);
   errorBeep();
    delay(3000);

}
void shortBeep() {
  beep(2500, 80);
}

void doubleBeep() {
  beep(2500, 80);
  delay(80);
  beep(2500, 80);
}

void errorBeep() {
  beep(1200, 300);
  delay(100);
  beep(800, 300);
}
