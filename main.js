'use strict';

const IMAGES = {
	wheat: 'https://i.imgur.com/ythxt2c.jpg',
	sparse_wheat: 'https://i.imgur.com/lCIe5lH.jpg',
	aqueduct: 'http://i.imgur.com/WtI3uue.jpg',
	sick_wolf: 'https://i.imgur.com/kpuLqAv.jpg',
  pig: 'https://kids.nationalgeographic.com/content/dam/kids/photos/animals/Mammals/H-P/pig-young-closeup.ngsversion.1412640764383.jpg',
	wolf: 'https://static01.nyt.com/images/2017/10/17/science/17SCI-WOLVES7/17SCI-WOLVES7-superJumbo.jpg'
};

const GRID_HEIGHT = 400;
const GRID_WIDTH = 400;
const GRID_CELL_SIZE = 80;
const GRID_EMPTY = [247, 245, 165];

const RESOURCES = {
	water: '🌊',
	nitrogen: '💩',
	money: '💵'
}

const STATE = {
	resources: {
		water: 100,
		nitrogen: 50,
		money: 0
	},
	cashPerCrop: 100,
	investment: 0,
	aqueducts: 0
}


class Wolf extends Item {
	init() {
		this.sick = false;
	}

  // no cost, can't buy wolves
	get cost() {
		return {}
	}

	get info() {
		return 'grrrr....'
	}

	get image() {
		if (this.sick) {
			return 'sick_wolf'
		} else {
			return 'wolf'
		}
	}

	update(neighbors) {
		var self = this;
		neighbors.forEach(function(neighbor) {
			if (neighbor.item instanceof Aqueduct) {
        // with 5% chance, wolves get sick
        // and die in 5 seconds
				if (Math.random() < 0.05) {
					self.sick = true;
					schedule(5000, function() {
						self.destroy();
					})
				}
			}
		})
	}
}


class Pig extends Item {
	get cost() {
		return {
			money: 5
		}
	}

	get info() {
		return 'piggy'
	}

	get image() {
		return 'pig'
	}

	update(neighbors) {
    // pigs expand to adjacent wheat plots
    // with 1% probability
		neighbors.forEach(function(neighbor) {
			if (neighbor.item instanceof Wheat) {
				if (Math.random() < 0.01) {
					var pig = new Pig();
					GAME.grid.place(pig, neighbor.x, neighbor.y);
				}
			}
		})

    // wolves spawn on pigs with
    // a 0.5% probability
		if (Math.random() < 0.005) {
			var wolf = new Wolf();
			this.destroy();
			GAME.grid.place(wolf, this.x, this.y);
		}
	}
}


class Aqueduct extends Item {
	get cost() {
		return {
			money: 25
		}
	}

	get info() {
		return 'Cool aqueduct'
	}

	get image() {
		return 'aqueduct'
	}

  onPlace() {
    STATE.aqueducts++;
  }
}


class Wheat extends Item {
	init() {
		this.quantity = 3;
	}

	get cost() {
		return {
			water: 20,
			nitrogen: 5
		}
	}

	get info() {
		if (this.quantity < 2) {
			return 'This wheat is almost gone!'
		} else if (this.quantity < 3) {
			return 'This wheat is running low'
		} else {
			return 'This is some nice wheat'
		}
	}

	get image() {
		if (this.quantity < 3) {
			return 'sparse_wheat'
		} else {
			return 'wheat'
		}
	}

	onClick() {
		this.quantity -= 1;
		STATE.resources.money += STATE.cashPerCrop;
		if (this.quantity <= 0) {
			this.destroy();
			showMessage('You lost some wheat!')
			showMessage('that sucks')
		}
	}
}


var tractorBonus = new Bonus(
  'Powerful Tractor',
  'A more powerful tractor', {
		money: 50
	}, function() {
		STATE.cashPerCrop += 100;
	});

var investmentBonus = new Bonus(
  'Roth IRA',
  'Make your money work for you', {
		money: 100
	}, function() {
		STATE.investment = 0.1;
	});


function init() {
	var wheat = new Wheat();
	GAME.grid.place(wheat, 0, 0);

	var menu = new Menu('Farm Mall', [
		new BuyButton('Buy wheat', Wheat),
		new BuyButton('Buy pig', Pig),
		new BuyButton('Buy aqueduct', Aqueduct),
		new BuyButton('Upgrade tractor', tractorBonus),
		new BuyButton('Open Roth IRA', investmentBonus)
	]);

	defineHarvester('water', function() {
		return 2 * STATE.aqueducts;
	}, 2000)

	defineHarvester('water', function() {
		return -1;
	}, 2000);

  defineHarvester('money', function() {
    return STATE.resources.money * STATE.investment;
  }, 2000);
}

function main() {
	background(58, 170, 80);
}
