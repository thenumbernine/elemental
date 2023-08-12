import {DOM, getIDs, preload} from '/js/util.js';
const ids = getIDs();

let lastPage;
function changePage(page) {
	if (lastPage) {
		lastPage.style.display = 'none';
	}
	page.style.display = 'block';
	lastPage = page;
}

let scores;
let splash;
let help;
let cantPlay = '#ec2424';

class Point {
	constructor(x,y) {
		this.x = x;
		this.y = y;
	}
	equals(p) {
		return this.x == p.x && this.y == p.y;
	}
}

class TileHolder {
	getTile() { return this.tile; }
	setTile(tile) {
		if (this.tile !== undefined) {
			this.tile.setHolder(undefined);
		}
		this.tile = tile;
		if (this.tile !== undefined) {
			this.tile.setHolder(this);
		}
	}
	draw(canvas) {
		if (this.tile !== undefined) {
			this.tile.draw(canvas);
		}
	}
}

class Place extends TileHolder {
	constructor(grid, x, y) {
		super();
		this.rect = {};
		this.flashStartTime = -this.FLASH_DURATION;
		this.canPlay = true;
		this.grid = grid;
		this.x = x;
		this.y = y;
		//was bitmap
		this.img = DOM('img', {src:'res/drawable/tile_empty.png'});
	}

	getGrid() { return this.grid; }
	getX() { return this.x; }
	getY() { return this.y; }
	getWorldX() { return this.grid.getWorldX(this.x); }
	getWorldY() { return this.grid.getWorldY(this.y); }
	getWorldScale() { return this.grid.scale; }
	setPos(newX, newY) {
		this.x = newX;
		this.y = newY;
	}

	containsPoint(ptx, pty) {
		//global to local
		ptx -= this.getWorldX();
		ptx /= this.getWorldScale();
		pty -= this.getWorldY();
		pty /= this.getWorldScale();
		//local space compare
		return ptx >= -this.SPAN && pty >= -this.SPAN && ptx <= this.SPAN && pty <= this.SPAN;
	}

	draw(canvas) {
		this.rect.left = this.getWorldX() - this.SPAN * this.getWorldScale();
		this.rect.right = this.getWorldX() + this.SPAN * this.getWorldScale();
		this.rect.top = this.getWorldY() - this.SPAN * this.getWorldScale();
		this.rect.bottom = this.getWorldY() + this.SPAN * this.getWorldScale();
		if (!this.canPlay) {
			canvas.fillStyle = cantPlay;
			canvas.fillRect(this.rect.left, this.rect.top, this.rect.right - this.rect.left, this.rect.bottom - this.rect.top);
		} else {
			canvas.drawImage(this.img, this.rect.left, this.rect.top, this.rect.right - this.rect.left, this.rect.bottom - this.rect.top);
		}

		//draw any tile on us
		super.draw(canvas);

		let deltaFlashTime = this.grid.game.gameTime - this.flashStartTime;
		if (deltaFlashTime >= 0 && deltaFlashTime <= this.FLASH_DURATION) {
			if ((parseInt(deltaFlashTime / this.FLASH_PERIOD) & 1) == 1) {
				canvas.fillStyle = '#ffffff';
				canvas.fillRect(this.rect.left, this.rect.top, this.rect.right - this.rect.left, this.rect.bottom - this.rect.top);
			}
			this.grid.game.redraw();	//keep redrawing while we're flashing
		}
	}
}
Place.prototype.FLASH_DURATION = 1000;
Place.prototype.FLASH_PERIOD = 200;
Place.prototype.SPAN = .5;	//.45;


class Tile {
	constructor(color, type) {
		this.rect = {};
		this.color = color;
		this.type = type;
	}

	setHolder(holder) {
		this.holder = holder;
	}

	getColor() {
		return this.color;
	}

	setColor(color) {
		this.color = color;
	}

	canPlay(board, x, y) {
		return true;
	}

	getPoints(level) {
		return level * this.BASE_POINTS;	//base
	}

	/* whether playing this tile at thisX,thisY
		had something to do with whatever was at otherX, otherY
	*/
	playDependsOn(thisX, thisY, otherX, otherY) {
		return false;
	}

	draw(canvas) {
		this.rect.left = this.holder.getWorldX() - this.SPAN * this.holder.getWorldScale();
		this.rect.right = this.holder.getWorldX() + this.SPAN * this.holder.getWorldScale();
		this.rect.top = this.holder.getWorldY() - this.SPAN * this.holder.getWorldScale();
		this.rect.bottom = this.holder.getWorldY() + this.SPAN * this.holder.getWorldScale();
		canvas.drawImage(this.color.imgs[this.type], this.rect.left, this.rect.top, this.rect.right - this.rect.left, this.rect.bottom - this.rect.top);
	}
}
Tile.prototype.TYPE_TILE = 0;
Tile.prototype.TYPE_AREA = 1;
Tile.prototype.TYPE_FILL = 2;
Tile.prototype.BASE_POINTS = 10;
Tile.prototype.SPAN = .45;	//.4f;


class Tile3x3 extends Tile {
	constructor(color, type, neighbors) {
		super(color, type);

		this.subrect = {};
		this.neighbors = [];
		this.neighbors.length = 9;

		for (let i = 0; i < 9; i++) {
			this.neighbors[i] = neighbors[i];
		}
	}

