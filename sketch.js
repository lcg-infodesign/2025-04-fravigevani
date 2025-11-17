// VARIABILI GLOBALI
let table; 
let volcanoes = []; 
let glyphMap = {}; 
let minElevation = Infinity; 
let maxElevation = -Infinity; 
let minLat = Infinity; 
let maxLat = -Infinity; 
let minLon = Infinity; 
let maxLon = -Infinity; 

let activeTypeFilter = 'All Types'; 
let filterOptions = []; 
let uniqueCountries = []; 

// Variabili per la visualizzazione a livello di paese (Zoom)
let selectedVolcano = null; 
let activeCountryFilter = null;
let countryBounds = null; 

// Elementi UI HTML
let resetButton; 
// VARIABILE countrySelect RIMOSTA

// Colori per l'interpolazione dell'elevazione (basso -> alto)
const COLOR_LOW = '#66CCFF'; 
const COLOR_HIGH = '#FF6666'; 

// Parametri di layout e dimensioni del canvas/mappa
const LEGEND_HEIGHT = 90; 
const OUTER_MARGIN = 12; // Margine esterno per distanziare dai bordi
const INNER_PAD = 16; // Spaziatura tra i pannelli
const ELEVATION_SCALE_RATIO = 0.20; 

// DIMENSIONI GLIFI
const MIN_GLYPH_SIZE = 1.5; 
const MAX_GLYPH_SIZE = 8; 

// Larghezze dei pannelli laterali (Fisse)
const SIDEBAR_WIDTH = 180; 
const INFO_WIDTH = 320; 
const LEGEND_GUTTER = 24; 

let CANVAS_WIDTH;
let CANVAS_HEIGHT;

// Larghezze e altezze massime calcolate in setup()
let MAP_WIDTH_MAX;
let MAP_HEIGHT_MAX;
let MAP_INNER_MARGIN = 20; 

let mapYOffset = 0; 
let mapXStart = 0; 

function preload() {
    // Loading the CSV table with headers
    table = loadTable('volcanoes-2025-10-27 - Es.3 - Original Data.csv', 'csv', 'header');
}

// --- FUNZIONI DI PROIEZIONE E HELPERS ---

/**
 * Funzioni essenziali per mappare le coordinate geografiche 
 * all'interno del riquadro del paese in modalità zoom.
 */
function projectCountryX(lon, mapW) {
    if (!countryBounds) return -999; 
    return map(lon, countryBounds.minLon, countryBounds.maxLon, MAP_INNER_MARGIN, mapW - MAP_INNER_MARGIN);
}

function projectCountryY(lat, mapH) {
    if (!countryBounds) return -999;
    // La latitudine è invertita (alto = nord)
    return map(lat, countryBounds.minLat, countryBounds.maxLat, mapH - MAP_INNER_MARGIN, MAP_INNER_MARGIN);
}


function inverseProjectX(x, isZoomed, mapW) { 
    const left = MAP_INNER_MARGIN;
    const right = mapW - MAP_INNER_MARGIN;
    
    if (isZoomed && countryBounds) {
        return map(x, left, right, countryBounds.minLon, countryBounds.maxLon);
    } else {
        return map(x, left, right, minLon, maxLon);
    }
}

function inverseProjectY(y, isZoomed, mapH) {
    const top = MAP_INNER_MARGIN;
    const bottom = mapH - MAP_INNER_MARGIN;
    
    if (isZoomed && countryBounds) {
        return map(y, bottom, top, countryBounds.minLat, countryBounds.maxLat);
    } else {
        return map(y, bottom, top, minLat, maxLat);
    }
}

function calculateCountryBounds(country) {
    let countryMinLat = Infinity, countryMaxLat = -Infinity; 
    let countryMinLon = Infinity, countryMaxLon = -Infinity; 
    
    const countryVolcanoes = volcanoes.filter(v => v.country === country);

    countryVolcanoes.forEach(v => {
        countryMinLat = min(countryMinLat, v.lat);
        countryMaxLat = max(countryMaxLat, v.lat);
        countryMinLon = min(countryMinLon, v.lon);
        countryMaxLon = max(countryMaxLon, v.lon);
    });

    // Aggiungi padding
    const latRange = countryMaxLat - countryMinLat;
    const lonRange = countryMaxLon - countryMinLon;
    const latPad = latRange > 0 ? latRange * 0.15 : 5;
    const lonPad = lonRange > 0 ? lonRange * 0.15 : 5;
    
    countryMinLat -= latPad;
    countryMaxLat += latPad;
    countryMinLon -= lonPad;
    countryMaxLon += lonPad;
    
    // Assicura un range minimo per i paesi con un solo vulcano o cluster molto denso
    if (countryMaxLat - countryMinLat < 1) { countryMinLat -= 1; countryMaxLat += 1; }
    if (countryMaxLon - countryMinLon < 1) { countryMinLon -= 1; countryMaxLon += 1; }

    return { minLat: countryMinLat, maxLat: countryMaxLat, minLon: countryMinLon, maxLon: countryMaxLon };
}

