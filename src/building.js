module.exports = class Building {
    /**
     * 
     * @param {import("./tile")} tile 
     * @param {String} type 
     */
    constructor(tile, type) {
        this.tile = tile;
        this.type = type;
        this.functional = true;
        this.warning = false;
    }

    disable() {
        this.functional = false;
    }

    enable() {
        this.functional = true;
    }
}