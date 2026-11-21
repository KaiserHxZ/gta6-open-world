// Solmar Bay — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: start, playing, paused, ended (busted / wasted / story complete).
//
// ?shot=1..4 (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.

const MAX_FRAME = 0.25; // the longest frame the loop catches up on

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);

const world = new CityWorld(scene, seed);
const audio = new SolmarAudio();
const effects = new Effects(scene);
const player = new Player(scene);
const traffic = new TrafficManager(scene, world, seed + 101);
const peds = new PedestrianManager(scene, world, seed + 202);
const wanted = new WantedSystem();
const police = new PoliceManager(scene, world, seed + 303);
const missions = new MissionManager(scene, world, seed + 404);
const hud = new SolmarHud(audio);

// Parked cars the player can steal, left around the city.
const parkedCars = [];
{
  const rand = mulberry32(seed + 505);
  for (let i = 0; i < 6; i += 1) {
    const spot = world.randomParkingSpot();
    const car = new DriveCar(scene, randomPick(rand, PALETTE.carColors), 'civilian');
    car.place(spot.x, spot.z, randomPick(rand, [0, Math.PI / 2, Math.PI, -Math.PI / 2]));
    parkedCars.push(car);
  }
}

const game = {
  scene,
  camera,
  renderer,
  world,
  player,
  traffic,
  peds,
  wanted,
  police,
  missions,
  hud,
  effects,
  audio,
  parkedCars,
  time: 0,
  screen: 'start',
  allCars: [],
};

const ctx = {
  world,
  player,
  traffic,
  peds,
  wanted,
  police,
  missions,
  hud,
  effects,
  audio,
  camera,
  parkedCars,
  allCars: [],
  time: 0,
  onBusted: () => bustPlayer(),
};

function refreshAllCars() {
  ctx.allCars = traffic.cars.map((t) => t.car).concat(parkedCars, police.cars);
  game.allCars = ctx.allCars;
}

function resetDynamic() {
  wanted.clear();
  for (const cop of police.footCops) cop.remove(scene);
  police.footCops.length = 0;
  for (const car of police.cars) scene.remove(car.mesh);
  police.cars.length = 0;
  for (const t of traffic.cars) {
    const spot = world.randomRoadPoint();
    t.car.place(spot.x, spot.z, spot.heading);
    t.car.speed = t.cruise;
    t.car.health = CAR.maxHealth;
    t.car.dead = false;
  }
  for (const ped of peds.peds) {
    const spot = world.randomSidewalkPoint();
    ped.x = spot.x;
    ped.z = spot.z;
    ped.health = 100;
    ped.down = false;
    ped.fleeing = false;
    ped.mesh.rotation.z = 0;
    ped.mesh.position.set(spot.x, 0, spot.z);
    ped._pickTarget();
  }
  for (const car of parkedCars) {
    car.health = CAR.maxHealth;
    car.dead = false;
    car.speed = 0;
  }
  missions.active = false;
  missions.phase = 0;
  missions.holdProgress = 0;
  missions._clearGuards();
  world.hideBeacon();
  player.health = PLAYER.maxHealth;
  player.ammo = COMBAT.magazine;
  player.reloading = 0;
  if (player.inCar) {
    player.inCar = null;
    player.mesh.visible = true;
  }
  game.time = 0;
  ctx.time = 0;
}

function startPlaying() {
  hud.hideStart();
  hud.hideEnd();
  game.screen = 'playing';
}

function newGame() {
  clearSave();
  resetDynamic();
  player.cash = 0;
  player.place(0, 26, 0);
  missions.missionIndex = 0;
  missions.startMission(0, ctx);
  startPlaying();
}

function continueGame() {
  const save = loadSave();
  resetDynamic();
  if (save) {
    player.cash = save.cash || 0;
    player.health = save.health || PLAYER.maxHealth;
    player.place(save.playerX || 0, save.playerZ || 0, 0);
    missions.startMission(Math.min(save.missionIndex || 0, MISSIONS.length - 1), ctx);
  } else {
    newGame();
    return;
  }
  startPlaying();
}

function bustPlayer() {
  if (game.screen !== 'playing') return;
  player.cash = Math.max(0, player.cash - 150);
  wanted.clear();
  if (player.inCar) {
    player.inCar = null;
    player.mesh.visible = true;
  }
  player.place(-161, -138, 0);
  player.health = PLAYER.maxHealth;
  missions.restartCurrent(ctx);
  saveGame({ cash: player.cash, missionIndex: missions.missionIndex, playerX: player.x, playerZ: player.z, health: player.health });
  audio.busted();
  game.screen = 'ended';
  hud.showEnd('busted');
}

function wastePlayer() {
  if (game.screen !== 'playing') return;
  missions.restartCurrent(ctx);
  saveGame({ cash: player.cash, missionIndex: missions.missionIndex, playerX: player.x, playerZ: player.z, health: player.health });
  audio.busted();
  game.screen = 'ended';
  hud.showEnd('wasted');
}

let lastStealAt = -99;
let lastSaveAt = -99;