function getColorForElevation(elevation) { 
    let normalizedElevation = map(elevation, minElevation, maxElevation, 0, 1);
    let lowColor = color(COLOR_LOW);
    let highColor = color(COLOR_HIGH);
    return lerpColor(lowColor, highColor, normalizedElevation);
}

function initializeGlyphMap() {
    const uniqueTypes = [...new Set(volcanoes.map(v => v.type))].sort();
    const fallbackIndex = 4;

    function idxForType(type) {
        const t = type.toLowerCase();
        if (t.includes('caldera')) return 0;
        if (t.includes('cone') || t.includes('cinder')) return 1;
        if (t.includes('crater system') || t.includes('crater')) return 2;
        if (t.includes('maar') || t.includes('maars')) return 3;
        if (t.includes('other') || t.includes('unknown') || t.includes('others')) return 4;
        if (t.includes('shield')) return 5;
        if (t.includes('stratov') || t.includes('strato') || t.includes('composite')) return 6;
        if (t.includes('subglacial')) return 7;
        if (t.includes('submarine') || t.includes('seamount')) return 8;
        return fallbackIndex;
    }

    uniqueTypes.forEach(type => {
        glyphMap[type] = idxForType(type);
    });
}

function drawGlyph(x, y, glyphIndex, s, vElevation) { 
    push();
    translate(x, y);
    rectMode(CENTER);
    noStroke();
    
    const baseColor = getColorForElevation(vElevation);
    fill(baseColor);

    switch (glyphIndex) {
        case 0: // Caldera: circle
            ellipse(0, 0, s * 2.0, s * 2.0);
            break;
        case 1: // Cone: triangle
            triangle(-s*0.9, s*0.8, s*0.9, s*0.8, 0, -s*1.1);
            break;
        case 2: // Crater System: three horizontal stepped segments
            for (let i = 0; i < 3; i++) {
                const w = s * (1.0 - i * 0.20);
                const h = s * 0.12;
                rect(0, -s*0.28 + i * (h + 1.5), w, h, 3);
            }
            break;
        case 3: // Maars: four-point star
            push();
            rotate(45);
            rect(0, 0, s * 0.18, s * 0.8, 2);
            pop();
            rect(0, 0, s * 0.18, s * 0.8, 2);
            push();
            rotate(90);
            rect(0, 0, s * 0.14, s * 0.6, 2);
            pop();
            break;
        case 4: // Others: diamond
            push();
            rotate(45);
            rect(0, 0, s * 0.6, s * 0.6);
            pop();
            break;
        case 5: // Shield: wide ellipse
            ellipse(0, s*0.06, s * 1.2, s * 0.5);
            break;
        case 6: // Stratovolcano: three stacked rectangles (Colore uniforme come richiesto)
            rect(0, s*0.35, s * 0.9, s * 0.18, 2);
            rect(0, s*0.05, s * 0.65, s * 0.18, 2);
            rect(0, -s*0.18, s * 0.35, s * 0.18, 2);
            break;
        case 7: // Subglacial: square
            rect(0, 0, s * 0.9, s * 0.9);
            break;
        case 8: // Submarine: triangle with wave
            triangle(-s*0.8, s*0.5, s*0.8, s*0.5, 0, -s*0.8);
            
            // Il colore del contorno marino è gestito qui
            stroke(lerpColor(color(COLOR_LOW), color(COLOR_HIGH), 0.25));
            strokeWeight(max(1, s * 0.06));
            noFill();
            
            push(); 
            translate(0, -s*1.0); 
            
            beginShape();
            vertex(-s*0.4, 0); 
            quadraticVertex(0, -s*0.2, s*0.4, 0); 
            endShape();
            pop(); 
            
            noStroke();
            break;
        default: // Fallback: simple circle
            ellipse(0, 0, s * 0.6, s * 0.6);
            break;
    }
    pop();
}

