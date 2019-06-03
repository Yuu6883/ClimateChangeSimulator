const PIXI = require("pixi.js");
const { Border, TileSize } = require("./constants");
const Resource = require("./resource");
const Building = require("./building");
const { centeroid, distanceTo, biome, capitalize, bound } = require("./util");
const MapCenter = {
    x: Border.x / 2,
    y: Border.y / 2
}

module.exports = class Tile {

    /**
     * @param {import("./game")} game
     * @param {Number[][]} polygon 
     */
    constructor(game, polygon) {
        this.game = game;
        this.polygon = new PIXI.Polygon(polygon.map(coord => new PIXI.Point(coord[0], coord[1])));
        this.center = centeroid(polygon);
        this.bound = bound(polygon);
        this.shape = new PIXI.Graphics();
        this.shape.hitArea = this.polygon;
        this.shape.interactive = true;
        this.shape.on("click", e => this.onClick(e));
        this.shape.on("mouseover", e => this.onMouseover(e));
        this.scale = Math.max(this.bound.xMax - this.bound.xMin, this.bound.yMax - this.bound.yMin) / 100;
        
        /** @type {import("./building")} */
        this.building = undefined;
        this.updateBiome();
        this.generateGraphics();
        this.generateResource();
    }

    updateBiome() {
        let height = this.game.getHeightNoise(...this.center);
        let moist = this.game.getMoistNoise(...this.center);
        let heightModifier = distanceTo(this.center[0], this.center[1], MapCenter.x, MapCenter.y) / (0.5 * Border.x)
        if (heightModifier < 0.5) {
            height += (0.5 - heightModifier) * (1 - height);
        } else {
            height *= Math.pow(100, 0.5 - heightModifier);
        }
        this.biome = biome(height, moist);
    }

    generateGraphics(drawBorder) {

        let shape = this.shape;
        this.shape.clear();

        if (drawBorder) {
            if (this.game.selectedTile == this) {
                shape.lineStyle(3, 0x00FF00, 1);
            } else {
                shape.lineStyle(3, 0xFFFFFF, 1);
            }
        } else {
            shape.lineStyle(0, 0xFFFFFF, 0)
        }
        shape.drawPolygon(this.polygon);
    }

    generateResource() {
        this.resource = new Resource(this);
    }

    /** @param {import("pixi.js").interaction.InteractionEvent} e */
    onClick(e) {
        this.game.clickTile(this, e.data.global);
    }

    /** @param {import("pixi.js").interaction.InteractionEvent} e */
    onMouseover(e) {
        this.game.mouseOverTile(this, e.data.global);
    }

    getText() {
        return `${capitalize(this.biome)}\n${this.resource.ToString()}${this.building ? this.building.type : ""}`
    }

    canBuild() {
        return !this.building
    }

    build(type) {
        this.building = new Building(this, type);
        this.game.buildings.push(this.building);
        let sprite = new PIXI.Sprite(this.game.textures[type]);
        sprite.anchor.set(0.5, 0.5);
        sprite.position.set(...this.center);
        sprite.scale.set(this.scale / 3, this.scale / 3);
        this.buildingSprite = sprite;
        this.game.viewport.addChild(sprite);
    }

    hasResource() {
        return !this.resource.ToString().includes("No Resources");
    }

    destroyBuilding() {
        this.game.viewport.removeChild(this.buildingSprite);
        this.buildingSprite = undefined;
        this.resource.age = 0;
        this.game.buildings.splice(this.game.buildings.indexOf(this.building), 1);
        this.building = undefined;
    }
}