	canPlay(board, x, y) {
		let e = 0;
		for (let j = 0; j < 3; j++) {
			for (let i = 0; i < 3; i++, e++) {
				let n = this.neighbors[e];
				if (n !== undefined) {
					let u = ((i-1) + x + board.width) % board.width;
					let v = ((j-1) + y + board.height) % board.height;

					let place = board.getPlace(u,v);
					let tile = place.getTile();
					if (tile.getColor() != n) return false;
				}
			}
		}
		return true;
	}

	/*
	point system ...
	*/
	getPoints(level) {
		let nbhs = 0;
		let colors = {};
		let numUniqueColors = 0;
		this.neighbors.forEach(c => {
			if (c !== undefined) {
				nbhs++;
				if (c in colors) {
					colors[c]++;
				} else {
					colors[c] = 1;
					numUniqueColors++;
				}
			}
		});
		let pts = 1 + nbhs * numUniqueColors * numUniqueColors;
		return level * pts * this.BASE_POINTS;
	}

	playDependsOn(thisX, thisY, otherX, otherY) {
		let dx = otherX - thisX;	//-1 to 1
		let dy = otherY - thisY;
		dx++;	//0 to 2
		dy++;
		if (dx < 0 || dx > 2 || dy < 0 || dy > 2) return false;
		return this.neighbors[dx + 3 * dy] !== undefined;
	}

	draw(canvas) {
		super.draw(canvas);

		let sx = this.rect.right - this.rect.left;
		let sy = this.rect.bottom - this.rect.top;
		let e = 0;
		for (let j = 0; j < 3; j++) {
			for (let i = 0; i < 3; i++, e++) {
				let n = this.neighbors[e];
				if (n !== undefined) {
					this.subrect.left = sx * (i + .15) / 3 + this.rect.left;
					this.subrect.right = sx * (i + .85) / 3 + this.rect.left;
					this.subrect.top = sy * (j + .15) / 3 + this.rect.top;
					this.subrect.bottom = sy * (j + .85) / 3 + this.rect.top;
					canvas.drawImage(n.tileImg, this.subrect.left, this.subrect.top, this.subrect.right - this.subrect.left, this.subrect.bottom - this.subrect.top);
				}
			}
		}
	}
}

class Grid {
	constructor(game, width, height) {
		this.width = 0;
		this.height = 0;
		this.x = 0;
		this.y = 0;
		this.scale = 0;
		this.game = game;
		this.width = width;
		this.height = height;
		this.places = [];
		this.places.length = this.width;
		for (let i = 0; i < this.width; i++) {
			let col = [];
			col.length = this.height;
			for (let j = 0; j < this.height; j++) {
				let p = new Place(this, i,j);
				col[j] = p;
			}
			this.places[i] = col;
		}
		this.refreshAllPlaces();
	}

	getPlace(x, y) {
		return this.places[x][y];
	}

	getAllPlaces() {
		return this.allPlaces;
	}

	draw(canvas) {
		this.allPlaces.forEach(p => {
			p.draw(canvas);
		});
	}

	getAllPlaces() {
		return this.allPlaces;
	}

	draw(canvas) {
		this.allPlaces.forEach(p => {
			p.draw(canvas);
		});
	}

	//so the whole idea of separating containsPoint from getPlaceAtPoint
	//was to allow for some basic grid area test optimizations...
	//...meh
	getPlaceAtPoint(x, y) {
		for (let i = 0; i < this.allPlaces.length; ++i) {
			const p = this.allPlaces[i];
			if (p.containsPoint(x,y)) {
				return p;
			}
		}
	}

	getWorldX(px) {
		if (px === undefined) return super.getWorldX();
		return px * this.scale + this.x;
	}
	getWorldY(py) {
		if (py === undefined) return super.getWorldY();
		return py * this.scale + this.y;
	}
	getScale() { return this.scale; }
	getWidth() { return this.width; }
	getHeight() { return this.height; }

	refreshAllPlaces() {
		let e = 0;
		this.allPlaces = [];
		this.allPlaces.length = this.width*this.height;
		for (let i = 0; i < this.width; i++) {
			for (let j = 0; j < this.height; j++, e++) {
				this.allPlaces[e] = this.places[i][j];
			}
		}
	}

	flip() {
		{
			let tmp = width;
			width = height;
			height = tmp;
		}
		//flip places
		let newPlaces = [];
		newPlaces.length = this.width;
		for (let i = 0; i < this.width; i++) {
			let col = [];
			col.length = this.height;
			for (let j = 0; j < height; j++) {
				let p = this.places[j][i];
				p.setPos(i,j);
				col[j] = p;
			}
			newPlaces[i] = col;
		}
		this.places = newPlaces;
		this.refreshAllPlaces();
	}
}

class Board extends Grid {
	constructor(game, size) {
		super(game, size, size);
	}
	rotate(dx,dy) {
		//rotate modulo the grid pieces about
		let newPlaces = [];
		newPlaces.length = this.width;
		for (let i = 0; i < this.width; i++) {
			let ii = (i + dx) % this.width;
			if (ii < 0) ii += this.width;
			let col = [];
			col.length = this.height;
			for (let j = 0; j < this.height; j++) {
				let jj = (j + dy) % this.height;
				if (jj < 0) jj += this.height;
				let p = this.places[ii][jj];
				p.setPos(i,j);
				col[j] = p;
			}
			newPlaces[i] = col;
		}
		this.places = newPlaces;
		this.refreshAllPlaces();
	}
}

class Hand extends Grid {
	constructor(game, width, height) {
		super(game, width, height);
	}
}

