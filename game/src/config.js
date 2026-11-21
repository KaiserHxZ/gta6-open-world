// Solmar Bay — every tuning number and colour in one place.
// The city is a 7x7 grid of blocks; roads run between them on a fixed pitch.
// All distances are metres, all speeds metres per second.

const CITY = {
  blocks: 7, // blocks per side
  blockSize: 34, // built-up square inside each block
  roadWidth: 12, // road surface between blocks
  get pitch() { return this.blockSize + this.roadWidth; },
  get half() { return (this.blocks * this.pitch - this.roadWidth) / 2; },
};

const STEP = 1 / 60; // fixed simulation step, 60 updates a second

const PLAYER = {
  radius: 0.55,
  height: 1.8,
  walkSpeed: 5.2,
  runSpeed: 9.0,
  accel: 42,
  jumpSpeed: 7.5,
  gravity: 22,
  maxHealth: 100,
};

const CAR = {
  length: 4.4,
  width: 2.0,
  topSpeed: 38, // ~137 km/h
  accel: 16,
  brake: 30,
  reverseSpeed: 10,
  steer: 0.55, // radians per second at full lock, scaled by speed
  grip: 6.0,
  maxHealth: 100,
};

const TRAFFIC = {
  count: 14,
  speed: 9,
  speedJitter: 3,
};

const PEDS = {
  count: 18,
  walkSpeed: 1.4,
  fleeSpeed: 4.2,
};

const WANTED = {
  maxStars: 5,
  decayDelay: 15, // seconds with no crime before stars start falling
  decayInterval: 8, // seconds per star lost while cooling down
  // how many police units each star level fields: [foot cops, police cars]
  deployment: [[0, 0], [2, 0], [2, 1], [1, 2], [0, 3], [0, 4]],
};

const POLICE = {
  carSpeed: 34,
  footSpeed: 6.4,
  bustTime: 1.6, // seconds a cop must stay touching the player to bust them
  shootRange: 45,
  shootDamage: 6,
  shootInterval: 0.9,
  ramDamage: 12,
};

const COMBAT = {
  pistolDamage: 34,
  pistolRange: 70,
  magazine: 12,
  reloadSeconds: 1.1,
  fireInterval: 0.22,
};

const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Lena Voss',
    brief: 'Welcome to Solmar Bay, Rex. No wheels, no work. Borrow a car — any car — and bring it to the marina marker.',
    reward: 500,
    kind: 'steal-and-drive',
    target: { x: -23, z: 161, label: 'Marina' },
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    giver: 'Lena Voss',
    brief: 'A package is waiting at the docks, east side. Pick it up on foot and drive it to my garage on Coral Row.',
    reward: 800,
    kind: 'fetch',
    pickup: { x: 161, z: -92, label: 'Docks' },
    target: { x: -92, z: -23, label: "Lena's Garage" },
  },
  {
    id: 'heat-check',
    title: 'Heat Check',
    giver: 'Lena Voss',
    brief: 'The Vipers tipped off the cops. You are hot — two stars. Lose them. Lay low, stay out of sight, let it cool.',
    reward: 1000,
    kind: 'lose-heat',
    wantedAtStart: 2,
  },
  {
    id: 'bay-bank-job',
    title: 'Bay Bank Job',
    giver: 'Lena Voss',
    brief: 'Bay Bank, noon rush. Walk in, hold E at the vault door, grab the cash, then get to the safehouse. The whole city will be looking.',
    reward: 2500,
    kind: 'robbery',
    target: { x: 46, z: 23, label: 'Bay Bank' },
    escape: { x: -161, z: -138, label: 'Safehouse' },
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'Lena Voss',
    brief: 'The Vipers stash their take in the container yard. Three guards. Take them down, grab the loot, and bring it home. This is the one, Rex.',
    reward: 5000,
    kind: 'shootout',
    target: { x: 161, z: 92, label: 'Container Yard' },
    escape: { x: -161, z: -138, label: 'Safehouse' },
    guards: 3,
  },
];

const SAVE_KEY = 'solmar-bay.save.v1';

const PALETTE = {
  skyTop: 0x2f6fb4,
  skyBottom: 0xffc98a,
  sun: 0xffe3b3,
  ocean: 0x1e7fa8,
  sand: 0xe8cf9e,
  asphalt: 0x3a3f46,
  asphaltLine: 0xd8d3c0,
  sidewalk: 0x9a938a,
  building: [0xf2c14e, 0xe2725b, 0x7fb069, 0x4e9bb5, 0xf4a259, 0xbc6c9c, 0x8e7cc3, 0xf7ede2, 0x5b8e7d, 0xd95d39],
  glass: 0x9fd8e8,
  palmTrunk: 0x7a5230,
  palmLeaf: 0x3f9e4d,
  carColors: [0xd23b3b, 0x2f6fb4, 0xf2c14e, 0x7fb069, 0xe8e6df, 0x22252a, 0xbc6c9c, 0x4e9bb5],
  policeCar: 0x1c2733,
  policeLightRed: 0xff2222,
  policeLightBlue: 0x2244ff,
  playerShirt: 0x2f6fb4,
  playerPants: 0x2b2f36,
  hudAccent: '#ffc53d',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
