// The GC9A01 display driver (LovyanGFX) and a 240x240 frame buffer in RAM.
//
// The player draws into `frame`, then push() sends only the area that changed,
// which is usually much smaller than the full 115 KB frame.
#pragma once
#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include "config.h"
#include "epsilon_player.h"

class Panel : public lgfx::LGFX_Device {
  lgfx::Panel_GC9A01 panel_;
  lgfx::Bus_SPI bus_;

 public:
  Panel() {
    auto bus = bus_.config();
    bus.spi_host = SPI2_HOST;
    bus.spi_mode = 0;
    bus.freq_write = SPI_HZ;
    bus.pin_sclk = PIN_TFT_SCLK;
    bus.pin_mosi = PIN_TFT_MOSI;
    bus.pin_miso = -1;
    bus.pin_dc = PIN_TFT_DC;
    bus.dma_channel = SPI_DMA_CH_AUTO;
    bus_.config(bus);
    panel_.setBus(&bus_);

    auto cfg = panel_.config();
    cfg.pin_cs = PIN_TFT_CS;
    cfg.pin_rst = PIN_TFT_RST;
    cfg.pin_busy = -1;
    cfg.panel_width = 240;
    cfg.panel_height = 240;
    cfg.invert = true;
    cfg.rgb_order = false;
    panel_.config(cfg);
    setPanel(&panel_);
  }
};

class Display {
 public:
  Panel lcd;
  LGFX_Sprite frame{&lcd};

  // Returns false if the frame buffer could not be allocated.
  bool begin() {
    lcd.init();
    lcd.setRotation(DISPLAY_ROTATION);
    lcd.fillScreen(TFT_BLACK);
    frame.setColorDepth(16);
    return frame.createSprite(240, 240) != nullptr;
  }

  // RGB565, byte-swapped the way LovyanGFX sprites store it (use eps::Player<true>).
  uint16_t* buffer() { return static_cast<uint16_t*>(frame.getBuffer()); }

  // Sends one area of the frame to the screen.
  void push(const eps::Rect& r) {
    if (r.empty()) return;
    lcd.setClipRect(r.x0, r.y0, r.width(), r.height());
    frame.pushSprite(0, 0);
    lcd.clearClipRect();
  }

  void pushAll() { frame.pushSprite(0, 0); }

  // Centred text straight on the screen, for errors and status.
  void message(const char* text) {
    lcd.fillScreen(TFT_BLACK);
    lcd.setTextColor(TFT_WHITE);
    lcd.setTextSize(2);
    lcd.setTextDatum(middle_center);
    lcd.drawString(text, 120, 120);
  }
};