class Color {
	constructor(name) {
		this.name = name;
		this.tileImg = DOM('img', {src:this.getTileImgURL()});
		this.crossImg = DOM('img', {src:this.getCrossImgURL()});
		this.circleImg = DOM('img', {src:this.getCircleImgURL()});
		//formerly this.bitmaps
		//made to match up with Tile.prototype.TYPE_*
		this.imgs = [this.tileImg, this.crossImg, this.circleImg];
	}
	getTileImgURL() {
		return 'res/drawable/tile_'+this.name+'.png';
	}
	getCrossImgURL() {
		return 'res/drawable/cross_'+this.name+'.png';
	}
	getCircleImgURL() {
		return 'res/drawable/circle_'+this.name+'.png';
	}
}

class Cursor extends TileHolder {
	constructor(game, board, hand) {
		super();
		this.rect = {};
		this.onBoard = false;//whether it's on the board or in the hand
		this.hidden = true;
		this.game = game;
		this.board = board;
		this.hand = hand;
		this.img = DOM('img', {src:'res/drawable/cursor.png'});

		this.x = hand.width / 2;
		this.y = 0;
		this.onBoard = false;
	}

	hide() {
		this.hidden = true;
	}

	down() {
		this.hidden = false;
		this.y++;
		if (this.onBoard) {
			if (this.y >= this.board.height) {
				this.onBoard = false;
				this.y = 0;
				this.x = parseInt(this.x/(this.board.width-1)*(this.hand.width-1));
			}
		} else {
			if (this.y >= this.hand.height) {
				this.y = this.hand.height-1;
			}
		}
	}

	up() {
		this.hidden = false;
		this.y--;
		if (this.y < 0) {
			if (this.onBoard) {
				this.y = 0;
			} else {
				this.onBoard = true;
				this.y = this.board.height-1;
				this.x = parseInt(this.x/(this.hand.width-1)*(this.board.width-1));
			}
		}
	}

	left() {
		this.hidden = false;
		this.x--;
		if (this.x < 0) this.x = 0;
	}

	right() {
		this.hidden = false;
		this.x++;
		if (this.onBoard) {
			if (this.x >= this.board.width) {
				this.x = this.board.width-1;
			}
		} else {
			if (this.x >= this.hand.width) {
				this.x = this.hand.width-1;
			}
		}
	}

	//copied from Pointer
	returnTile() {
		let oldTile = this.getTile();
		if (this.grabbedFromPlace !== undefined && oldTile !== undefined) {
			this.setTile(undefined);
			this.grabbedFromPlace.setTile(this.getTile());
			this.grabbedFromPlace = undefined;
		}
	}

	click() {
		this.hidden = false;
		//TODO - run this on the render thread
		//	- so we don't have skips in tiles being visible and what not
		if (this.onBoard) {
			let tile = this.getTile();
			if (tile !== undefined) {
				if (tile.canPlay(this.board,this.x,this.y)) {
					this.setTile(undefined);
					this.game.setBoardPlaceTileColor(this.x, this.y, tile, this.grabbedFromPlace);
					this.grabbedFromPlace = undefined;
				}
			}
		} else {
			let place = this.hand.getPlace(this.x,this.y);

			let oldTile = this.getTile();
			this.setTile(undefined);

			let newTile = place.getTile();
			place.setTile(undefined);

			if (oldTile === undefined) {
				this.grabbedFromPlace = place;
			}

			this.setTile(newTile);
			place.setTile(oldTile);

			this.game.refreshValidPlays();
		}
	}

	currentGrid() {
		return this.onBoard ? this.board : this.hand;
	}

	getWorldX() {
		return this.currentGrid().getWorldX(this.x);
	}

	getWorldY() {
		return this.currentGrid().getWorldY(this.y);
	}

	getWorldScale() {
		return this.currentGrid().getScale() * 1.2;
	}

	draw(canvas) {
		if (this.hidden) return;
		super.draw(canvas);
		let grid = this.currentGrid();
		let wx = grid.getWorldX(this.x);
		let wy = grid.getWorldY(this.y);
		this.rect.left = wx - .6 * grid.scale;
		this.rect.top = wy - .6 * grid.scale;
		this.rect.right = wx + .6 * grid.scale;
		this.rect.bottom = wy + .6 * grid.scale;
		canvas.drawImage(this.img, this.rect.left, this.rect.top, this.rect.right - this.rect.left, this.rect.bottom - this.rect.top);
	}
}

class Pointer extends TileHolder {
	constructor(game, hand) {
		super();
		this.visible = false;
		this.x = 0;
		this.y = 0;
		this.game = game;
		this.hand = hand;
	}

	isVisible() { return this.visible; }
	setVisible(v) { this.visible = v; }
	hide() { this.setVisible(false); }
	show() { this.setVisible(true); }

	setGrabbedFromPlace(place) {
		this.grabbedFromPlace = place;
	}

	//returns the tile to the place it was grabbed from
	returnTile() {
		//assert(grabbedFromPlace.getTile() === undefined);
		let oldTile = this.getTile();
		if (this.grabbedFromPlace !== undefined && oldTile !== undefined) {
			this.setTile(undefined);
			this.grabbedFromPlace.setTile(oldTile);
			this.grabbedFromPlace = undefined;
		}
	}

	//place a tile in the hand
	//i.e. just swap the contents of where we place this with where we came from
	playInHand(place) {
		let oldTile = this.getTile();
		this.setTile(undefined);

		let newTile = place.getTile();
		place.setTile(undefined);

		//set newTile before setting oldTile because newTile may be undefined (if it's the same place we're setting where we got our tile from)
		this.grabbedFromPlace.setTile(newTile);
		place.setTile(oldTile);

		this.game.refreshValidPlays();
	}

