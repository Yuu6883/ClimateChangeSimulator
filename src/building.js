module.exports = class Building {
    /**
     * 
     * @param {import("./tile")} tile 
     * @param {String} type 
     */
    constructor(tile, type) {
        this.tile = tile;
        this.type = type;
    }

    onUpdate() {
        switch (type) {
            case "Fish":
                
                break;
        }
    }
}