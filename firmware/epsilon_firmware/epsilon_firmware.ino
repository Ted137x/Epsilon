// Epsilon player for ESP32-C6 super mini + GC9A01 240x240 + MPU6050.
// Libraries: LovyanGFX, Adafruit MPU6050. Replace animations_data.h with the
// output of tools/epsc.mjs. Serial keys: n next, v variant, d debug, m MPU print.

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include "animations_data.h"
#include "epsilon_player.h"

#define TFT_SCLK 1
#define TFT_MOSI 0
#define TFT_CS   19
#define TFT_DC   18
#define TFT_RST  14
#define I2C_SDA  2
#define I2C_SCL  3

// Try 80 MHz once the wiring is proven; a full frame then takes 12 ms instead of 23.
static const uint32_t SPI_HZ = 40000000;

// Flip these to match how the MPU is mounted relative to the display.
static const float AXIS_X = 1.0f, AXIS_Y = 1.0f, AXIS_Z = 1.0f;

// Same values as the emulator's defaults in scr/states.js: tune there, copy here.
static const float SPRING_K = 60.0f;     // pull back to centre
static const float SPRING_C = 5.4f;      // damping, lower wobbles longer
static const float SPRING_GAIN = 1.0f;   // how far motion pushes the image
static const float SPRING_MAX = 0.8f;    // tilt limit, radians

static const int LOOPS_PER_ANIMATION = 3;

class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_GC9A01 panel;
  lgfx::Bus_SPI bus;

 public:
  LGFX() {
    auto busConfig = bus.config();
    busConfig.spi_host = SPI2_HOST;
    busConfig.spi_mode = 0;
    busConfig.freq_write = SPI_HZ;
    busConfig.pin_sclk = TFT_SCLK;
    busConfig.pin_mosi = TFT_MOSI;
    busConfig.pin_miso = -1;
    busConfig.pin_dc = TFT_DC;
    busConfig.dma_channel = SPI_DMA_CH_AUTO;
    bus.config(busConfig);
    panel.setBus(&bus);

    auto panelConfig = panel.config();
    panelConfig.pin_cs = TFT_CS;
    panelConfig.pin_rst = TFT_RST;
    panelConfig.pin_busy = -1;
    panelConfig.panel_width = 240;
    panelConfig.panel_height = 240;
    panelConfig.invert = true;
    panelConfig.rgb_order = false;
    panel.config(panelConfig);
    setPanel(&panel);
  }
};

struct Spring {
  float angle = 0, velocity = 0;

  // The image keeps its place while the body turns (rate), then the spring brings it back.
  void step(float rate, float dt) {
    velocity += (-SPRING_K * angle - SPRING_C * velocity) * dt;
    angle += (velocity - SPRING_GAIN * rate) * dt;
    if (angle > SPRING_MAX || angle < -SPRING_MAX) {
      angle = angle > 0 ? SPRING_MAX : -SPRING_MAX;
      velocity = 0;
    }
  }
  int32_t units() const { return int32_t(angle * 10430.378f); }  // radians to 1/65536 turn
};

using Renderer = eps::Player<true>;

LGFX lcd;
LGFX_Sprite frame(&lcd);
Adafruit_MPU6050 mpu;
Renderer* player = nullptr;

Spring springX, springY, springZ;
float biasX = 0, biasY = 0, biasZ = 0;
bool mpuReady = false;
bool debugMode = false;
bool printMPU = false;

int animation = 0, variant = 0, loopsDone = 0;
uint32_t animationStart = 0, lastMicros = 0;

void message(const char* text) {
  lcd.fillScreen(TFT_BLACK);
  lcd.setTextColor(TFT_WHITE);
  lcd.setTextSize(2);
  lcd.setTextDatum(middle_center);
  lcd.drawString(text, 120, 120);
  Serial.println(text);
}

void halt(const char* text) {
  message(text);
  while (true) delay(1000);
}

// A moved toy at boot would bake the motion into the bias, so wait for stillness.
void calibrateGyro() {
  for (int attempt = 0; attempt < 5; attempt++) {
    float sum[3] = {0, 0, 0}, low = 1e9f, high = -1e9f;
    const int samples = 100;
    for (int i = 0; i < samples; i++) {
      sensors_event_t a, g, t;
      mpu.getEvent(&a, &g, &t);
      sum[0] += g.gyro.x; sum[1] += g.gyro.y; sum[2] += g.gyro.z;
      low = min(low, g.gyro.x); high = max(high, g.gyro.x);
      delay(3);
    }
    if (high - low < 0.08f) {
      biasX = sum[0] / samples; biasY = sum[1] / samples; biasZ = sum[2] / samples;
      return;
    }
  }
  Serial.println("Gyro calibration skipped: the toy kept moving");
}

