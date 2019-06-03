module.exports = {
    /** @param {Number[][]} polygon */
    centeroid: polygon => {
        let xs = polygon.map(point => point[0]);
        let ys = polygon.map(point => point[1]);
        return [xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length]
    },
    bound: polygon => {
        let xs = polygon.map(point => point[0]);
        let ys = polygon.map(point => point[1]);
        return {
            xMin: Math.min(...xs),
            xMax: Math.max(...xs),
            yMin: Math.min(...ys),
            yMax: Math.max(...ys)
        }
    },
    distanceTo: (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
    colorToInt: (r, g, b) => (r << 16) + (g << 8) + b,
    biome: (height, moist) => {
        if (height < 0.1) return "ocean";
        if (height < 0.12) return "beach";
        if (height > 0.8) {
            if (moist < 0.1) return "scorched";
            if (moist < 0.2) return "bare";
            if (moist < 0.5) return "tundra";
            return "snow";
        }
        if (height > 0.6) {
            if (moist < 0.33) return "temperate desert";
            if (moist < 0.66) return "shrubland";
            return "taiga";
        }
        if (height > 0.3) {
            if (moist < 0.16) return "temerate desert";
            if (moist < 0.5) return "grassland";
            if (moist < 0.83) return "temperate deciduou forest";
            return "temperate rain forest";
        }
        if (moist < 0.16) return "subtropical desert";
        if (moist < 0.33) return "grassland";
        if (moist < 0.66) return "tropical seasonal forest";
        return "triopical rain forest";
    },
    randint: (min, max) => Math.floor(Math.random() * (max - min) + min),
    /** @param {String} s */
    capitalize: s => s.split(" ").map(v => v[0].toUpperCase() + v.slice(1)).join(" "),
}