	playInBoard(board, i, j) {
		let tile = this.getTile();
		if (tile.canPlay(board, i, j)) {
			this.setTile(undefined);
			this.game.setBoardPlaceTileColor(i, j, tile, this.grabbedFromPlace);
			this.grabbedFromPlace = undefined;
		} else {
			this.returnTile();
		}
	}

	setPos(x, y) {
		this.x = x;
		this.y = y;
	}

	//used for clicking
	getPointerX() { return this.x; }
	getPointerY() { return this.y; }

	//used for rendering
	getWorldX() { return this.x; }
	getWorldY() { return this.y; }
	getWorldScale() { return this.hand.getScale() * 1.2; }
}

//init at global scope so i can preload all their images
const allColors = [
	new Color('red'),
	new Color('green'),
	new Color('blue'),
	new Color('yellow'),
	new Color('purple'),
];

// game singleton ... I should make it a class since it is cloning the Game.java class ...

let game = new (function(){
	let thiz = this;
	this.started = false;

	this.PLAYS_PER_LEVEL = 10;
	this.START_LEVEL = 1;

	this.BACKGROUND_FADE_DURATION = 1000;

	this.NUM_REDRAWS = 5;

	this.backgroundsForLevel = [];
	for (let i = 1; i <= 100; i++) {
		this.backgroundsForLevel.push(DOM('img', {src:'res/drawable/bg'+i+'.jpg'}));
	}

	this.constructor = function() {
		this.canvas = ids['game-canvas'];
	};

	this.start = function(level) {

		//used for js
		this.started = true;

		//member constructor
		this.levelPlaysLeft = this.PLAYS_PER_LEVEL;

		this.level = 1;
		this.points = 0;

		this.lastPlayX = -99;
		this.lastPlayY = -99;

		this.numPlays = 0;
		this.gameTime = 0;

		this.draggingBoard = false;
		this.backgroundFadeStartTime = -this.BACKGROUND_FADE_DURATION-1;

		this.rect = {};

		this.redrawCounter = 0;

		this.lastCanvasWidth = -1;
		this.lastCanvasHeight = -1;

		//ctor:
		this.level = level;

		this.gameTime = Date.now();

		this.colors = allColors;

		let handSize = 8;
		let boardSize = 4;

		this.board = new Board(this, boardSize);
		this.hand = new Hand(this, handSize/2, 2);
		this.cursor = new Cursor(this, this.board, this.hand);
		this.handPointer = new Pointer(this, this.hand);

		this.levelPlaysLeft = this.PLAYS_PER_LEVEL;

		this.randomizeBoard();

		this.hand.getAllPlaces().forEach(p => {
			thiz.resetHandPlace(p);
		});

		this.refreshValidPlays();

		this.redraw();
	};

	this.refreshValidPlays = function() {
		this.hand.getAllPlaces().forEach(p => {
			p.canPlay = false;
			for (let j = 0; j < thiz.board.getHeight() && !p.canPlay; j++) {
				for (let i = 0; i < thiz.board.getWidth() && !p.canPlay; i++) {
					let tile = p.getTile();
					if (tile !== undefined) {	//in case annnother cursor is picking it up...
						if (tile.canPlay(thiz.board, i, j)) {
							p.canPlay = true;
						}
					}
				}
			}
		});

		let bgForLevelIndex = parseInt((this.level-1) / 10);
		if (bgForLevelIndex >= 0 && bgForLevelIndex < this.backgroundsForLevel.length) {
			this.lastBackground = this.background;
			this.backgroundFadeStartTime = Date.now();
			this.background = this.backgroundsForLevel[bgForLevelIndex];
		}
		this.redraw();
	};

	this.getNumColorsForLevel = function() {
		if (this.level <= 10) return 3;
		if (this.level <= 100) return 4;
		return 5;
	};

	this.randomizeBoard = function() {
		this.board.getAllPlaces().forEach(p => {
			p.setTile(new Tile(thiz.getRandomColor(thiz.getNumColorsForLevel()), Tile.prototype.TYPE_TILE));
		});
		this.redraw();
	};

	this.getColorAt = function(x,y) {
		x %= this.board.width; x += this.board.width; x %= this.board.width;
		y %= this.board.height; y += this.board.height; y %= this.board.height;
		let place = this.board.getPlace(x,y);
		let tile = place.getTile();
		return tile.getColor();
	};

	this.setColorAt = function(x,y,playedColor,cols,rows) {
		x %= this.board.width; x += this.board.width; x %= this.board.width;
		y %= this.board.height; y += this.board.height; y %= this.board.height;

		let playedOnPlace = this.board.getPlace(x,y);
		let playedOnTile = playedOnPlace.getTile();

		playedOnTile.setColor(playedColor);
		cols[x] = true;
		rows[y] = true;

		playedOnPlace.flashStartTime = this.gameTime;

		this.redraw();
	};

	this.setBoardPlaceTileColor = function(x,y,tile,grabbedFromPlace) {

		//while we're here, return all other moving pointers back to their original locations
		//cuz once in a blue moon one gets lost...
		//NOTICE - this means have your Cursor/Pointer's setTile(undefined) before you call setBoardPlaceTileColor
		this.returnAllTiles();

		let playedColor = tile.getColor();
		let playedOnColor = this.getColorAt(x,y);
		let playedSameColor = playedOnColor == playedColor;

		let rows = {};
		let cols = {};

		switch (tile.type) {
		case Tile.prototype.TYPE_TILE:
			this.setColorAt(x,y,playedColor,cols,rows);
			break;
		case Tile.prototype.TYPE_AREA:
			this.setColorAt(x, y, playedColor, cols, rows);
			this.setColorAt(x-1, y, playedColor, cols, rows);
			this.setColorAt(x+1, y, playedColor, cols, rows);
			this.setColorAt(x, y-1, playedColor, cols, rows);
			this.setColorAt(x, y+1, playedColor, cols, rows);
			break;
		case Tile.prototype.TYPE_FILL:
			{
				let points = [];
				points.push(new Point(x,y));
				for (let i = 0; i < points.length; i++) {
					let srcpt = points[i];
					let xofs = [-1, 1, 0, 0];
					let yofs = [0, 0, -1, 1];
					for (let j = 0; j < 4; j++) {
						let alreadyDone = false;
						let nbhdpt = new Point(srcpt.x + xofs[j], srcpt.y + yofs[j]);
						nbhdpt.x %= this.board.width; nbhdpt.x += this.board.width; nbhdpt.x %= this.board.width;
						nbhdpt.y %= this.board.height; nbhdpt.y += this.board.height; nbhdpt.y %= this.board.height;
						if (this.getColorAt(nbhdpt.x, nbhdpt.y) != playedOnColor) continue;
						for (let k = 0; k < i; k++) {
							if (points[k].equals(nbhdpt)) {
								alreadyDone = true;
								break;
							}
						}
						if (alreadyDone) continue;
						points.push(nbhdpt);
					}
				}
				points.forEach(p => {
					thiz.setColorAt(p.x, p.y, playedColor, cols, rows);
				});
			}
			break;
		}

		//make this place flash

		let numFilledRows = 0;
		for (let row in rows) {
			let filledRow = true;
			let matchColor = undefined;
			for (let i = 0; i < this.board.width; i++) {
				let color = this.board.getPlace(i, row).getTile().getColor();
				if (matchColor === undefined) {
					matchColor = color;
				} else {
					if (matchColor != color) {
						filledRow = false;
						break;
					}
				}
			}
			if (filledRow) {
				numFilledRows++;
				//then make the row flash
				for (let i = 0; i < this.board.width; i++) {
					this.board.getPlace(i, row).flashStartTime = this.gameTime;
				}
			}
		}
		let numFilledCols = 0;
		for (let col in cols) {
			let filledCol = true;
			let matchColor = undefined;
			for (let j = 0; j < this.board.height; j++) {
				let color = this.board.getPlace(col, j).getTile().getColor();
				if (matchColor === undefined) {
					matchColor = color;
				} else {
					if (matchColor != color) {
						filledCol = false;
						break;
					}
				}
			}
			if (filledCol) {
				numFilledCols++;
				//then make the col flash
				for (let j = 0; j < this.board.height; j++) {
					this.board.getPlace(col, j).flashStartTime = this.gameTime;
				}
			}
		}

		let filledAll = true;
		{
			let matchColor = undefined;
			const allPlaces = this.board.getAllPlaces()
			for (let i = 0; i < allPlaces.length; ++i) {
				const p = allPlaces[i];
				let color = p.getTile().getColor();
				if (matchColor === undefined) {
					matchColor = color;
				} else {
					if (matchColor != color) {
						filledAll = false;
						break;
					}
				}
			}
			if (filledAll) {
				allPlaces.forEach(p => {
					p.flashStartTime = thiz.gameTime;
				});
			}
		}

		//special case for 'filled all'
		if (filledAll) {
			this.points += 2000;	//make it worthwhile for lower levels
			this.points *= 1.5;	//add 50% to points
			this.randomizeBoard();
		} else {

			//calculate points
			let thisPlay = 1;
			thisPlay *= tile.getPoints(this.level);
			//+20% if we're on the same color
			if (playedSameColor) thisPlay += thisPlay * .2;
			//+20% if we used the last tile
			if (this.lastPlayX >= 0 && this.lastPlayY >= 0 && this.lastPlayX < this.board.width && this.lastPlayY < this.board.height) {
				if (tile.playDependsOn(x,y,this.lastPlayX,this.lastPlayY)) {
					thisPlay += thisPlay * .2;
					this.board.getPlace(this.lastPlayX, this.lastPlayY).flashStartTime = this.gameTime;
				}
			}
			//... scale by the number of rows and columns plsu one
			thisPlay += thisPlay * .1 * (numFilledRows + numFilledCols);
			this.points += thisPlay;
		}
		this.points = parseInt(this.points);

		this.levelPlaysLeft--;
		if (this.levelPlaysLeft <= 0) {
			this.levelPlaysLeft = this.PLAYS_PER_LEVEL;
			this.level++;
		}
		this.resetHandPlace(grabbedFromPlace);

		this.lastPlayX = x;
		this.lastPlayY = y;

		//call this after 'resetHandPlace' since that changes this
		this.refreshValidPlays();

		//if (numPlays == 0)
		//	end the game thread
		//	popup the scoreboard (with our score on it, maybe?)
		//	and start a new game

		this.redraw();
	};

	this.resetHandPlace = function(place) {

		let centers;
		let div = 2;
		let numColors = this.getNumColorsForLevel();
		if (this.level <= 10) {
			centers = [-10, 0, 5, 10];
			div = 2;
		} else if (this.level <= 100) {
			centers = [-100, 11, 40, 80, 120];
			div = 20;
		} else if (this.level <= 1000) {
			centers = [-1000, 200, 400, 600, 800, 999];
			div = 200;
		}
		let probs = [];
		let sum = 0;
		for (let i = 0; i < centers.length; i++) {
			let del = (this.level - centers[i]) / div;
			//probs[i] = Math.exp(-del*del);
			probs[i] = 1.0 / (1.0 + Math.exp(-del));
			sum += probs[i];
		}

		//roulette average
		let r = Math.random() * sum;
		let numNeighbors = 0;
		for (; ; numNeighbors++) {
			r -= probs[numNeighbors];
			if (r < 0) break;
		}

		//here's the only tile that gets a random type
		//...and it should vary with level(?)
		let type = Tile.prototype.TYPE_TILE;
		if (Math.random() < 1. / 20.) {
			type = Tile.prototype.TYPE_AREA;
			if (Math.random() < 1. / 5.) {
				type = Tile.prototype.TYPE_FILL;
			}
		}

		if (numNeighbors == 0) {
			place.setTile(new Tile(this.getRandomColor(numColors), type));
		} else {
			//randomly pick neighbors
			let neighbors = [];
			neighbors.length = 9;
			for (let i = 0; i < numNeighbors; i++) {
				let index = -1;
				do {
					index = parseInt(Math.random() * neighbors.length);
				} while (neighbors[index] !== undefined);
				neighbors[index] = this.getRandomColor(numColors);
			}
			place.setTile(new Tile3x3(this.getRandomColor(numColors), type, neighbors));
		}

		this.redraw();
	};

	this.getRandomColor = function(numColors) {
		return this.colors[ parseInt(Math.random() * numColors) ];
	};

	this.update = function() {
		this.gameTime = Date.now();

		//key update moved to key handlers
		//mouse update moved to mouse handlers

		if (this.draggingBoard) {
			let dx = this.draggingBoardX - this.draggingBoardDownX;
			let dy = this.draggingBoardY - this.draggingBoardDownY;
			//if we surpass board.scale then offset the down's by that much
			let ofx = 0;
			let ofy = 0;
			//rotate right once
			if (dx > this.board.scale) {
				this.draggingBoardDownX += this.board.scale;
				ofx--;
			}
			if (dx < -this.board.scale) {
				this.draggingBoardDownX -= this.board.scale;
				ofx++;
			}
			if (dy > this.board.scale) {
				this.draggingBoardDownY += this.board.scale;
				ofy--;
			}
			if (dy < -this.board.scale) {
				this.draggingBoardDownY -= this.board.scale;
				ofy++;
			}
			if (ofx != 0 || ofy != 0) {
				//rotate the board
				this.returnAllTiles();	///just in case...
				this.board.rotate(ofx, ofy);
			}
		}
	};

	this.showPointerWithEvent = function(event) {
		//see if we're clicking on a tile
		let x = event.pageX - game.canvas.offsetLeft;
		let y = event.pageY - game.canvas.offsetTop;
		//see if we're clicked on a tile in the hand...
		let place = this.hand.getPlaceAtPoint(x,y);
		if (place !== undefined) {
			let tile = place.getTile();
			if (tile !== undefined) {
				place.setTile(undefined);
				this.handPointer.setPos(x,y);
				this.handPointer.setGrabbedFromPlace(place);
				this.handPointer.setTile(tile);
				this.handPointer.show();
				return;
			}
		}

		//see if we're clicked on a tile in the board...
		//if so, set a magic flag that says 'dragging the board atm'
		//then...
		place = this.board.getPlaceAtPoint(x,y);
		if (place !== undefined) {
			if (!this.draggingBoard) {	//only if not dragging already
				//better have a tile, it's on the board after all
				//so just remember the x,y
				//and deduce from there the dragged x,y distance or something ...
				this.draggingBoardDownX = x;
				this.draggingBoardDownY = y;
				this.draggingBoard = true;
			}
			this.draggingBoardX = x;
			this.draggingBoardY = y;
		}

		this.returnAllTiles();
	};

	this.returnAllTiles = function() {
		this.handPointer.returnTile();
		this.handPointer.hide();
		this.cursor.returnTile();
		this.redraw();
	};

	this.getPoints = function() { return this.points; };
	this.getLevel = function() { return this.level; };
	this.getPlaysLeft = function() { return this.levelPlaysLeft; };

	this.redraw = function() {
		this.redrawCounter = this.NUM_REDRAWS;
	};

	this.draw = function() {
		if (!this.hand) return;
		if (!this.board) return;
		let c = this.canvas.getContext('2d');

		if (this.redrawCounter <= 0) return;
		this.redrawCounter--;

		let titleBarHeight = 25;	//I can't make this go away...
		let gamePadding = -25;//25;	//padding between fitted game size and canvas size
		let canvasWidth = this.canvas.width;
		let canvasHeight = this.canvas.height;// - titleBarHeight;	//top bar ... can i make this go away? not in android-3 targets ...

		if (canvasWidth != this.lastCanvasWidth || canvasHeight != this.lastCanvasHeight) {

			//readjust board and hand with screen size
			//especially important if the screen rotates
			let eps = 0;//0.25;	//in units of tiles, what space between board and hand
			let gameSizeX, gameSizeY;
			let boardPosFracX, boardPosFracY;
			let handPosFracX, handPosFracY;

			if (canvasWidth < canvasHeight) {	//hand beneath board

				//flip the hand if needed
				if (this.hand.width < this.hand.height) this.hand.flip();

				gameSizeX = Math.max(this.board.width + 2, this.hand.width);
				gameSizeY = this.board.height + eps + this.hand.height + 2;
				boardPosFracX = 1.5 / gameSizeX;	//TODO adjust these if the hand and board widths ever dont match up. then you'll have to do something with max's or min's or whatever.
				boardPosFracY = 1.5 / gameSizeY;
				handPosFracX = 1.5 / gameSizeX;
				handPosFracY = 1. - (this.hand.height /*- .5*/) / gameSizeY;
			} else {		//hand left of board

				//flip the hand if needed
				if (this.hand.height < this.hand.width) this.hand.flip();

				gameSizeX = this.board.width + this.hand.width + eps + 2;
				gameSizeY = Math.max(this.board.height, this.hand.height) + 2;
				boardPosFracX = (this.hand.width + 1.5 + eps) / gameSizeX;
				boardPosFracY = 1.5 / gameSizeY;
				handPosFracX = .5 / gameSizeX;
				handPosFracY = 1.5 / gameSizeY;
			}


			//now find the appropriate scale such that gameSizeX, gameSizeY fits in width, height

			let tileScaleX = (canvasWidth - 2 * gamePadding) / gameSizeX;
			let tileScaleY = (canvasHeight - 2 * gamePadding) / gameSizeY;
			let tileScale = Math.min(tileScaleX, tileScaleY);

			let fittedSizeX = tileScale * gameSizeX;
			let fittedSizeY = tileScale * gameSizeY;

			this.board.x = canvasWidth * .5 - fittedSizeX * .5 + fittedSizeX * boardPosFracX;
			this.board.y = canvasHeight * .5 - fittedSizeY * .5 + fittedSizeY * boardPosFracY;
			this.board.scale = tileScale;

			this.hand.x = canvasWidth * .5 - fittedSizeX * .5 + fittedSizeX * handPosFracX;
			this.hand.y = canvasHeight * .5 - fittedSizeY * .5 + fittedSizeY * handPosFracY;
			this.hand.scale = tileScale;

			this.lastCanvasWidth = canvasWidth;
			this.lastCanvasHeight = canvasHeight;
		}

		//do the actual drawing

		c.drawImage(this.background, 0, 0, canvasWidth, canvasHeight);
		if (this.lastBackground !== undefined) {
			let deltaFadeTime = this.gameTime - this.backgroundFadeStartTime;
			if (deltaFadeTime >= 0 && deltaFadeTime <= this.BACKGROUND_FADE_DURATION) {
				c.globalAlpha = 1.0 - deltaFadeTime / this.BACKGROUND_FADE_DURATION;
				//fadetime = 0 means we just started, so last background overlay alpha is 1
				//fadetime = duration means we're ending, so last background overlay alpha is 0
				c.drawImage(this.lastBackground, 0, 0, canvasWidth, canvasHeight);
				c.globalAlpha = 1;
				this.redraw();
			}
		}

		this.board.draw(c);
		this.hand.draw(c);
		if (this.handPointer.isVisible()) {
			this.handPointer.draw(c);
		}
		this.cursor.draw(c);

		let padding = 10;
		let yPadding = 16;

		//TODO update strinsg here

		//let levelStr = "Level " + level + "." + (PLAYS_PER_LEVEL - levelPlaysLeft);
		//c.drawText(levelStr, padding, yPadding, hudShadow);
		//c.drawText(levelStr, padding, yPadding, hudPaint);
		ids['game-level'].innerText =
			this.level + "." + (this.PLAYS_PER_LEVEL - this.levelPlaysLeft)
		;
		//String pointsStr = points + " Points";
		//hudPaint.getTextBounds(pointsStr, 0, pointsStr.length(), rect);
		//c.drawText(pointsStr, canvasWidth - padding - rect.right, yPadding, hudShadow);
		//c.drawText(pointsStr, canvasWidth - padding - rect.right, yPadding, hudPaint);
		ids['game-score'].innerText =
			this.points
		;
	};

	this.returnAllTiles = function() {
		this.handPointer.returnTile();
		this.handPointer.hide();
		this.cursor.returnTile();
		this.redraw();
	};

	this.end = function() {
		if (confirm('are you sure?')) {
			let done = function() {
				game.started = false;
				changePage(ids['scores-page']);
				scores.refresh();
			};
			let name = prompt("what's your name?");
			if (name) {
				console.log(`TODO
				$.ajax({
					url:'addscore.lua?name='+escape(name)
						+'&score='+this.points
						+'&level='+this.level
				}).done(done);
				.fail(done) too
				`);
				done();
			} else {
				done();
			}
		}
	};
})();

