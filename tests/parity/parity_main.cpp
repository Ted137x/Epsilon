// Prints one FNV-1a hash per animation and variant; tests/parity.test.mjs compares
// them with the JS player. Same pack, same schedule, so a match means equal pixels.
#include <stdio.h>
#include "animations_data.h"
#include "../../firmware/epsilon_firmware/epsilon_player.h"

static uint16_t fb[eps::SIZE * eps::SIZE];
static eps::Player<false> player(EPS_PACK, fb);

int main() {
  for (int a = 0; a < player.count(); a++) {
    player.load(a, 0);
    const int variants = player.variants();
    for (int v = 0; v < variants; v++) {
      player.load(a, v);
      uint32_t h = 2166136261u;
      for (uint32_t t = 0; t < player.duration(); t += 7) {
        player.render(t, int32_t(t * 13), -int32_t(t * 9), int32_t(t * 3));
        for (int i = 0; i < eps::SIZE * eps::SIZE; i++) h = (h ^ fb[i]) * 16777619u;
      }
      printf("%d %d %u\n", a, v, h);
    }
  }
  return 0;
}