// Disegna le righe incrociate di latitudine/longitudine (Crosshair)
function drawCrosshairs(w, h, isZoomed) {
    push();
    // Sposta il sistema di coordinate all'interno della mappa
    const mxLocal = mouseX - mapXStart;
    const myLocal = mouseY - mapYOffset;
    
    // Colore più discreto
    stroke('#555555'); 
    strokeWeight(1);
    
    // Linee
    line(mxLocal, 0, mxLocal, h); 
    line(0, myLocal, w, myLocal);

    // Etichette 
    const isOverMap = mouseX > mapXStart + MAP_INNER_MARGIN && mouseX < mapXStart + w - MAP_INNER_MARGIN &&
                     mouseY > mapYOffset + MAP_INNER_MARGIN && mouseY < mapYOffset + h - MAP_INNER_MARGIN;

    if (isOverMap) {
        // Usa le dimensioni attuali della mappa per la proiezione inversa
        let lat = inverseProjectY(myLocal, isZoomed, h); 
        let lon = inverseProjectX(mxLocal, isZoomed, w);
        
        // LONGITUDE LABEL
        push();
        rectMode(CENTER);
        fill('#0A0A0A');
        stroke('#222');
        rect(mxLocal, h + 12, 110, 20, 4);
        noStroke();
        fill('#FFFFFF');
        textSize(12);
        textAlign(CENTER, CENTER);
        text(`Lon: ${nf(lon, 0, 4)}°`, mxLocal, h + 12);
        pop();

        // LATITUDE LABEL 
        const latLabelX = - (20 / 2 + 2); 
        
        push();
        translate(latLabelX, myLocal);
        rotate(90);
        
        rectMode(CENTER);
        fill('#0A0A0A');
        stroke('#222');
        rect(0, 0, 110, 20, 4); 
        
        noStroke();
        fill('#FFFFFF');
        textSize(12);
        textAlign(CENTER, CENTER);
        text(`Lat: ${nf(lat, 0, 4)}°`, 0, 0); 
        
        pop(); 
    }
    
    pop();
}

// --- FUNZIONI DI DISEGNO PANNELLI ---

function drawFilterPanel(x, y, w, h) { 
    push();
    translate(x, y);
    noStroke();
    fill('#1E1E1E');
    rect(0, 0, w, h, 6);

    fill('#FFF');
    textSize(16);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    text("Filtro per Tipo", INNER_PAD, 10);

    const startY = 36;
    const itemH = 32;
    const glyphPanelSize = 10; 
    const glyphX = INNER_PAD + 10; 
    const textX = glyphX + glyphPanelSize + 6; 

    for (let i = 0; i < filterOptions.length; i++) {
        const type = filterOptions[i];
        const itemY = startY + i * itemH;
        const isSelected = type === activeTypeFilter;
        const centerGlyphY = itemY + itemH / 2;
        
        const hover = mouseX > x && mouseX < x + w && mouseY > y + itemY && mouseY < y + itemY + itemH;

        if (isSelected || hover) {
            fill(isSelected ? '#333333' : '#282828');
            rect(INNER_PAD / 2, itemY, w - INNER_PAD, itemH, 4);
        }

        if (type !== 'All Types') {
            const glyphIndex = glyphMap[type];
            fill('#FFFFFF'); 
            stroke('#121212');
            strokeWeight(0.5);
            // Uso l'elevazione media per colorare i glifi nella sidebar (non è importante qui)
            drawGlyph(glyphX, centerGlyphY, glyphIndex, glyphPanelSize / 2, (minElevation + maxElevation) / 2); 
        } else {
            fill('#AAAAAA');
            ellipse(glyphX, centerGlyphY, 6, 6);
        }

        fill(isSelected ? '#FFFFFF' : '#AAAAAA');
        textSize(12); 
        textStyle(isSelected ? BOLD : NORMAL);
        textAlign(LEFT, CENTER);
        text(type, textX, centerGlyphY);
    }
    pop();
}