//high scores

scores = new (function(){
	this.refresh = function() {
		const scoresGrid = ids['scores-grid'];
		scoresGrid.innerHTML = '';
		scoresGrid.appendChild(DOM('div', {text:'name', class:'ui-block-a'}));
		scoresGrid.appendChild(DOM('div', {text:'level', class:'ui-block-b'}));
		scoresGrid.appendChild(DOM('div', {text:'score', class:'ui-block-c'}));
		console.log(`TODO
		$.ajax({
			url:'scores.json',
			dataType:'json'
		}).done(function(ds) {
			ds.forEach(d => {
				scoresGrid.appendChild(DOM('div', {text:d.name, class:'ui-block-a'}));
				scoresGrid.appendChild(DOM('div', {text:d.level, class:'ui-block-b'}));
				scoresGrid.appendChild(DOM('div', {text:d.score, class:'ui-block-c'}));
			});
		});
		`);
	};

	this.back = function() {
		changePage(ids['splash-page']);
	};
})();

//splash screen

splash = new (function(){
 	this.level = 1;

	//this is only the max for the splash screen
	this.maxLevels = 50;

	this.changelevel = function(direction) {
		this.level += direction;
		this.level--;
		this.level %= this.maxLevels;
		this.level += this.maxLevels;
		this.level %= this.maxLevels;
		this.level++;
		ids['splash-level'].innerText = this.level;
	}

	this.help = function() {
		changePage(ids.help);
	}

	this.scores = function() {
		changePage(ids['scores-page']);
		scores.refresh();
	}

	this.start = function() {
		changePage(ids['game-page']);
		game.start(this.level);
	};
})();

