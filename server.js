import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://api.n2yo.com/rest/v1/satellite";

// Cache for TLE data
let tleCache = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

//Fetch the latest TLE for a satellite by NORAD ID
async function fetchTLE(satId) {
    const url = `${BASE_URL}/tle/${satId}?apiKey=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data;
}


//Fetch calculated satellite positions for a given observer location
async function fetchPositions(satId, lat, lng, alt = 0, seconds = 60) {
    const url = `${BASE_URL}/positions/${satId}/${lat}/${lng}/${alt}/${seconds}?apiKey=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.positions; 
}

//Fetch all satellites above a location within a search radius
async function fetchAbove(lat, lng, alt = 0, radius = 90, category = 0) {
    const url = `${BASE_URL}/above/${lat}/${lng}/${alt}/${radius}/${category}?apiKey=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.above;
}

// Fetch and cache TLE data
async function fetchAndCacheTLEs() {
    console.log('Fetching fresh TLE data from API...');
    const satellites = await fetchAbove(41.702, -76.014, 0, 90, 0);
    
    const tlePromises = satellites.slice(0, 50).map(async (sat) => {
        try {
            const tleData = await fetchTLE(sat.satid);
            return tleData.tle;
        } catch (err) {
            console.error(`Failed to fetch TLE for ${sat.satid}:`, err.message);
            return null;
        }
    });
    
    const tles = (await Promise.all(tlePromises)).filter(Boolean);
    tleCache = tles.join('\n');
    cacheTime = Date.now();
    console.log(`Cached ${tles.length} TLEs`);
    return tleCache;
}

// API Routes
app.get('/tle/:satId', async (req, res) => {
    try {
        const data = await fetchTLE(req.params.satId);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/positions/:satId/:lat/:lng/:alt/:seconds', async (req, res) => {
    try {
        const { satId, lat, lng, alt, seconds } = req.params;
        const data = await fetchPositions(satId, lat, lng, alt, seconds);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/above/:lat/:lng/:alt/:radius/:category', async (req, res) => {
    try {
        const { lat, lng, alt, radius, category } = req.params;
        const data = await fetchAbove(lat, lng, alt, radius, category);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TLE endpoint that returns cached raw TLE data
app.get('/tle', async (req, res) => {
    try {
        // Return cached data if still valid
        if (tleCache && cacheTime && (Date.now() - cacheTime < CACHE_DURATION)) {
            console.log('Serving cached TLE data');
            res.set('Content-Type', 'text/plain');
            res.send(tleCache);
            return;
        }
        
        // Fetch fresh data
        const data = await fetchAndCacheTLEs();
        res.set('Content-Type', 'text/plain');
        res.send(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Prefetch TLEs on startup
fetchAndCacheTLEs().catch(err => {
    console.error('Failed to prefetch TLEs:', err);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});