function drawInfoPanel(x, y, panelW, panelH, infoSource) { 
    push();
    translate(x, y);
    noStroke();
    fill('#1E1E1E');
    rect(0, 0, panelW, panelH, 6);

    fill('#FFF');
    textSize(16);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    text("Dettagli Vulcano", INNER_PAD, 10);

    const fields = [
        { key: 'name', label: 'Nome' },
        { key: 'country', label: 'Nazione' }, 
        { key: 'location', label: 'Località' },
        { key: 'lat', label: 'Latitudine' },
        { key: 'lon', label: 'Longitudine' },
        { key: 'elevation', label: 'Elevazione' },
        { key: 'type', label: 'Tipo' },
        { key: 'status', label: 'Stato' }
    ];

    const startY = 36;
    const availableH = panelH - startY - INNER_PAD;
    const gap = 8;
    const boxH = Math.max(28, (availableH - gap * (fields.length - 1)) / fields.length);
    const boxX = INNER_PAD;
    const boxW = panelW - INNER_PAD * 2;

    textSize(12);
    textStyle(NORMAL);
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const y = startY + i * (boxH + gap);

        push();
        stroke('#333333');
        strokeWeight(1);
        fill('#0A0A0A');
        rect(boxX, y, boxW, boxH, 6);
        pop();

        fill('#AAAAAA');
        textSize(11);
        textAlign(LEFT, TOP);
        text(f.label, boxX + 8, y + 6);

        if (infoSource && infoSource.v) {
            const info = infoSource.v;
            let value = info[f.key];
            if (f.key === 'lat' || f.key === 'lon') {
                value = typeof value === 'number' ? nf(value, 0, 4) : (value || '—');
            } else if (f.key === 'elevation') {
                value = (value !== undefined && value !== null) ? `${value} m` : '—';
            } else {
                value = value || '—';
            }

            // Scritta sempre bianca 
            fill('#FFFFFF'); 

            textSize(13);
            textStyle(BOLD);
            textAlign(LEFT, TOP);
            text(value, boxX + 8, y + 6 + 14);
            textStyle(NORMAL);
        } else {
             fill('#FFFFFF');
             textSize(13);
             textStyle(BOLD);
             textAlign(LEFT, TOP);
             text('—', boxX + 8, y + 6 + 14);
             textStyle(NORMAL);
        }
    }

    pop();
}

function drawLegend(xOffset, yOffset, width, height, hoverVolcano) {
    push();
    translate(xOffset + INNER_PAD, yOffset);
    
    // Title
    fill('#FFF');
    textSize(18);
    textStyle(BOLD);
    textAlign(LEFT);
    text("Legenda", 0, 15);

    let cursorX = 0;
    let cursorY = 32;

    // Sezione Colore (Elevazione)
    textSize(14);
    textStyle(NORMAL);
    fill('#FFF');
    text("Colore (Elevazione):", cursorX, cursorY);
    cursorY += 18;

    // La barra del gradiente ora usa width come riferimento
    const BAR_W = width - (cursorX + 2 * INNER_PAD); 
    const BAR_H = 14;
    for (let i = 0; i < BAR_W; i++) {
        let inter = map(i, 0, BAR_W, 0, 1);
        let c = lerpColor(color(COLOR_LOW), color(COLOR_HIGH), inter);
        stroke(c);
        line(cursorX + i, cursorY + BAR_H, cursorX + i, cursorY);
    }
    noStroke();
    
    // Lineetta Gialla di Riferimento Elevazione 
    const volcanoForLegend = hoverVolcano || (selectedVolcano ? {v: selectedVolcano} : null);

    if (volcanoForLegend && volcanoForLegend.v) {
        const elevation = volcanoForLegend.v.elevation;
        let normalizedElevation = map(elevation, minElevation, maxElevation, 0, 1);
        // Calcola la posizione X sulla barra
        const markerX = cursorX + normalizedElevation * BAR_W;
        
        stroke('#FFD700'); // Giallo
        strokeWeight(1.0); // Spessore ridotto
        line(markerX, cursorY - 2, markerX, cursorY + BAR_H + 2);
        
        // Etichetta elevazione
        fill('#FFD700');
        textSize(12);
        textAlign(CENTER, BOTTOM);
        text(`${nf(elevation, 0, 0)} m`, markerX, cursorY - 4);
        
        noStroke();
    }


    fill('#FFF');
    textSize(10);
    textAlign(LEFT, TOP);
    text(`${nf(minElevation, 0, 0)} m (Basso)`, cursorX, cursorY + BAR_H + 8);
    textAlign(RIGHT, TOP);
    text(`${nf(maxElevation, 0, 0)} m (Alto)`, cursorX + BAR_W, cursorY + BAR_H + 8);
    
    pop();
}


// --- FUNZIONE SETUP E CONTROLLI HTML ---

function setupControls() {
    // 1. Pulsante di Reset (Visualizza Tutti i Vulcani)
    resetButton = createButton('Visualizza Tutti i Vulcani (Reset)');
    resetButton.parent('resetButtonContainer');
    resetButton.style('padding', '8px 12px');
    resetButton.style('background-color', '#333333');
    resetButton.style('color', 'white');
    resetButton.style('border', '1px solid #555555');
    resetButton.style('border-radius', '4px');
    resetButton.style('cursor', 'pointer');
    resetButton.style('box-shadow', '0 2px 5px rgba(0, 0, 0, 0.5)');
    resetButton.style('display', 'none'); 
    
    resetButton.mousePressed(() => {
        selectedVolcano = null;
        activeCountryFilter = null;
        countryBounds = null;
        activeTypeFilter = 'All Types'; // Reset anche del filtro per tipo
        redraw();
    });

    // RIMOZIONE DEL MENU A TENDINA countrySelect
}