//help screen

//TODO just use browser back? or popup/close?
help = new (function(){
	this.back = function() {
		changePage(ids['splash-page']);
	};
})();

//main

function onresize() {
	let width = window.innerWidth;
	let height = window.innerHeight;
	let screenWidth = height * 540 / 960;
	let screenHeight = height;
	game.canvas.width = parseInt(screenWidth);
	game.canvas.height = parseInt(screenHeight);
	game.canvas.style.left = (Math.max(0, (width-screenWidth)/2))+'px';
	game.redraw();
}

function update() {
	if (game) {
		game.update();
		game.draw();
	}
	setTimeout(update, 30);
}

function onkeydown(event) {
	if (!game.started) return;
	let keyCode = event.keyCode;
	switch (keyCode) {
	case 73:	//'i'
	case 38:	//up
		game.cursor.up();
		game.redraw();
		break;
	case 77:	//'m'
	case 40:	//down
		game.cursor.down();
		game.redraw();
		break;
	case 74:	//'j'
	case 37:	//left
		game.cursor.left();
		game.redraw();
		break;
	case 75:	//'k'
	case 39:	//right
		game.cursor.right();
		game.redraw();
		break;
	case 13:	//enter
	case 32:	//space
		game.cursor.click();
		game.redraw();
		break;
	}
}

