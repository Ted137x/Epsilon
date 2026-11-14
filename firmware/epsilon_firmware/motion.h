// Reads the MPU6050 gyro and turns body rotation into the lagging "head" tilt.
//
// When the toy turns, the image first keeps its place (it looks like it moves the
// other way), then a damped spring pulls it back to the centre. Three springs, one
// per axis. The output angles go straight into Player::render().
#pragma once
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include "config.h"

struct Spring {
  float angle = 0, velocity = 0;

  void step(float rate, float dt) {
    velocity += (-SPRING_K * angle - SPRING_C * velocity) * dt;
    angle += (velocity - SPRING_GAIN * rate) * dt;
    if (angle > SPRING_MAX || angle < -SPRING_MAX) {
      angle = angle > 0 ? SPRING_MAX : -SPRING_MAX;
      velocity = 0;
    }
  }

  // Radians to the player's angle unit (1/65536 of a turn).
  int32_t units() const { return int32_t(angle * 10430.378f); }
};

class Motion {
 public:
  Spring x, y, z;
  bool printRaw = false;  // print gyro readings to the serial monitor

  // Returns false when the sensor does not answer; the toy then plays without motion.
  bool begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(400000);
    ready_ = mpu_.begin(MPU_ADDRESS, &Wire);
    if (!ready_) return false;
    mpu_.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu_.setFilterBandwidth(MPU6050_BAND_44_HZ);
    calibrate();
    return true;
  }

  bool ready() const { return ready_; }

  // Call once per frame with the time since the last call, in seconds.
  void update(float dt) {
    if (!ready_) return;
    sensors_event_t accel, gyro, temp;
    mpu_.getEvent(&accel, &gyro, &temp);
    const float gx = (gyro.gyro.x - bias_[0]) * AXIS_X;
    const float gy = (gyro.gyro.y - bias_[1]) * AXIS_Y;
    const float gz = (gyro.gyro.z - bias_[2]) * AXIS_Z;
    x.step(gx, dt);
    y.step(gy, dt);
    z.step(gz, dt);
    if (printRaw) Serial.printf("gyro %.2f %.2f %.2f rad/s  temp %.1f C\n", gx, gy, gz, temp.temperature);
  }

 private:
  // A gyro reads slightly off zero at rest. Measure that while the toy is still;
  // if it keeps moving, try again a few times rather than learning the motion.
  void calibrate() {
    for (int attempt = 0; attempt < 5; attempt++) {
      float sum[3] = {0, 0, 0}, low = 1e9f, high = -1e9f;
      const int samples = 100;
      for (int i = 0; i < samples; i++) {
        sensors_event_t a, g, t;
        mpu_.getEvent(&a, &g, &t);
        sum[0] += g.gyro.x; sum[1] += g.gyro.y; sum[2] += g.gyro.z;
        low = min(low, g.gyro.x);
        high = max(high, g.gyro.x);
        delay(3);
      }
      if (high - low < 0.08f) {
        for (int i = 0; i < 3; i++) bias_[i] = sum[i] / samples;
        return;
      }
    }
    Serial.println("Gyro calibration skipped: the toy kept moving");
  }

  Adafruit_MPU6050 mpu_;
  float bias_[3] = {0, 0, 0};
  bool ready_ = false;
};