function setup() {
    CANVAS_WIDTH = windowWidth;
    CANVAS_HEIGHT = windowHeight;
    
    // Spazio disponibile in altezza per la mappa
    const AVAILABLE_HEIGHT = CANVAS_HEIGHT - LEGEND_HEIGHT - 2 * OUTER_MARGIN - LEGEND_GUTTER;
    
    // Spazio orizzontale disponibile per la mappa (tra i pannelli)
    const availableWidthForMapArea = CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - 2 * INNER_PAD;
    
    // Calcolo dimensioni Mappa massime (2:1 ratio)
    const MAX_MAP_H = max(60, AVAILABLE_HEIGHT - (INNER_PAD * 2));
    const mapWBasedOnHeight = MAX_MAP_H * 2;
    
    MAP_WIDTH_MAX = min(availableWidthForMapArea, mapWBasedOnHeight);
    MAP_HEIGHT_MAX = MAP_WIDTH_MAX / 2; 

    // Assicurati che le dimensioni minime siano rispettate
    MAP_WIDTH_MAX = max(200, MAP_WIDTH_MAX);
    MAP_HEIGHT_MAX = max(100, MAP_HEIGHT_MAX);
    
    // Create canvas
    createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    angleMode(DEGREES);
    noLoop(); 
    
    // Processamento dati
    let countries = new Set();
    for (let i = 0; i < table.getRowCount(); i++) {
        const row = table.getRow(i);
        const lat = parseFloat(row.getString('Latitude'));
        const lon = parseFloat(row.getString('Longitude'));
        const elevationStr = row.getString('Elevation (m)');
        const type = row.getString('TypeCategory').trim(); 
        const country = row.getString('Country');
        
        let elevation = parseFloat(elevationStr);
        if (isNaN(lat) || isNaN(lon) || type === '' || isNaN(elevation)) continue;

        const volcano = {
            // ID univoco mantenuto per correggere i vulcani "unnamed"
            id: i, 
            name: row.getString('Volcano Name'),
            country: country,
            location: row.getString('Location'),
            lat: lat,
            lon: lon,
            elevation: elevation,
            type: type,
            status: row.getString('Status')
        };
        volcanoes.push(volcano);
        countries.add(country);
        
        if (elevation > maxElevation) maxElevation = elevation;
        if (elevation < minElevation) minElevation = elevation;
        if (lat > maxLat) maxLat = lat;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lon < minLon) minLon = lon;
    }

    // Fallback checks
    if (!isFinite(minLat) || !isFinite(maxLat)) { minLat = -60; maxLat = 60; }
    if (!isFinite(minLon) || !isFinite(maxLon)) { minLon = -180; maxLon = 180; }
    if (maxLat - minLat < 1) { minLat -= 1; maxLat += 1; }
    if (maxLon - minLon < 1) { minLon -= 1; maxLon += 1; }
    
    // Calcolo dimensione glifo in base all'elevazione (scaled radius)
    volcanoes = volcanoes.map(v => {
        let normElevation = map(v.elevation, minElevation, maxElevation, 0, 1);
        normElevation = pow(normElevation, 0.6); 
        v.scaledRadius = map(normElevation, 0, 1, MIN_GLYPH_SIZE, MAX_GLYPH_SIZE);
        return v;
    });

    initializeGlyphMap();
    const uniqueTypes = [...new Set(volcanoes.map(v => v.type))].sort();
    filterOptions = ['All Types', ...uniqueTypes];
    uniqueCountries = Array.from(countries).sort();
    
    setupControls();
}

// --- FUNZIONE DRAW PRINCIPALE ---

