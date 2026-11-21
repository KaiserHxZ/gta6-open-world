// Solmar Bay — the screenshot scenes behind ?shot=1..4. Each one plays the real
// rules forward from a fresh world for a few seconds with scripted input, so
// the frame is what real play looks like and the same seed gives the same frame.

function stageShot(name, game) {
  const ctx = game.ctx;
  game.resetDynamic();
  game.player.place(0, 0, 0);
  game.time = 0;
  ctx.time = 0;

  const driveForward = (seconds) => {
    Input.scripted = { axes: { x: 0, y: 1 }, keys: {} };
    for (let i = 0; i < seconds / STEP; i += 1) game.stepSim(STEP);
    Input.scripted = null;
  };
  const walkForward = (seconds) => {
    Input.scripted = { axes: { x: 0, y: 1 }, keys: {} };
    for (let i = 0; i < seconds / STEP; i += 1) game.stepSim(STEP);
    Input.scripted = null;
  };
  const idle = (seconds) => {
    Input.scripted = { axes: { x: 0, y: 0 }, keys: {} };
    for (let i = 0; i < seconds / STEP; i += 1) game.stepSim(STEP);
    Input.scripted = null;
  };

  if (name === '2' || name === '3') {
    // Driving down the avenue, in a stolen car, with traffic around.
    const car = game.parkedCars[0];
    car.place(26, -60, -Math.PI / 2);
    car.health = CAR.maxHealth;
    car.dead = false;
    game.player.enterCar(car, null);
    game.player.camYaw = -Math.PI / 2;
    if (name === '3') {
      // A three-star chase: two police cars on the player's tail.
      game.wanted.addCrime(3, 0);
      driveForward(4.5);
      // Pull one police car ahead of the player so the chase reads on camera.
      if (game.police.cars.length > 0) {
        const cop = game.police.cars[0];
        const car = game.player.inCar;
        cop.place(car.x + Math.cos(car.heading) * 20, car.z - Math.sin(car.heading) * 20, car.heading);
        cop.speed = 18;
      }
      game.hud.setObjective('WANTED ★★★ — the Solmar Bay PD is on your tail. Lose them!');
    } else {
      driveForward(3);
      game.hud.setObjective('Solmar Bay — drive the avenue. Traffic, pedestrians and the law all share it.');
    }
    return;
  }

  if (name === '4') {
    // A job in progress: the Bay Bank job, beacon lit, vault ahead.
    game.missions.startMission(3, ctx);
    game.player.place(36, 28, 0.46);
    game.player.camYaw = 0.46;
    idle(1.2);
    return;
  }

  // Shot 1 (and anything else): on foot in the central plaza, city all around.
  // Stand south of the fountain looking across it at the skyline.
  game.player.place(12, 26, Math.PI / 2);
  game.player.camYaw = Math.PI / 2;
  game.hud.setObjective('Solmar Bay — on foot. Steal a car with E, follow the yellow beacon.');
  idle(1.5);
}
