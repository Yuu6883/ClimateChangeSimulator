const PIXI = require("pixi.js");
const Viewport = require("pixi-viewport");
const { Delaunay } = require("d3-delaunay");
const { Noise } = require("noisejs");
const Tile = require("./tile");
let { Border, NumTiles, Octaves, OceanCutoff, TextureScaleDown, ViewBox, 
    buttonOffset, buttonBox, gameTick, foodBarWidth, foodBarMargin, MaxFood, MaxEnergy,
    ignoreOffset, ignoreBox } = require("./constants");
const { centeroid, distanceTo, select } = require("./util");
const Swal = require("sweetalert2").default;
const MapCenter = {
    x: Border.x / 2,
    y: Border.y / 2
}
const Sprites = require("./sprites.json");
const Disasters = require("./disasters.json");

module.exports = class Game {
    constructor() {
        /** @type {import("./building")[]} */
        this.buildings = [];
        this.textures = {};
        
        /** @type {Tile} */
        this.selectedTile = undefined;
        Swal.fire({
            title: "<img src='https://i.imgur.com/v3zLi5p.png' style='width: 100%'>",
            html: "<p></p>",
            width: 700,
            confirmButtonText: "Play",
            confirmButtonColor: "#29aec6",
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false
        }).then(() => this.showTutorial().then(() => this.init()));

        this.CO2Emission = 0;
        this.temperature = 0;
        this.hazardWeatherRate = 0.01;
        this.time = 0;
        this.food = 1000;
        this.totalEnergy = 100;
        this.lastNaturalDisaster = -100;
        this.ignoreDisaster = true;
        /** @type {Tile} */
        this.tileMouseover = undefined;
        this.paused = false;
    }

    init() {
        for (let key in Sprites) {
            this.textures[key] = PIXI.Texture.from(Sprites[key].url);
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
                    this.gameloop = setInterval(() => this.tick(), gameTick);
                    Swal.close();
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
        this.population = 1000;

        const foodBar = new PIXI.Graphics();
        foodBar.position.set(0, 0);
        this.foodBar = foodBar;
        stage.addChild(foodBar);

        const foodText = new PIXI.Text("Food\n" + this.food, 
            {fontFamily : 'Arial', fontSize: 20, fill : 0xcef442, align : 'center'});
        foodText.position.set(foodBarMargin + 2 * foodBarWidth, foodBarMargin);
        this.foodText = foodText;
        stage.addChild(foodText);

        const energyBar = new PIXI.Graphics();
        energyBar.position.set(window.innerWidth, 0);
        this.energyBar = energyBar;
        stage.addChild(energyBar);

        const energyText = new PIXI.Text("Energy\n0.1%", 
            {fontFamily : 'Arial', fontSize: 20, fill : 0xf4cd41, align : 'center'});
        energyText.position.set(window.innerWidth - 3 * foodBarWidth - foodBarMargin, foodBarMargin);
        this.energyText = energyText;
        stage.addChild(energyText);

        const ignoreText = new PIXI.Text("Ignore Disasters", 
            {fontFamily : 'Arial', fontSize: 14, fontWeight: "bold",
             fill : 0xffffff, align : 'center'});
        ignoreText.anchor.set(0, 0.5);
        
        const ignoreButton = new PIXI.Graphics();
        ignoreButton.pivot.set(0.5, 0.5);
        ignoreButton.position.set(ignoreOffset.x, ignoreOffset.y);
        ignoreButton.alpha = 0.5;
        const toggle = () => {
            ignoreButton.clear();
            ignoreButton.beginFill(!this.ignoreDisaster ? 0x8af725 : 0xff0000, 1);
            ignoreButton.drawRoundedRect(-ignoreBox.y / 2, -ignoreBox.y / 2,
                ignoreBox.x, ignoreBox.y, 6);
            ignoreButton.endFill();
            ignoreText.alpha = 1;
            ignoreText.text = !this.ignoreDisaster ? "Show Disasters" : "Ignore Disasters";
            this.ignoreDisaster = !this.ignoreDisaster;
        }
        toggle();
        ignoreButton.interactive = true;
        ignoreButton.on("click", () => toggle());

        ignoreButton.addChild(ignoreText);
        stage.addChild(ignoreButton);
    
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

    updateFoodDisplay() {
        let totalHeight = window.innerHeight - 2 * foodBarMargin;
        this.foodBar.clear();
        let percent = this.food / MaxFood;
        this.foodBar.beginFill(0xaaaaaa, 0.5);
        this.foodBar.drawRoundedRect(foodBarMargin, foodBarMargin, 
            foodBarWidth, totalHeight, 5);
        this.foodBar.endFill();
        this.foodBar.beginFill(0xcef442);
        this.foodBar.drawRoundedRect(foodBarMargin, foodBarMargin + (1 - percent) * totalHeight, 
            foodBarWidth, percent * totalHeight, 5);
        this.foodBar.endFill();
        this.foodText.text = "Food\n" + ~~(this.food);
    }

    updateEnergyDisplay() {
        let totalHeight = window.innerHeight - 2 * foodBarMargin;
        this.energyBar.clear();
        let percent = this.totalEnergy / MaxEnergy;
        this.energyBar.beginFill(0xaaaaaa, 0.5);
        this.energyBar.drawRoundedRect(- foodBarMargin - foodBarWidth, foodBarMargin, 
            foodBarWidth, totalHeight, 5);
        this.energyBar.endFill();
        this.energyBar.beginFill(0xf4cd41);
        this.energyBar.drawRoundedRect(- foodBarMargin - foodBarWidth, foodBarMargin + (1 - percent) * totalHeight, 
            foodBarWidth, percent * totalHeight, 5);
        this.energyBar.endFill();
        this.energyText.text = "Energy\n" + (percent * 100).toFixed(1) + "%";
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
        this.pause();
        Swal.fire({
            title: "Available Build",
            html: "<div style='display:table'>" + availableBuild.map(b => `<div style="display: table-cell; width:100px;">
                    <img width=100, height=100, src="${Sprites[b].url}" style="margin: 10px" id="${b}"><br>Cost: ${Sprites[b].cost}
                                            </div>`).join("") + "</div>",
            onBeforeOpen: () => {
                let $ = Swal.getContent().querySelectorAll.bind(Swal.getContent());
                $("img").forEach(img => img.addEventListener("click", () => {
                    if (this.food < Sprites[img.id].cost) {
                        Swal.fire("Not enough food", `You need ${~~(Sprites[img.id].cost - this.food)} more food to build ${img.id}`, "error");
                    } else {
                        this.food -= Sprites[img.id].cost;
                        this.selectedTile.build(img.id);
                        this.disselect();
                        Swal.close();
                    }
                    this.resume();
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
                this.resume();
            }
        });
    }

    showTutorial() {
        return Swal.mixin({
            confirmButtonText: 'Next &rarr;',
            showCancelButton: true,
            progressSteps: ['0', '1', '2', '3', '4']
        }).queue([
        {
            title: "Tutorial",
            imageUrl: 'https://i.imgur.com/v3zLi5p.png',
            confirmButtonText: "Start",
            cancelButtonText: "Skip",
            cancelButtonColor: "red"
        },
        {
            title: 'Destroy and Build',
            imageUrl: "https://i.imgur.com/UaB119t.jpg",
            imageWidth: 600,
            imageHeight: 600,
            width: 700,
            text: "Click to destroy or build utilities on a tile",
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false,
            showCancelButton: false
        },
        {
            title: 'Collect Food',
            imageUrl: "https://i.imgur.com/1ESuaqV.jpg",
            imageWidth: 600,
            imageHeight: 600,
            width: 700,
            text: "Build Fish Farm or Ranch to collect food for building other utilities.",
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false,
            showCancelButton: false
        },
        {
            title: 'Out of Resource',
            imageUrl: "https://i.imgur.com/sHSKgfo.png",
            imageWidth: 600,
            imageHeight: 600,
            width: 700,
            text: "Resource will run out in a while",
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false,
            showCancelButton: false
        },
        {
            title: 'Collecting Energy',
            imageUrl: 'https://i.imgur.com/wFxRdtX.jpg',
            imageWidth: 600,
            imageHeight: 600,
            width: 700,
            text: "These utilities provide energy. Reach 100% to win the game!",
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false,
            showCancelButton: false,
            confirmButtonText: "Got it!"
        }]);
    }

    disselect() {
        this.button.visible = false;
        this.tileViewer.visible = false;
        if (this.selectedTile) this.selectedTile.generateGraphics();
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

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    tick() {
        if (this.paused) return;
        this.time++;
        this.CO2Emission = this.calculateEmission() - this.forestAbsorption();
        this.temperature += 0.00005 * this.CO2Emission;
        this.temperature = Math.min(Math.max(this.temperature, 0), 99.99);
        this.hazardWeatherRate = 0.01 * this.temperature + 0.0001;
        this.calculateEnergy();
        this.calculateFood();
        this.updateFoodDisplay();
        this.updateEnergyDisplay();
        this.checkLose();
        if (Math.random() <= this.hazardWeatherRate) {
            this.createNaturalDisaster(~~(this.temperature / 5));
        }
        this.updateResources();
        this.updateViewer(this.selectedTile || this.tileMouseover);

        if (this.time % 100 == 0) console.log(`Emission: ${this.CO2Emission.toFixed(2)}, Temperature ${this.temperature.toFixed(2)}, Food: ${this.food.toFixed(0)}`);
    }

    checkLose() {
        if (this.buildings.length == 0) {
            this.pause();
            Swal.fire({
                title: "Game Over",
                html: "<img src='https://cdn.gearpatrol.com/wp-content/uploads/2012/12/guide-to-apocalypse-gear-patrol-lead-full.jpg' width=600px>",
                width: 700,
                showCancelButton: true,
                cancelButtonColor: "#26a4ff",
                cancelButtonText: "Try Again",
                showConfirmButton: true,
                confirmButtonText: "Why did I lose?",
                confirmButtonColor: "#8af725",
                allowOutsideClick: false,
                allowEscapeKey: false,
                allowEnterKey: false
            }).then(result => {
                if (result.dismiss == "cancel") {
                    window.location.reload();
                } else {
                    this.checkLose();
                    window.open("https://sites.google.com/view/ucsd-fight-climate-change/home");
                }
            });
        }
    }

    updateResources() {
        for (let tile of this.tiles) {
            tile.updateResource();
        }
    }

    calculateEmission() {
        let sum = 0;
        for (let building of this.buildings) {
            if (!building.functional) continue;
            switch (building.type) {
                case "Power Plant":
                    sum += 50;
                    break;
                case "Drill Platform":
                case "Oil Drill":
                    sum += 30;
                    break;
                case "Ranch":
                    sum += 5;
                    break;
            }
        }
        return sum
    }

    calculateEnergy() {
        for (let building of this.buildings) {
            if (!building.functional) continue;
            switch (building.type) {
                case "Power Plant":
                    this.totalEnergy += 1;
                    break;
                case "Drill Platform":
                case "Oil Drill":
                    this.totalEnergy += 0.5;
                    break;
                case "Solar Panel":
                case "Wind Turbine":
                    this.totalEnergy += 0.01;
                    break;
            }
        }
        this.totalEnergy = Math.min(MaxEnergy, this.totalEnergy);
        if (this.totalEnergy == MaxEnergy) this.win(); 
    }

    win() {
        this.pause();
        Swal.fire({
            title: "You Won!",
            imageUrl: 'https://i.imgur.com/HTIBIQv.png',
            imageWidth: 600,
            width: 700,
            html: `<div class="fb-share-button" 
            data-href="https://ucsdgame.dev/earth" 
            data-layout="button_count">
          </div>`,
            showCancelButton: true,
            cancelButtonColor: "#26a4ff",
            cancelButtonText: "Play Again",
            showConfirmButton: false,
            allowOutsideClick: false,
            allowEscapeKey: false,
            allowEnterKey: false
        }).then(result => {
            if (result.dismiss == "cancel") {
                window.location.reload();
            } else {
                this.win();
            }
        });
    }

    calculateFood() {
        for (let building of this.buildings) {
            if (!building.functional) continue;
            switch (building.type) {
                case "Ranch":
                    this.food += 1;
                    break;
                case "Fish Farm":
                    this.food += 0.8;
                    break;
            }
        }
        this.food = Math.min(this.food, MaxFood);
    }

    forestAbsorption() {
        let sum = 0;
        for (let building of this.buildings) {
            switch (building.type) {
                case "Forest":
                    sum += building.tile.resource.tree / 2000;
                    break;
            }
        }
        return Math.floor(sum)
    }

    createNaturalDisaster(times) {
        if (times <= 0 || this.time - this.lastNaturalDisaster < 3000 / gameTick / (1 + this.temperature / 5)) return;
        this.lastNaturalDisaster = this.time;
        console.log(`Disaster!! Rate: ${this.hazardWeatherRate}`);
        if (!this.ignoreDisaster) this.pause();
        /** @type {Tile} */
        let randomTile = select(this.buildings).tile;
        // console.log(randomTile.biome, randomTile.isOcean());
        if (!this.ignoreDisaster) this.viewport.snap(...randomTile.center, {interrupt: false,removeOnComplete: true, time: 500});
        let disaster;
        if (randomTile.isOcean()) {
            disaster = select(Disasters["ocean"]);
        } else {
            disaster = select(Disasters["land"]);
        }
        if (randomTile.building) randomTile.building.disable();
        if (!this.ignoreDisaster) this.disselect();
        randomTile.generateGraphics(true, true);
        if (this.ignoreDisaster) {
            randomTile.destroyBuilding();
            if (times >= 1) {
                this.createNaturalDisaster(times - 1);
            }
            setTimeout(() => randomTile.generateGraphics(), 1000);
            this.resume();
        } else {
            setTimeout(() => {
                Swal.fire({
                    title: disaster.name + (randomTile.building ? ` destroyed the ${randomTile.building.type} here`: ""),
                    html: `<img width=600 height=400 src="${disaster.url}">`,
                    width: 700,
                    showConfirmButton: false,
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    onBeforeOpen: () => {
                        randomTile.destroyBuilding();
                        setTimeout(() => {
                            if (times > 1) {
                                Swal.close();
                                this.resume();
                                this.createNaturalDisaster(times - 1);
                            } else {
                                Swal.close();
                                this.resume();
                            }
                            randomTile.generateGraphics();
                        }, 1500);
                    }
                }).then(() => {
                    this.resume();
                    randomTile.generateGraphics();
                })
            }, 800);
        }
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
        let land = 0;
        this.tiles.forEach(tile => { if (!tile.isOcean()) land++});
        MaxEnergy = MaxEnergy * land / 50;
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
        if (this.paused) return;
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
        if (this.paused) return;
        this.tileMouseover = tile;
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
        this.updateViewer(tile);
        tile.generateGraphics(true);
        this.lastMouseoverTile = tile;
    }

    updateViewer(tile) {
        if (!tile || !tile.resource) return
        let newText = tile.getText();
        this.tileViewer.clear();
        this.tileViewer.beginFill(0x000000, 0.5);
        this.tileViewer.drawRoundedRect(0, 0, ViewBox.x, ViewBox.y * newText.split("\n").length, 40);
        this.tileViewer.endFill();
        this.tileText.text = newText;
    }
}