// One fixed step of the whole simulation.
function stepSim(dt) {
  game.time += dt;
  ctx.time = game.time;
  const time = game.time;

  player.step(dt, ctx, time);

  // Stealing a car, and running people over, are crimes.
  if (player.inCar) {
    for (const ped of peds.peds) {
      if (ped.down) continue;
      if (distance2D(player.inCar.x, player.inCar.z, ped.x, ped.z) < 1.9) {
        ped.damage(100);
        wanted.addCrime(1, time);
        audio.crash();
        player.addShake(0.3);
        peds.scareAll(player.x, player.z, 25);
        hud.toast('You ran someone over!');
      }
    }
  }

  // The player cannot walk through cars.
  if (!player.inCar) {
    for (const car of ctx.allCars) {
      const d = distance2D(player.x, player.z, car.x, car.z);
      if (d < 2.4 && d > 0.01) {
        const push = 2.4 - d;
        player.x += ((player.x - car.x) / d) * push;
        player.z += ((player.z - car.z) / d) * push;
      }
    }
  }

  traffic.update(dt, player.inCar, police.cars);
  const threatRadius = player.inCar ? 10 : wanted.stars > 0 ? 16 : 0;
  peds.update(dt, threatRadius > 0 ? player.x : null, threatRadius > 0 ? player.z : null, threatRadius);
  police.update(dt, ctx, time);
  wanted.update(dt, time, police.nearestDistanceTo(player.x, player.z));
  missions.update(dt, ctx);
  world.update(dt, time);
  effects.update(dt);

  // Smoking wrecks.
  for (const car of refreshAllCarsList()) {
    if (!car.dead && car.health < 40 && Math.random() < dt * 8) {
      effects.smoke(new THREE.Vector3(car.x, 1.2, car.z));
    }
  }

  if (player.health <= 0 && game.screen === 'playing') wastePlayer();

  // Autosave every ten seconds of play.
  if (time - lastSaveAt > 10) {
    lastSaveAt = time;
    saveGame({ cash: player.cash, missionIndex: missions.missionIndex, playerX: player.x, playerZ: player.z, health: player.health });
  }
}

function refreshAllCarsList() {
  refreshAllCars();
  return ctx.allCars;
}

// --- one-shot keys, queued by Input so a press is never lost ---
function handleOneShots() {
  if (Input.takePressed('KeyE') && game.screen === 'playing') {
    if (!player.inCar) {
      const car = player.nearbyCar(traffic, parkedCars, 4);
      if (car) {
        player.enterCar(car, audio);
        if (game.time - lastStealAt > 10) {
          lastStealAt = game.time;
          wanted.addCrime(1, game.time);
          hud.toast('Car stolen — the law noticed.');
        }
      }
    } else {
      player.exitCar(world, audio);
    }
  }

  if (Input.takePressed('Escape') || Input.takePressed('KeyP')) {
    if (game.screen === 'playing') {
      game.screen = 'paused';
      hud.showPause(true);
    } else if (game.screen === 'paused') {
      game.screen = 'playing';
      hud.showPause(false);
    }
  }

  if (Input.takePressed('KeyR') && game.screen === 'playing' && !player.inCar && player.ammo < COMBAT.magazine && player.reloading <= 0) {
    player.reloading = COMBAT.reloadSeconds;
  }

  if (Input.takePressed('KeyM')) {
    audio.setMuted(!audio.muted);
    hud.toast(audio.muted ? 'Sound off' : 'Sound on');
  }

  if (Input.takeClicked() && game.screen === 'playing' && !player.inCar) {
    refreshAllCars();
    const result = player.fire(ctx);
    if (result && result.kind === 'ped') {
      wanted.addCrime(1, game.time);
      peds.scareAll(player.x, player.z, 25);
    } else if (result && (result.kind === 'cop' || result.kind === 'guard')) {
      wanted.addCrime(2, game.time);
      peds.scareAll(player.x, player.z, 30);
    } else if (result && result.kind === 'car' && result.ref && result.ref.kind === 'police') {
      wanted.addCrime(1, game.time);
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (game.screen === 'playing') {
    handleOneShots();
    const dtMs = Math.min(now - frame._last, MAX_FRAME * 1000);
    frame._last = now;
    let acc = dtMs / 1000;
    while (acc >= STEP) {
      stepSim(STEP);
      acc -= STEP;
      if (game.screen !== 'playing') break;
    }
  } else {
    frame._last = now;
    handleOneShots();
  }
  if (game.screen === 'playing' || game.screen === 'paused') {
    player.updateCamera(camera, 1 / 60, game.time);
    hud.update(ctx);
  }
  renderer.render(scene, camera);
}
frame._last = performance.now();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'playing') {
    game.screen = 'paused';
    hud.showPause(true);
  }
});

// Buttons.
document.getElementById('btn-new').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  newGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  continueGame();
});
document.getElementById('btn-resume').addEventListener('click', () => {
  audio.click();
  game.screen = 'playing';
  hud.showPause(false);
});
document.getElementById('btn-restart-job').addEventListener('click', () => {
  audio.click();
  missions.restartCurrent(ctx);
  game.screen = 'playing';
  hud.showPause(false);
});
document.getElementById('btn-retry').addEventListener('click', () => {
  audio.click();
  player.health = PLAYER.maxHealth;
  player.place(-161, -138, 0);
  game.screen = 'playing';
  hud.hideEnd();
});
document.getElementById('btn-mute').addEventListener('click', (e) => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  e.target.textContent = audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
});

Input.init(canvas);
refreshAllCars();
game.resetDynamic = resetDynamic;
game.stepSim = stepSim;
game.ctx = ctx;

if (shotParam) {
  // Screenshot mode: stage the scene, paint twice, signal readiness.
  game.screen = 'playing';
  hud.hideStart();
  stageShot(shotParam, game);
  player.updateCamera(camera, 1 / 60, game.time);
  hud.update(ctx);
  renderer.render(scene, camera);
  let painted = 0;
  (function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  const save = loadSave();
  player.place(0, 26, 0);
  hud.showStart(!!save);
  hud.setObjective('Press Start to play Solmar Bay.');
  requestAnimationFrame(frame);
}
