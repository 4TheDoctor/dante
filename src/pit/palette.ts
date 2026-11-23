/** Colours of the high-resolution pit. Seven-step ramps, dark to light, so light can move along them. */
export const LEVELS = 7

const RAMPS = [
  ['rock', '080504 110a08 1b110d 271913 35231a 463023 5a4030'],
  ['earth', '0f0806 1c100b 2d1b12 432a1b 5d3e28 7a563a 997453'],
  ['blood', '0f0404 200807 380d0b 561410 791f16 a0301f c54a2c'],
  ['fire', '150403 2b0904 4a1006 711c0a 9d3310 c9571b ee8a38'],
  ['ice', '040a13 091829 112c48 1c4870 33739d 66a9cf b4dff2'],
  ['stone', '0d0908 1a1310 2b211b 41332a 5b4a3d 7a6656 9c8875'],
  ['wood', '030202 080605 0f0a08 181009 241811 33241a 463426'],
  ['gold', '241604 432b0a 6b4813 99701f cb9c3c efc766 fff0b4'],
  ['night', '02040c 050918 0a1128 111c3e 1b2c59 2a4179 41609f'],
  ['dawn', '1f1430 3a2046 5c2e54 853f5c b25a5e de8864 ffc382'],
  ['sea', '03060e 060e1d 0b1930 13294a 1f406b 336092 6b9ac4'],
  ['bog', '060a05 0c140a 152212 20341b 304c27 466a38 648c50'],
] as const

export type RampName = (typeof RAMPS)[number][0]

const FLAMES = [
  // Fire, then the pale lights of Limbo, then the cold of Cocytus. Coolest to hottest.
  '2e0703 5c1005 8f1d08 c2330c e95817 f98628 fdb545 fedd7c fff6d2',
  '0a1018 131d2a 21303f 364b5c 52697a 73899a 9aafbc c6d5dc f0f6f8',
  '04101c 0a2236 123d5c 1e5f88 3487b4 5bb0d6 8fd2ec c4ebf8 f4fdff',
] as const

const SPOTS = {
  void: '040202',
  outline: '0a0504',
  robe: 'c8372a',
  robeDark: '86221a',
  robeLight: 'e9614a',
  coif: 'f3e7d3',
  skin: 'e8be90',
  skinShade: 'b98557',
  laurel: '8fb65a',
  laurelDark: '587a34',
  laurelGold: 'f2cb7a',
  toga: 'efe6d6',
  togaShade: 'b7a993',
  togaDark: '7f7362',
  hair: 'a8a29a',
  boot: '3a2418',
  soul: 'cfd6dc',
  soulDim: '7f8b96',
  eye: 'ff4a2a',
  eyeYellow: 'f5d33a',
  star: 'ffffff',
  starDim: '8ea2d6',
  starWarm: 'ffe2b0',
  window: 'ffd27a',
  blood: 'b01810',
  bloodLight: 'e8402a',
  rain: '6d6a78',
  snow: 'eef8fc',
  coin: 'ffd95a',
} as const

export type SpotName = keyof typeof SPOTS

const rgb: number[] = []
const push = (hex: string): number => {
  rgb.push(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16))
  return rgb.length / 3 - 1
}

/** First palette index of each ramp. */
export const RAMP = Object.fromEntries(
  RAMPS.map(([name, colors]) => [name, colors.split(' ').map(push)[0]!]),
) as Record<RampName, number>

/** Palette indexes of each flame, coolest to hottest. */
export const FLAME: readonly (readonly number[])[] = FLAMES.map(colors => colors.split(' ').map(push))

export const SPOT = Object.fromEntries(Object.entries(SPOTS).map(([name, hex]) => [name, push(hex)])) as Record<SpotName, number>

/** Every colour, as bytes: what a PNG's PLTE chunk holds. */
export const PLTE = Uint8Array.from(rgb)