let mouseDown = false;
function onmouseup() {
	mouseDown = false;
	if (!game.started) return;
	//let go
	//try to place the tile
	if (game.handPointer.isVisible()) {
		let x = game.handPointer.getPointerX();
		let y = game.handPointer.getPointerY();
		let place;
		if ((place = game.hand.getPlaceAtPoint(x,y)) !== undefined) {
			game.handPointer.playInHand(place);
		} else if ((place = game.board.getPlaceAtPoint(x,y)) !== undefined) {
			game.handPointer.playInBoard(game.board, place.getX(), place.getY());
		}
	}
	game.draggingBoard = false;
	game.returnAllTiles();
}

function onmousedownmove(event) {
	if (!game.started) return;
	if (!mouseDown) return;
	let x = event.pageX - game.canvas.offsetLeft;
	let y = event.pageY - game.canvas.offsetTop;
	//drag it
	if (!game.handPointer.isVisible() && !game.draggingBoard) {
		game.cursor.hide();
		game.showPointerWithEvent(event);
	}
	//a kludge at the last second.  i know, i know, input is a mess...
	game.draggingBoardX = x;
	game.draggingBoardY = y;
	game.handPointer.setPos(x, y);
	game.redraw();

	/* and if there's a touch cancel available:
	draggingBoard = false;
	returnAllTiles();
	*/
}

