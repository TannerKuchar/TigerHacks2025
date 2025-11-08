import * as satellite from '../node_modules/satellite.js';

let TLEs = [];

export async function loadTLEs() {
    console.log('Loading TLEs...');
    const response = await fetch('./satellite/tle.txt');
    const text = await response.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    TLEs = [];
    for (let i = 0; i < lines.length; i += 3) {
        TLEs.push({
            name: lines[i],
            line1: lines[i + 1],
            line2: lines[i + 2]
        });
    }
    console.log('Loaded TLEs:', TLEs);
}

export function getSatellitePositions() {
    const positions = [];
    const now = new Date();

    TLEs.forEach(tle => {
        const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
        const pv = satellite.propagate(satrec, now);
        if (!pv.position) return; // skip if invalid
        const gmst = satellite.gstime(now);
        const posGd = satellite.eciToGeodetic(pv.position, gmst);

        positions.push({
            name: tle.name,
            lat: satellite.degreesLat(posGd.latitude),
            lon: satellite.degreesLong(posGd.longitude),
            alt: posGd.height
        });
    });

    return positions;
}
