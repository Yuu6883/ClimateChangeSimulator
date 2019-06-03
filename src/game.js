const PIXI = require("pixi.js");
const Viewport = require("pixi-viewport");
const { Delaunay } = require("d3-delaunay");
const { Noise } = require("noisejs");
const Tile = require("./tile");
const { Border, NumTiles, Octaves, OceanCutoff, TextureScaleDown, ViewBox, buttonOffset, buttonBox } = require("./constants");
const { centeroid, distanceTo } = require("./util");
const Swal = require("sweetalert2").default;
const MapCenter = {
    x: Border.x / 2,
    y: Border.y / 2
}
const Sprites = require("./sprites.json");

module.exports = class Game {
    constructor() {
        /** @type {import("./building")[]} */
        this.buildings = [];
        this.textures = {};
        
        /** @type {Tile} */
        this.selectedTile = undefined
        Swal.fire({
            title: "<img src='https://i.imgur.com/v3zLi5p.png' style='width: 100%'>",
            html: "<p>wcwp project</p>",
            width: 700,
            confirmButtonText: "Play",
            confirmButtonColor: "#29aec6",
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false
        }).then(() => this.init());

        this.CO2Emission = 0;
        this.temperature = 0;
        this.hazardWeatherRate = 0.01;
    }

    init() {
        for (let key in Sprites) {
            this.textures[key] = PIXI.Texture.from(Sprites[key]);
        }
        Swal.fire({
            title: "Generating Map...",
            showConfirmButton: false,
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false,
            onOpen: () => {
                Swal.showLoading();
                setTimeout(() => {
                    this.initApp();
                    this.loadGradient();
                    this.initSeedAndNoise();
                    this.generateBackground();
                    this.generateMap();
                }, 500);
            }
        });
    }

    initApp() {
        const app = new PIXI.Application({
            width: window.innerWidth,
            height: window.innerHeight,
            resizeTo: window,
            backgroundColor: 0xffffff,
            antialias: true
        });
        const stage = app.stage;
        document.body.appendChild(app.view);

        let bg = new PIXI.Graphics();
        bg.beginFill(0x2c3d7b);
        bg.drawRect(0, 0, window.innerWidth, window.innerHeight);
        bg.endFill();
        bg.interactive = true;
        bg.hitArea = new PIXI.Rectangle(0, 0, window.innerWidth, window.innerHeight);
        bg.on("mouseover", () => console.log("Hello World"));
        stage.addChild(bg);
    
        const viewport = new Viewport({
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,     
            interaction: app.renderer.plugins.interaction
        });
        stage.addChild(viewport);

        const tileViewer = new PIXI.Graphics();
        tileViewer.beginFill(0x000000, 0.5);
        tileViewer.drawRoundedRect(0, 0, ViewBox.x, ViewBox.y, 40);
        tileViewer.endFill();
        app.stage.addChild(tileViewer);
        tileViewer.visible = false;
        this.tileViewer = tileViewer;
        const tileText = new PIXI.Text("Hello World", 
            {fontFamily : 'Arial', fontSize: 24, fill : 0xffffff, align : 'left'});
        tileText.position.set(20, 20);


        const button = new PIXI.Graphics();
        button.position.set(buttonOffset.x, buttonOffset.y);
        this.buttonColor(button, 0xAAAAAA);
        button.interactive = true;
        button.visible = false;
        button.on("click", e => this.buttonClicked(e));
        button.on("mouseover", e => this.mouseOverButton(e));
        button.on("mouseout", e => this.mouseOutButton(e));
        this.button = button;

        const buttonText = new PIXI.Text("Build", 
            {fontFamily : 'Arial', fontSize: 20, fill : 0xffffff, align : 'center'});
        buttonText.anchor.set(0.5, 0.5);
        buttonText.position.set(buttonBox[0] / 2, buttonBox[1] / 2);
        button.alpha = 0.5;
        button.addChild(buttonText);
        this.buttonText = buttonText;

        tileViewer.addChild(button);
        this.tileViewer.addChild(tileText);
        this.tileText = tileText;
    
        viewport
            .drag()
            .pinch()
            .wheel({
                percent: 0.001
            })
            // .clamp({
            //     top: true,
            //     bottom: Border.y,
            //     left: true,
            //     right: Border.x
            // })
            .clampZoom({
                minHeight: Border.y / 5,
                maxHeight: Border.y
            })
            .decelerate();
        this.app = app;
        this.viewport = viewport;
    }

    /** @param {PIXI.interaction.InteractionEvent} e */
    buttonClicked(e) {
        if (this.buttonText.text == "Destroy") {
            this.selectedTile.destroyBuilding();
            this.disselect();
        }
        if (this.buttonText.text == "Build") {
            this.promptBuild(this.selectedTile);
        }
        e.stopPropagation();
    }

    /** @param {PIXI.interaction.InteractionEvent} e */
    mouseOverButton(e) {
        this.button.alpha = 1;
        this.buttonText.alpha = 1;
        e.stopPropagation();
    }

    /** @param {PIXI.interaction.InteractionEvent} e */
    mouseOutButton(e) {
        this.button.alpha = 0.5;
        this.buttonText.alpha = 0.5;
        e.stopPropagation();
    }

    /** @param {import("./tile")} tile */
    promptBuild(tile) {
        let availableBuild = tile.resource.getBuildable();
        Swal.fire({
            title: "Available Build",
            html: availableBuild.map(b => `<img width=100, height=100, src="${Sprites[b]}" style="margin: 10px" id="${b}">`).join(""),
            onBeforeOpen: () => {
                let $ = Swal.getContent().querySelectorAll.bind(Swal.getContent());
                $("img").forEach(img => img.addEventListener("click", () => {
                    this.selectedTile.build(img.id);
                    this.disselect();
                    Swal.close();
                }));
            },
            width: availableBuild.length * 120 + 50,
            showCancelButton: true,
            cancelButtonColor: "#d10000",
            showConfirmButton: false,
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false
        }).then(result => {
            if (result.dismiss == "cancel") {
                this.disselect();
            }
        });
    }

    disselect() {
        this.button.visible = false;
        this.tileViewer.visible = false;
        this.selectedTile.generateGraphics();
        this.selectedTile = undefined;
    }

    initSeedAndNoise() {
        this.heightSeed = Math.random();
        this.moistSeed = Math.random();
        /** @type {import("noisejs")} */
        this.heightNoise = new Noise(this.heightSeed);
        /** @type {import("noisejs")} */
        this.moistNoise = new Noise(this.moistSeed);
    }

    loadGradient() {
        let img = document.getElementById("gradient");
        let canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        let ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        this.gradientData = ctx.getImageData(0, 0, img.width, img.height);
    }

    /**
     * 
     * @param {PIXI.Graphics} button 
     * @param {*} color 
     */
    buttonColor(button, color) {
        button.clear();
        button.beginFill(color);
        button.drawRoundedRect(0, 0, ...buttonBox, 5);
        button.endFill();
    }

    tick() {

        this.CO2Emission = this.calculateEmission() - this.forestAbsorption();
        this.temperature += 0.01 * this.CO2Emission;
        this.hazardWeatherRate = 0.01 * this.temperature;

        if (Math.random() <= this.hazardWeatherRate) {
            this.createNaturalDisaster();
        }
    }

    calculateEmission() {
        return 0
    }

    forestAbsorption() {
        return 0
    }

    createNaturalDisaster() {

    }

    generateBackground() {
        if (this.background) this.viewport.removeChild(this.background);
        let canvas = document.createElement("canvas");
        canvas.width = Border.x / TextureScaleDown;
        canvas.height = Border.y / TextureScaleDown;
        let ctx = canvas.getContext("2d");
        let array = new Uint8ClampedArray(Border.x * Border.y * 4 / TextureScaleDown / TextureScaleDown);

        for (let x = 0; x < Border.x; x += TextureScaleDown) {
            for (let y = 0; y < Border.y; y += TextureScaleDown) {
                let height = this.getHeightNoise(x, y);
                let heightModifier = distanceTo(x, y, MapCenter.x, MapCenter.y) / (0.5 * Border.x)
                if (heightModifier < 0.5) {
                    height += (0.5 - heightModifier) * (1 - height);
                } else {
                    height *= Math.pow(100, 0.5 - heightModifier);
                }
                let moist = this.getMoistNoise(x, y);
                let [r, g, b] = this.getGradientColor(moist, 1 - height);
                
                array[4 * x / TextureScaleDown + 4 * Border.x / TextureScaleDown * y / TextureScaleDown] = r;
                array[4 * x / TextureScaleDown + 4 * Border.x / TextureScaleDown * y / TextureScaleDown + 1] = g;
                array[4 * x / TextureScaleDown + 4 * Border.x / TextureScaleDown * y / TextureScaleDown + 2] = b;
                array[4 * x / TextureScaleDown + 4 * Border.x / TextureScaleDown * y / TextureScaleDown + 3] = 255;
            }
        }
        let imgData = ctx.createImageData(canvas.width, canvas.height);
        imgData.data.set(array, 0);
        ctx.putImageData(imgData, 0, 0);
        let texture = new PIXI.Texture(new PIXI.BaseTexture(canvas));
        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        this.background = new PIXI.Sprite(texture);
        this.background.scale.x = this.background.scale.y = TextureScaleDown;
        this.background.interactive = true;
        this.viewport.addChild(this.background);
    }

    getGradientColor(nx, ny) {
        nx = Math.min(0.98, Math.max(nx, 0));
        ny = Math.min(0.98, Math.max(ny, 0));
        let index = 4 * Math.floor(this.gradientData.width * nx) 
            + 4 * this.gradientData.width * Math.floor(this.gradientData.height * ny);
        return this.gradientData.data.slice(index, index + 4);
    }

    isOcean(ny) {
        ny = Math.min(0.98, Math.max(ny, 0));
        return Math.floor(this.gradientData.height * ny) >= OceanCutoff
    }

    getMoistNoise(x, y) {
        let nx = x / Border.x;
        let ny = y / Border.y;
        console.assert(nx <= 1 && nx >= 0 && ny <= 1 && ny >= 0, "X and Y need to be normalized");
        let d = 0;
        for (let i = 0; i < Octaves; i ++) {
            d += (1 / 2 ** i) * (this.moistNoise.perlin2(nx * 2 ** i, ny * 2 ** i) / 2 + 0.4);
        }
        return d;
    }

    getHeightNoise(x, y) {
        let nx = x / Border.x;
        let ny = y / Border.y;
        console.assert(nx <= 1 && nx >= 0 && ny <= 1 && ny >= 0, "X and Y need to be normalized");
        let d = 0;
        for (let i = 0; i < Octaves; i ++) {
            d += (1 / 2 ** i) * (this.heightNoise.perlin2(nx * 2 ** i, ny * 2 ** i) / 2 + 0.1);
        }
        return d;
    }

    generateMap() {
        const randomPoint = () => [Math.random() * Border.x, Math.random() * Border.y];
        const points = Array.from({ length: NumTiles }, randomPoint);
        let delaunay = Delaunay.from(points);
        let voronoi = delaunay.voronoi([0, 0, Border.x, Border.y]);
        let polygons = [...voronoi.cellPolygons()];
    
        for (let i = 0; i < 5; i ++) {
            let centeroids = polygons.map(polygon => centeroid(polygon));
            delaunay = Delaunay.from(centeroids);
            voronoi = delaunay.voronoi([0, 0, Border.x, Border.y]);
            polygons = [...voronoi.cellPolygons()];
        }
    
        this.tiles = polygons.map(polygon => new Tile(this, polygon));
        this.tiles.forEach(tile => this.addTile(tile));
        this.viewport.fitHeight(Border.y);
        this.viewport.moveCenter(Border.x / 2, Border.y / 2);
        
        this.app.renderer.render(this.app.stage);
        Swal.close();
    }

    /** @param {Tile} tile */
    addTile(tile) {
        this.viewport.addChild(tile.shape);
    }

    /** 
     * @param {Tile} tile 
     * @param {import("pixi.js").Point} pos
     */
    clickTile(tile, pos) {
        if (this.selectedTile) {
            this.selectedTile = undefined;
            this.mouseOverTile(tile, pos);
            this.button.visible = false;
        } else {
            this.button.alpha = 0.5;
            this.button.visible = true;
            if (tile.building) {
                this.buttonText.alpha = 0.5;
                this.buttonText.text = "Destroy";
                this.buttonColor(this.button, 0xcc0000);
            } else {
                if (!tile.hasResource()) {
                    this.button.visible = false;
                    return;
                } else {
                    this.buttonText.text = "Build";
                    this.buttonText.alpha = 0.5;
                    this.buttonColor(this.button, 0x02a500);
                }
            }
            this.selectedTile = tile;
            tile.generateGraphics(true);
        }
    }

    /** 
     * @param {Tile} tile 
     * @param {import("pixi.js").Point} pos
     */
    mouseOverTile(tile, pos) {
        if (this.selectedTile) return;
        if (this.lastMouseoverTile) {
            this.lastMouseoverTile.generateGraphics(false);
        }
        this.tileViewer.visible = true;
        let left = pos.x > window.innerWidth / 2;
        let top = pos.y > window.innerHeight / 2;
        this.tileViewer.pivot.x = left ? ViewBox.x : 0;
        this.tileViewer.pivot.y = top ? ViewBox.y : 0
        this.tileViewer.position.set(pos.x, pos.y);
        let newText = tile.getText();
        this.tileViewer.clear();
        this.tileViewer.beginFill(0x000000, 0.5);
        this.tileViewer.drawRoundedRect(0, 0, ViewBox.x, ViewBox.y * newText.split("\n").length, 40);
        this.tileViewer.endFill();
        this.tileText.text = newText;
        tile.generateGraphics(true);
        this.lastMouseoverTile = tile;
    }
}