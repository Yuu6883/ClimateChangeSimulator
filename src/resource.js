const { OilChance, OilRange, FishChance, FishRange, WindChance, WindRange,
    AnimalChance, AnimalRange, ForestRange, CoalChance, CoalRange,
    SolarRange } = require("./constants");
const { randint } = require("./util");
const Building = require("./building");

module.exports = class Resource {

    /** @param {import("./tile")} tile */
    constructor(tile) {
        this.tile = tile;
        this.oil = Math.random() < OilChance ? randint(...OilRange) : 0;
        if (tile.biome == "ocean" || tile.biome == "beach") {
            this.fish = Math.random() < FishChance ? randint(...FishRange): 0;
            this.wind = 0;
        } else {
            this.fish = 0;
            this.wind = Math.random() < WindChance ? randint(...WindRange) : 0;
            this.animal = Math.random() < AnimalChance ? randint(...AnimalRange) : 0;
            
            if (tile.biome.includes("forest")) {
                this.tree = randint(...ForestRange);
                this.age = 0;
                if (this.animal > 4500) {
                    this.tile.build("Ranch");
                } else {
                    this.tile.build("Forest");
                }
            }
            
            this.coal  = Math.random() < CoalChance ? randint(...CoalRange) : 0;
            this.solar = randint(...SolarRange);
        }
        this.age = 0;
    }

    getBuildable() {
        let buildable = [];
        if (this.oil) {
            if (this.tile.biome == "ocean" || this.tile.biome == "beach") buildable.push("Drill Platform");
            else buildable.push("Oil Drill");
        } 
        if (this.coal) buildable.push("Power Plant");
        if (this.fish) buildable.push("Fish Farm");
        if (this.solar) buildable.push("Solar Panel");
        if (this.animal) buildable.push("Ranch");
        if (this.tree) buildable.push("Forest");
        if (this.wind) buildable.push("Wind Turbine");
        return buildable;
    }

    ToString() {
        let string = "\n";
        if (this.oil) string += this.oil + " 🛢 Oil\n\n"; 
        if (this.fish) string += this.fish + " 🐟 Fish\n\n";
        if (this.wind) string += this.wind + " 💨 Wind\n\n";
        if (this.animal) string += this.animal + " 🐖 Animal\n\n";
        if (this.tree) string += this.tree + " 🌲 Forest\n\n";
        if (this.coal) string += this.coal + " ⛏️ Coal\n\n";
        if (this.solar) string += this.solar + " ☀️ Sunlight\n\n";
        if (string == "\n") string += "No Resources"
        return string;
    }
}