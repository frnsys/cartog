const GRID_HEIGHT = 400;
const GRID_WIDTH = 400;
const GRID_CELL_SIZE = 40;
const GRID_EMPTY = [205, 244, 222];

const RESOURCES = {
  cash: '💵',
  water: '🚰'
};

const STATE = {
  resources: {
    cash: 100,
    water: 100
  },
  waterCollectors: 0
};

const IMAGES = [
  'assets/wheat_0.jpg',
  'assets/wheat_1.jpg',
  'assets/wheat_2.jpg',
  'assets/water_collector.jpg'
];


class Wheat extends Thing {
  init() {
    this.yield = 3;
  }

  get cost() {
    return {
      'cash': 100,
      'water': 50
    }
  }

  get image() {
    if (this.sick) {
      return 'wheat_2.jpg';
    } else if (this.level == 0) {
      return 'wheat_0.jpg';
    } else if (this.level == 1) {
      return 'wheat_1.jpg';
    }
  }

  get info() {
    if (this.sick) {
      return 'This wheat is not good you better get rid of it'
    } else {
      return 'This is some wheat';
    }
  }

  update(neighbors) {
    if (frameCount % 120 != 0) {
      return
    }
    let spoil_probability = 0.01;
    neighbors.forEach((n) => {
      if (n instanceof Wheat) {
        if (n.sick) {
          spoil_probability += 0.02;
        }
      }
    });
    if (Math.random() < spoil_probability) {
      this.sick = true;
    }

    // wheat takes water
    if (STATE.resources.water < 2) {
      this.yield--;
      if (this.yield <= 0) {
        this.destroy();
        showMessage('Some wheat died from lack of water', color=[255,0,0])
      }
    } else {
      STATE.resources.water -= 2;
    }
  }

  onClick() {
    if (this.sick) {
      this.destroy();
    } else {
      STATE.resources.cash += 100;
      this.yield--;
      showMessage('Harvested!');
      if (this.yield <= 0) {
        this.destroy();
      }
    }
  }
}


class WaterCollector extends Thing {
  get cost() {
    return {
      'cash': 50
    }
  }

  get info() {
    return 'What a handy device (+2 water/sec)';
  }

  get image() {
    return 'water_collector.jpg';
  }

  onClick() {
    this.destroy();
    STATE.waterCollectors -= 1;
  }
}

var wheat;
function init() {
  wheat = new Wheat();
  GAME.grid.place(wheat, 0, 0);
  defineHarvester('water', () => {
    return 1 + STATE.waterCollectors * 2;
  }, 1000);

  let menu = new Menu('Farm Mall', [
    new Button('Buy Water Collector', tryBuy(WaterCollector, () => {
      STATE.waterCollectors += 1;
      showMessage('Bought water collector!');
    })),
    new Button('Buy Wheat', tryBuy(Wheat))
  ]);
}

function main() {
  background(240,240,240);
}