function draw() {
    background('#121212'); 

    // 1. Calcolo Posizioni e Dimensioni Dinamiche
    const AVAILABLE_Y_START = LEGEND_HEIGHT + OUTER_MARGIN + LEGEND_GUTTER;
    const AVAILABLE_Y_END = CANVAS_HEIGHT - OUTER_MARGIN;
    
    // Calcolo Y di offset della visualizzazione principale (centrata verticalmente)
    mapYOffset = AVAILABLE_Y_START + (AVAILABLE_Y_END - AVAILABLE_Y_START - (MAP_HEIGHT_MAX + INNER_PAD * 2)) / 2; 

    // Larghezza e altezza della mappa attuale (Massima)
    let currentMapWidth = MAP_WIDTH_MAX;
    let currentMapHeight = MAP_HEIGHT_MAX;
    let isZoomed = selectedVolcano !== null;
    
    // Ricalcola i limiti del paese se si è in zoom e non sono ancora stati definiti.
    if (isZoomed) {
        if (!countryBounds && activeCountryFilter) {
             countryBounds = calculateCountryBounds(activeCountryFilter);
        }
    } 
    
    // Posizioni Pannelli (Allineati all'altezza della mappa attuale)
    const filterPanelX = OUTER_MARGIN;
    const detailsPanelW = INFO_WIDTH - OUTER_MARGIN; // Larghezza pannello Info
    const detailsPanelX = CANVAS_WIDTH - OUTER_MARGIN - detailsPanelW;

    const filterPanelY = mapYOffset;
    const filterPanelW = SIDEBAR_WIDTH - OUTER_MARGIN; 
    const filterPanelH = currentMapHeight + INNER_PAD * 2; 
    const detailsPanelY = mapYOffset;
    const detailsPanelH = currentMapHeight + INNER_PAD * 2;
    
    // 2. Calcolo posizione X di inizio della Mappa 
    const totalVisWidth = MAP_WIDTH_MAX; 
    mapXStart = OUTER_MARGIN + SIDEBAR_WIDTH + INNER_PAD;


    // 3. Disegno Legenda e Pannelli
    const hoverVolcano = findHoveredVolcano(currentMapWidth, currentMapHeight, isZoomed); 
    drawLegend(OUTER_MARGIN, OUTER_MARGIN, CANVAS_WIDTH - 2 * OUTER_MARGIN, LEGEND_HEIGHT - 2 * OUTER_MARGIN, hoverVolcano);
    drawFilterPanel(filterPanelX, filterPanelY, filterPanelW, filterPanelH);

    
    // 4. Disegno Mappa Principale
    push();
    translate(mapXStart, mapYOffset);

    // Titolo
    fill('#FFF'); noStroke(); textSize(18); textStyle(BOLD); textAlign(LEFT, BOTTOM);
    const baseTitleText = isZoomed 
        ? `Vulcano in ` 
        : "Distribuzione Globale dei Vulcani";
    text(baseTitleText, 0, -8);
    
    if (isZoomed) {
        push();
        const titleW = textWidth(baseTitleText);
        const countryName = activeCountryFilter;
        fill('#FFD700'); 
        // Etichetta paese (non più cliccabile)
        text(countryName, titleW, -8);
        pop();
    }
    
    // Sfondo Mappa
    fill('#000000'); 
    rect(0, 0, currentMapWidth, currentMapHeight); 
    noFill();
    stroke('#333333');
    strokeWeight(1);
    rect(0, 0, currentMapWidth, currentMapHeight);
    
    // Vulcani da disegnare 
    const volcanoesToDraw = isZoomed ? volcanoes.filter(v => v.country === activeCountryFilter) : volcanoes;
    
    // Loop di disegno dei Vulcani
    for (const v of volcanoesToDraw) {
        if (activeTypeFilter !== 'All Types' && v.type !== activeTypeFilter) continue;

        let xLocal, yLocal;
        if (isZoomed) {
            xLocal = projectCountryX(v.lon, currentMapWidth);
            yLocal = projectCountryY(v.lat, currentMapHeight);
        } else {
            // Proiezioni globali standard
            xLocal = map(v.lon, minLon, maxLon, MAP_INNER_MARGIN, MAP_WIDTH_MAX - MAP_INNER_MARGIN);
            yLocal = map(v.lat, minLat, maxLat, MAP_HEIGHT_MAX - MAP_INNER_MARGIN, MAP_INNER_MARGIN); 
        }
        
        // Se in modalità zoom, salta i vulcani che finiscono fuori dall'area del riquadro di disegno
        if (isZoomed && countryBounds && (xLocal < MAP_INNER_MARGIN || xLocal > currentMapWidth - MAP_INNER_MARGIN || yLocal < MAP_INNER_MARGIN || yLocal > currentMapHeight - MAP_INNER_MARGIN)) {
            continue;
        }

        // Determina se il vulcano è selezionato, in hover, o base
        const isSelected = isZoomed && selectedVolcano && v.id === selectedVolcano.id; 
        const isHovered = hoverVolcano && v.id === hoverVolcano.v.id; 
        
        // Disegna il glifo base
        fill(getColorForElevation(v.elevation)); 
        stroke('#121212'); 
        strokeWeight(0.5);
        drawGlyph(xLocal, yLocal, glyphMap[v.type], v.scaledRadius, v.elevation);

        // Highlight vulcano selezionato (sempre in zoom)
        if (isSelected) {
            push();
            const glowSize = v.scaledRadius * 1.5; 
            fill(lerpColor(getColorForElevation(v.elevation), color('#FFFFFF'), 0.55));
            stroke('#FFFFFF');
            strokeWeight(1.5);
            drawGlyph(xLocal, yLocal, glyphMap[v.type], glowSize, v.elevation);
            pop();
        }
        
        // Highlight vulcano in hover
        if (isHovered && !isSelected) {
             push();
             const glowSize = v.scaledRadius * 1.8;
             fill(lerpColor(getColorForElevation(v.elevation), color('#FFFFFF'), 0.55));
             stroke('#FFFFFF');
             strokeWeight(1.5);
             drawGlyph(xLocal, yLocal, glyphMap[v.type], glowSize, v.elevation);
             pop();
        }
    }
    
    
    // DISEGNA CROSSHAIRS E ETICHETTE LAT/LON (Solo se sopra la mappa)
    const isMouseOverMap = mouseX > mapXStart && mouseX < mapXStart + currentMapWidth && mouseY > mapYOffset && mouseY < mapYOffset + currentMapHeight;
    if (isMouseOverMap) {
        drawCrosshairs(currentMapWidth, currentMapHeight, isZoomed);
    }
    
    pop(); // Fine Mappa Principale
    
    // 5. Disegno Pannello Dettagli 
    const infoSource = hoverVolcano ? hoverVolcano : (selectedVolcano ? {v: selectedVolcano} : null);
    drawInfoPanel(detailsPanelX, detailsPanelY, detailsPanelW, detailsPanelH, infoSource);
    
    // 6. Posizionamento Pulsante Reset
    
    // Istruzione per tornare alla vista globale (se in zoom)
    if (isZoomed) {
        push();
        fill('#AAAAAA'); 
        textSize(12);
        textAlign(CENTER, TOP);
        const instructionY = mapYOffset + currentMapHeight + INNER_PAD / 2;
        const instructionX = mapXStart + currentMapWidth / 2;
        text("Premi sulla mappa per tornare a tutti i paesi.", instructionX, instructionY);
        pop();
    }
    
    if (resetButton) {
        // Posizionamento al centro orizzontale sotto la visualizzazione principale
        const buttonX = mapXStart + (totalVisWidth - resetButton.width) / 2;
        const buttonY = mapYOffset + currentMapHeight + INNER_PAD * 2 + 8;
        
        resetButton.position(buttonX, buttonY);
        // Mostra il pulsante se si è in zoom O se è attivo un filtro per tipo
        resetButton.style('display', (isZoomed || activeTypeFilter !== 'All Types') ? 'block' : 'none');
    }
    // La logica di posizionamento del countrySelect è stata rimossa
}