void startAnimation() {
  if (!player->load(animation, variant)) halt("Animation too big");
  animationStart = millis();
  loopsDone = 0;
  lcd.fillScreen(TFT_BLACK);
  player->invalidate();
}

void nextAnimation() {
  animation = (animation + 1) % player->count();
  variant = 0;
  startAnimation();
}

void handleSerial() {
  while (Serial.available()) {
    switch (Serial.read()) {
      case 'n': nextAnimation(); break;
      case 'v': variant = (variant + 1) % player->variants(); startAnimation(); break;
      case 'd': debugMode = !debugMode; player->invalidate(); break;
      case 'm': printMPU = !printMPU; break;
    }
  }
}

void readMotion(float dt) {
  if (!mpuReady) return;
  sensors_event_t accel, gyro, temp;
  mpu.getEvent(&accel, &gyro, &temp);
  const float gx = (gyro.gyro.x - biasX) * AXIS_X;
  const float gy = (gyro.gyro.y - biasY) * AXIS_Y;
  const float gz = (gyro.gyro.z - biasZ) * AXIS_Z;
  springX.step(gx, dt);
  springY.step(gy, dt);
  springZ.step(gz, dt);
  if (printMPU) Serial.printf("gyro %.2f %.2f %.2f rad/s  temp %.1f C\n", gx, gy, gz, temp.temperature);
}

void drawDebugCube() {
  static const int8_t corners[8][3] = {{-1,-1,-1},{1,-1,-1},{1,1,-1},{-1,1,-1},{-1,-1,1},{1,-1,1},{1,1,1},{-1,1,1}};
  static const uint8_t edges[12][2] = {{0,1},{1,2},{2,3},{3,0},{4,5},{5,6},{6,7},{7,4},{0,4},{1,5},{2,6},{3,7}};
  int32_t x[8], y[8];
  for (int i = 0; i < 8; i++) {
    player->project(corners[i][0] * 400, corners[i][1] * 400, corners[i][2] * 400, x[i], y[i]);
  }
  for (auto& e : edges) frame.drawLine(x[e[0]] >> 4, y[e[0]] >> 4, x[e[1]] >> 4, y[e[1]] >> 4, TFT_WHITE);
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.setRotation(1);
  lcd.fillScreen(TFT_BLACK);

  frame.setColorDepth(16);
  if (!frame.createSprite(240, 240)) halt("Buffer failed!");

  player = new (std::nothrow) Renderer(EPS_PACK, static_cast<uint16_t*>(frame.getBuffer()));
  if (!player) halt("Memory failed!");
  if (!player->valid() || player->count() == 0) halt("No animations");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);
  mpuReady = mpu.begin(0x68, &Wire);
  if (mpuReady) {
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_44_HZ);
    calibrateGyro();
  } else {
    // The animations still work without motion, so carry on.
    message("MPU failed!");
    delay(1500);
  }

  startAnimation();
  lastMicros = micros();
}

void loop() {
  handleSerial();

  const uint32_t now = micros();
  float dt = (now - lastMicros) * 1e-6f;
  lastMicros = now;
  if (dt > 0.05f) dt = 0.05f;
  readMotion(dt);

  uint32_t elapsed = millis() - animationStart;
  const uint32_t duration = player->duration();
  if (elapsed >= duration) {
    loopsDone += elapsed / duration;
    animationStart += (elapsed / duration) * duration;
    elapsed %= duration;
    if (loopsDone >= LOOPS_PER_ANIMATION && player->count() > 1) {
      nextAnimation();
      elapsed = 0;
    }
  }

  if (debugMode) player->invalidate();
  const eps::Rect dirty = player->render(elapsed, springX.units(), springY.units(), springZ.units());
  if (debugMode) {
    drawDebugCube();
    frame.pushSprite(0, 0);
  } else if (!dirty.empty()) {
    lcd.setClipRect(dirty.x0, dirty.y0, dirty.x1 - dirty.x0, dirty.y1 - dirty.y0);
    frame.pushSprite(0, 0);
    lcd.clearClipRect();
  }

  static uint32_t frames = 0, fpsTimer = 0;
  frames++;
  if (debugMode && millis() - fpsTimer >= 1000) {
    Serial.printf("FPS: %lu\n", (unsigned long)frames);
    frames = 0;
    fpsTimer = millis();
  }
}
