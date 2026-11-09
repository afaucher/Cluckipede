// Central tuning knobs. Distances are in canonical world units on the active
// layer, whose radius is always R0 (see "Recursive World Scaling" in the GDD).

const R_MIN = 5; // minimum turn radius of the Cluckipede at cruising speed

export const CFG = {
  // --- Egg architecture ---------------------------------------------------
  R0: 100, // canonical radius of the active layer
  LAYER_SCALE: 0.65, // L1 = 0.65x, L2 = 0.65^2 ≈ 0.42x
  VISIBLE_INNER_LAYERS: 2,
  SHELL_THICKNESS: 4,
  ICO_DETAIL: 6, // icosphere subdivisions for the shell mesh

  PLATE_COUNT: 26,
  PLATE_MARGIN: 7, // half-width of the chasm crack between neighbouring plates
  VOID_FRACTION: 0.3, // share of plates that are missing entirely (vast void chasms)
  R_MIN,
  CAUSEWAY_W: 3.4 * R_MIN, // causeways fit high-speed U-turns and full coils
  PENINSULA_TIP_R: 9.5,
  FUNNEL_R: 6,

  // --- Cluckipede movement (Scheme C: Slither & Slingshot) ----------------
  SPEED: 14,
  COIL_SPEED: 6,
  COIL_R_MIN: 2.8,
  BURST_SPEED: 38,
  BURST_TIME: 1.1,
  MAX_CHARGE: 1.4,
  HEAD_RADIUS: 1.8,
  SEG_RADIUS: 1.35,
  SEG_SPACING: 2.3,
  TRAIL_STEP: 0.35,
  START_SEGMENTS: 12,
  BASE_ARMOR: 2.5,
  DEPTH_BUFF: 0.2, // +20% damage / defence per proper Chalaza descent
  VOID_FALL_LOSS: 0.4, // fraction of the tail torn off by a raw void fall
  TAIL_ADRIFT_TIME: 12, // seconds a severed tail writhes before crumbling

  // --- Presentation --------------------------------------------------------
  ANIM_FPS: 12, // stop-motion "twos" cadence for enemies and recoil
  CAM_PITCH_ISO: (45 * Math.PI) / 180,
  CAM_PITCH_TOP: (85 * Math.PI) / 180,
  CAM_DIST: 36,

  // --- Horde ----------------------------------------------------------------
  ENEMY_WAKE_DIST: 90,
  ENEMY_CAP_BASE: 55,
};

export const PALETTE = {
  ivory: 0xefe6cf,
  ivoryShade: 0xcdbf9f,
  dirt: 0x8f6c45,
  crack: 0x5a4330,
  yolk: 0xffb02e,
  yolkDeep: 0xe0791a,
  brine: 0x9dff2e,
  brineDark: 0x4fae16,
  ink: 0x17110b,
  brass: 0xc9a24a,
  gunmetal: 0x3b3d40,
  olive: 0x5f6b32,
  armor: 0x7c6a3c,
  armorDark: 0x4e3c22,
  feather: 0xf6f1e7,
  comb: 0xd81e1e,
  beak: 0xf2b51d,
};