// Funzione helper per trovare il vulcano in hover
function findHoveredVolcano(mapW, mapH, isZoomed) {
    let hovered = null;
    let minD = Infinity;
    
    const volcanoesToSearch = isZoomed ? volcanoes.filter(v => v.country === activeCountryFilter) : volcanoes;
    
    if (isZoomed && !countryBounds && activeCountryFilter) {
         countryBounds = calculateCountryBounds(activeCountryFilter);
    }
    
    for (const v of volcanoesToSearch) {
        if (activeTypeFilter !== 'All Types' && v.type !== activeTypeFilter) continue;

        let xLocal, yLocal;
        if (isZoomed) {
            xLocal = projectCountryX(v.lon, mapW);
            yLocal = projectCountryY(v.lat, mapH);
        } else {
            xLocal = map(v.lon, minLon, maxLon, MAP_INNER_MARGIN, MAP_WIDTH_MAX - MAP_INNER_MARGIN);
            yLocal = map(v.lat, minLat, maxLat, MAP_HEIGHT_MAX - MAP_INNER_MARGIN, MAP_INNER_MARGIN); 
        }
        
        const xGlobal = mapXStart + xLocal;
        const yGlobal = mapYOffset + yLocal;
        const d = dist(mouseX, mouseY, xGlobal, yGlobal);
        const hitR = v.scaledRadius * 2; 
        
        if (d < hitR && d < minD) {
            minD = d;
            // Usa l'ID univoco per identificare il vulcano in hover
            hovered = { v: v, xLocal: xLocal, yLocal: yLocal, glyphIndex: glyphMap[v.type] };
        }
    }
    return hovered;
}


// --- FUNZIONE MOUSE PRESSED (Logica Interattiva) ---