function onmousedown(event) {
	mouseDown = true;
	onmousedownmove(event);
}
function onmousemove(event) { onmousedownmove(event); }

function ready() {
	game.constructor();
	window.addEventListener('resize', onresize);
	onresize();
	changePage(ids['splash-page']);

	//Chrome doesn't like click attr for some odd reason...

	ids['game-close'].addEventListener('click', e => {
		game.end();
	});

	//window.addEventListener('dragstart', function(e) { e.preventDefault(); });
	window.addEventListener('touchstart', e => {
		onmousedown(e.originalEvent.changedTouches[0]);
	});
	window.addEventListener('touchmove', e => {
		e.preventDefault();
		onmousemove(e.originalEvent.changedTouches[0]);
	});
	window.addEventListener('touchend', e => {
		e.preventDefault();
		onmouseup(e.originalEvent.changedTouches[0]);
	});
	window.addEventListener('touchcancel', e => {
		e.preventDefault();
		onmouseup(e.originalEvent.changedTouches[0]);
	});
	window.addEventListener('keydown', onkeydown);
	window.addEventListener('mouseup', onmouseup);
	window.addEventListener('mousedown', onmousedown);
	window.addEventListener('mousemove', onmousemove);

	ids['splash-level-up'].addEventListener('click', e => {
		splash.changelevel(1);
	});
	ids['splash-level-down'].addEventListener('click', e => {
		splash.changelevel(-1);
	});
	ids['splash-start'].addEventListener('click', e => {
		splash.start();
	});
	ids['splash-scores'].addEventListener('click', e => {
		splash.scores();
	});
	ids['splash-help'].addEventListener('click', e => {
		splash.help();
	});
	ids['help-back'].addEventListener('click', e => { help.back(); });
	ids['help-back2'].addEventListener('click', e => { help.back(); });
	ids['scores-back'].addEventListener('click', e => {
		scores.back();
	});

	setTimeout(() => {
		update();
	}, 100);	//new chrome no longer renders immediately on load ...
}

const imgs = [
	'res/drawable/tile_empty.png',
	'res/drawable/cursor.png'
];
allColors.forEach(c => {
	imgs.push(c.getTileImgURL());
	imgs.push(c.getCrossImgURL());
	imgs.push(c.getCircleImgURL());
});
preload(imgs, ready);
