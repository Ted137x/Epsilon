// Everything you are likely to change on the hardware side lives here.
#pragma once
#include <stdint.h>

// ---------------------------------------------------------------- wiring
// GC9A01 240x240 round display (SPI)
#define PIN_TFT_SCLK 1
#define PIN_TFT_MOSI 0
#define PIN_TFT_CS   19
#define PIN_TFT_DC   18
#define PIN_TFT_RST  14

// MPU6050 (I2C)
#define PIN_I2C_SDA 2
#define PIN_I2C_SCL 3
#define MPU_ADDRESS 0x68

// ---------------------------------------------------------------- display
// 40 MHz is safe on jumper wires. 80 MHz halves the time to send a full frame
// (23 ms -> 12 ms) once the wiring is short and solid.
static const uint32_t SPI_HZ = 40000000;
static const uint8_t DISPLAY_ROTATION = 1;  // 0..3, turns the image in 90 degree steps

// ---------------------------------------------------------------- motion
// Flip a sign if the image moves the wrong way when you tilt the toy.
static const float AXIS_X = 1.0f;  // gyro X drives the up/down tilt
static const float AXIS_Y = 1.0f;  // gyro Y drives the left/right tilt
static const float AXIS_Z = 1.0f;  // gyro Z drives the in-plane spin

// The "head follows the body" spring. Same meaning as the emulator's sliders.
static const float SPRING_K = 60.0f;     // stiffness: how hard it pulls back to centre
static const float SPRING_C = 5.4f;      // damping: lower wobbles longer
static const float SPRING_GAIN = 1.0f;   // strength: how far motion pushes the image
static const float SPRING_MAX = 0.8f;    // tilt limit in radians (0.8 rad = 46 degrees)

// ---------------------------------------------------------------- playback
static const int LOOPS_PER_ANIMATION = 3;  // then move on to the next animation
static const bool START_IN_DEBUG = false;  // debug cube + FPS on the serial monitor