function mousePressed() {
    // 1. Gestione click sul pannello di filtro (LEFT SIDEBAR)
    const filterPanelX = OUTER_MARGIN;
    const filterPanelY = mapYOffset;
    const filterPanelW = SIDEBAR_WIDTH - OUTER_MARGIN; 
    const itemH = 32;
    const startY = 36;
    
    if (mouseX > filterPanelX && mouseX < filterPanelX + filterPanelW && mouseY > filterPanelY + startY && mouseY < filterPanelY + startY + filterOptions.length * itemH) {
        const relativeY = mouseY - (filterPanelY + startY);
        const index = floor(relativeY / itemH);
        
        if (index >= 0 && index < filterOptions.length) {
            activeTypeFilter = filterOptions[index];
            redraw(); 
            return;
        }
    }
    
    // 2. La logica di gestione del click sull'etichetta del paese è stata RIMOSTA.

    // 3. Gestione click sulla mappa (SELEZIONE VULCANO / ZOOM)
    let currentMapWidth = MAP_WIDTH_MAX;
    let currentMapHeight = MAP_HEIGHT_MAX;
    let isZoomed = selectedVolcano !== null;
    
    const overMap = mouseX >= mapXStart && mouseX <= mapXStart + currentMapWidth && mouseY >= mapYOffset && mouseY <= mapYOffset + currentMapHeight; 

    if (overMap) {
        let clickedVolcano = null;
        let minD = Infinity;
        
        const volcanoesToSearch = isZoomed ? volcanoes.filter(v => v.country === activeCountryFilter) : volcanoes;
        
        if (isZoomed && !countryBounds && activeCountryFilter) {
             countryBounds = calculateCountryBounds(activeCountryFilter);
        }
        
        // Trova il vulcano cliccato
        for (const v of volcanoesToSearch) {
            if (activeTypeFilter !== 'All Types' && v.type !== activeTypeFilter) continue;

            let xLocal, yLocal;
            if (isZoomed) {
                xLocal = projectCountryX(v.lon, currentMapWidth);
                yLocal = projectCountryY(v.lat, currentMapHeight);
            } else {
                xLocal = map(v.lon, minLon, maxLon, MAP_INNER_MARGIN, MAP_WIDTH_MAX - MAP_INNER_MARGIN);
                yLocal = map(v.lat, minLat, maxLat, MAP_HEIGHT_MAX - MAP_INNER_MARGIN, MAP_INNER_MARGIN); 
            }
            
            const xGlobal = mapXStart + xLocal;
            const yGlobal = mapYOffset + yLocal;
            const d = dist(mouseX, mouseY, xGlobal, yGlobal);
            const hitR = v.scaledRadius * 2; 
            
            if (d < minD && d < hitR) {
                minD = d;
                clickedVolcano = v;
            }
        }
        
        // Logica di Selezione/Deselezione (Zoom)
        if (clickedVolcano) {
            if (selectedVolcano && clickedVolcano.id === selectedVolcano.id && isZoomed) { 
                // Torna a vista globale se cliccato due volte sullo stesso in zoom
                selectedVolcano = null;
                activeCountryFilter = null;
                countryBounds = null;
            } else if (isZoomed && clickedVolcano.country === activeCountryFilter) {
                 // Aggiorna la selezione all'interno dello stesso paese
                 selectedVolcano = clickedVolcano;
            } else {
                // Inizia nuova selezione (entra in modalità zoom)
                selectedVolcano = clickedVolcano;
                activeCountryFilter = clickedVolcano.country;
                countryBounds = null; // Forza il ricalcolo in draw()
            }
            redraw(); 
        } else if (isZoomed) {
            // Cliccato sulla mappa ingrandita ma non su un vulcano -> Torna a vista globale
            selectedVolcano = null;
            activeCountryFilter = null;
            countryBounds = null;
            redraw();
        }
    }
}

function mouseMoved() {
    redraw();
}

function mouseDragged() {
    redraw();
}

function windowResized() {
    CANVAS_WIDTH = windowWidth;
    CANVAS_HEIGHT = windowHeight;
    
    // Ricalcolo le dimensioni massime della mappa
    const AVAILABLE_HEIGHT = CANVAS_HEIGHT - LEGEND_HEIGHT - 2 * OUTER_MARGIN - LEGEND_GUTTER;
    const availableWidthForMapArea = CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - 2 * INNER_PAD;
    
    const MAX_MAP_H = max(60, AVAILABLE_HEIGHT - (INNER_PAD * 2));
    const mapWBasedOnHeight = MAX_MAP_H * 2;
    
    MAP_WIDTH_MAX = min(availableWidthForMapArea, mapWBasedOnHeight);
    MAP_HEIGHT_MAX = MAP_WIDTH_MAX / 2; 

    MAP_WIDTH_MAX = max(200, MAP_WIDTH_MAX);
    MAP_HEIGHT_MAX = max(100, MAP_HEIGHT_MAX);

    resizeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    redraw(); 
}