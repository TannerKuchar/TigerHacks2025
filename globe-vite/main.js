import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStarfield from "./src/getStarfield.js";
import { getFresnelMat } from "./src/getFresnelMat.js";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});

async function initializeFavoritesTable() {

}

let showAllOrbits = true;
let showAllCoverage = true;
let orbitLines = []; 
let coverageCircles = []; 

// Add these functions to handle the toggles
function toggleAllOrbits() {
  showAllOrbits = !showAllOrbits;
  
  // Update all existing orbit lines
  orbitLines.forEach(orbitLine => {
    if (orbitLine) {
      orbitLine.visible = showAllOrbits;
    }
  });
  
  // Update button text
  const toggleOrbitsBtn = document.getElementById('toggle-orbits-btn');
  if (toggleOrbitsBtn) {
    toggleOrbitsBtn.textContent = showAllOrbits ? 'Hide Orbits' : 'Show Orbits';
  }
  
  // Handle active satellite specifically
  if (activeSatellite) {
    if (!showAllOrbits && activeSatellite.userData.orbitLine) {
      // Remove active satellite's orbit when toggling off
      scene.remove(activeSatellite.userData.orbitLine);
      activeSatellite.userData.orbitLine.geometry.dispose();
      activeSatellite.userData.orbitLine.material.dispose();
      delete activeSatellite.userData.orbitLine;
    } else if (showAllOrbits && !activeSatellite.userData.orbitLine) {
      // Redraw active satellite's orbit when toggling on
      drawSatelliteOrbit(activeSatellite.userData.index);
    }
  }
}

function toggleAllCoverage() {
  showAllCoverage = !showAllCoverage;
  
  // Update all existing coverage circles
  coverageCircles.forEach(coverageCircle => {
    if (coverageCircle) {
      coverageCircle.visible = showAllCoverage;
    }
  });
  
  // Update button text
  const toggleCoverageBtn = document.getElementById('toggle-coverage-btn');
  if (toggleCoverageBtn) {
    toggleCoverageBtn.textContent = showAllCoverage ? 'Hide Coverage' : 'Show Coverage';
  }
  
  // Handle active satellite specifically
  if (activeSatellite) {
    if (!showAllCoverage && activeSatellite.userData.coverageCircle) {
      // Remove active satellite's coverage when toggling off
      scene.remove(activeSatellite.userData.coverageCircle);
      activeSatellite.userData.coverageCircle.geometry.dispose();
      activeSatellite.userData.coverageCircle.material.dispose();
      delete activeSatellite.userData.coverageCircle;
    } else if (showAllCoverage && !activeSatellite.userData.coverageCircle) {
      // Redraw active satellite's coverage when toggling on
      drawCoverageCircle(activeSatellite);
    }
  }
}

// Get user's favorites
async function getUserFavorites() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data, error } = await supabase
    .from('favorites')
    .select('satellite_name, satellite_index')
    .eq('user_id', user.id);
  
  if (error) {
    console.error('Error fetching favorites:', error);
    return [];
  }
  return data || [];
}

// Add satellite to favorites
async function addFavorite(satelliteName, satelliteIndex) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Please log in to save favorites!');
    return false;
  }
  
  const { error } = await supabase
    .from('favorites')
    .insert({
      user_id: user.id,
      satellite_name: satelliteName,
      satellite_index: satelliteIndex
    });
  
  if (error) {
    console.error('Error adding favorite:', error);
    alert('Failed to add favorite');
    return false;
  }
  
  return true;
}

// Remove satellite from favorites
async function removeFavorite(satelliteName) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('satellite_name', satelliteName);
  
  if (error) {
    console.error('Error removing favorite:', error);
    return false;
  }
  
  return true;
}

// Check if satellite is favorited
async function isFavorited(satelliteName) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('satellite_name', satelliteName)
    .maybeSingle();
  
  return !error && data;
}

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userName = document.getElementById("user-name");

async function updateFavoritesList() {
  const favoritesPanel = document.getElementById('favorites-panel');
  const favoritesList = document.getElementById('favorites-list');
  const noFavorites = document.getElementById('no-favorites');
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    if (favoritesPanel) favoritesPanel.style.display = 'none';
    return;
  }
  
  const favorites = await getUserFavorites();
  
  if (favorites.length === 0) {
    if (noFavorites) noFavorites.style.display = 'block';
    if (favoritesList) favoritesList.innerHTML = '';
    if (favoritesPanel) favoritesPanel.style.display = 'block';
    return;
  }
  
  if (noFavorites) noFavorites.style.display = 'none';
  if (favoritesPanel) favoritesPanel.style.display = 'block';
  
  if (favoritesList) {
    favoritesList.innerHTML = favorites.map((fav, idx) => `
      <div style="
        padding: 8px;
        margin: 5px 0;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      " data-satellite-index="${fav.satellite_index}">
        <span class="fav-item-name">${fav.satellite_name}</span>
        <button class="remove-fav" data-name="${fav.satellite_name}" style="
          background: #f44336;
          border: none;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        ">×</button>
      </div>
    `).join('');
    
    // Add click handlers for favorites
    favoritesList.querySelectorAll('.fav-item-name').forEach(item => {
      item.parentElement.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-fav')) return;
        const index = parseInt(item.parentElement.dataset.satelliteIndex);
        const mesh = satelliteMeshes[index];
        if (mesh) {
          // Focus on satellite
          if (activeSatellite && activeSatellite !== mesh) {
            activeSatellite.material.color.set(0xff0000);
            if (activeSatellite.userData.orbitLine) {
              scene.remove(activeSatellite.userData.orbitLine);
              activeSatellite.userData.orbitLine.geometry.dispose();
              activeSatellite.userData.orbitLine.material.dispose();
              delete activeSatellite.userData.orbitLine;
            }
          }
          activeSatellite = mesh;
          activeSatellite.material.color.set(0x00ff00);
          showSatelliteInfo(mesh);
          drawSatelliteOrbit(index);
        }
      });
    });
    
    // Add remove handlers
    favoritesList.querySelectorAll('.remove-fav').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = btn.dataset.name;
        const success = await removeFavorite(name);
        if (success) {
          updateFavoritesList();
        }
      });
    });
  }
}

// Check auth state on load
async function initAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (userName) userName.textContent = user.email;
    updateFavoritesList(); // Add this line
  } else {
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userName) userName.textContent = "";
    const favoritesPanel = document.getElementById('favorites-panel');
    if (favoritesPanel) favoritesPanel.style.display = 'none';
  }
}



// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event);
  initAuth();
});

loginBtn.addEventListener("click", async () => {
  const email = prompt("Enter your email:");
  if (!email) return;
  
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });
  
  if (error) {
    alert("Error: " + error.message);
  } else {
    alert("Check your email for the login link!");
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Logout error:", error);
  location.reload();
});

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event);
  initAuth();
});

initAuth();



// earth rotation constants
const SIDEREAL_DAY_S = 86164.0905
const ANGULAR_SPEED_RAD_S = 2 * Math.PI / SIDEREAL_DAY_S

let satellite = null;
const satelliteImportPromise = (async () => {
  try {
    const mod = await import('satellite.js');
    satellite = mod.default || mod;
    const required = ['twoline2satrec','propagate','jday','gstime','eciToEcf'];
    for (let fn of required) if (typeof satellite[fn] !== 'function') throw new Error(`Missing ${fn}`);
    console.log('satellite.js loaded:', Object.keys(satellite).slice(0,20));
    return true;
  } catch(e) {
    console.warn('satellite.js not available:', e);
    return false;
  }
})();


const w = window.innerWidth;
const h = window.innerHeight;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

// Group for the Earth and clouds
const earthGroup = new THREE.Group();
earthGroup.rotation.z = -23.4 * Math.PI / 180;
scene.add(earthGroup);

new OrbitControls(camera, renderer.domElement);

// Earth geometry and material
const detail = 12;
const loader = new THREE.TextureLoader();
const geometry = new THREE.IcosahedronGeometry(1, detail);
const material = new THREE.MeshPhongMaterial({
  map: loader.load("/textures/00_earthmap1k.jpg"),
  specularMap: loader.load("/textures/02_earthspec1k.jpg"),
  bumpMap: loader.load("/textures/01_earthbump1k.jpg"),
  bumpScale: 0.04,
});
// choose a reference moment
const epoch = Date.now() / 1000 //seconds
const initialAngle = 0          //optional if you need a starting offset

// --- SCENE SETUP / GEOMETRY ---
const earthMesh = new THREE.Mesh(geometry, material);
earthGroup.add(earthMesh)  // relates child to group

// Lights overlay
const lightsMat = new THREE.MeshBasicMaterial({
  map: loader.load("/textures/03_earthlights1k.jpg"),
  blending: THREE.AdditiveBlending,
});
const lightsMesh = new THREE.Mesh(geometry, lightsMat);
earthGroup.add(lightsMesh);

// Clouds
const cloudsMat = new THREE.MeshStandardMaterial({
  map: loader.load("/textures/04_earthcloudmap.jpg"),
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  alphaMap: loader.load('/textures/05_earthcloudmaptrans.jpg'),
});
const cloudsMesh = new THREE.Mesh(geometry, cloudsMat);
cloudsMesh.scale.setScalar(1.003);
earthGroup.add(cloudsMesh);

// Fresnel glow
const fresnelMat = getFresnelMat();
const glowMesh = new THREE.Mesh(geometry, fresnelMat);
glowMesh.scale.setScalar(1.01);
earthGroup.add(glowMesh);

// Starfield
const stars = getStarfield({numStars: 2000});
scene.add(stars);

async function fetchTLEsBatch() {
  try {
    const response = await fetch("/active_with_country.json"); // local file in public folder
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const jsonData = await response.json();

    // Each entry already has { name, line1, line2 }
    const tles = [];
    for (const entry of jsonData.slice(0, 100)) { // limit to 100 satellites
      try {
        const satrec = satellite.twoline2satrec(entry.line1, entry.line2);
        if (satrec.error === 0) {
          tles.push({
            name: entry.name,
            line1: entry.line1,
            line2: entry.line2,
            satrec,
            country: entry.country
          });
        }
      } catch (err) {
        console.warn(`Bad TLE for ${entry.name}:`, err);
      }
    }

    console.log(`Loaded ${tles.length} satellites from active_with_country.json`);
    return tles;
  } catch (e) {
    console.error("TLE JSON load error:", e);
    return [];
  }
}


// Convert satellite ECEF/ECI position to 3D coordinates for the globe
function ecefToGlobeCoords(ecef, earthRadius = 1) {
  // ECEF/ECI coordinates from satellite.js are in kilometers
  // Earth radius in kilometers: ~6,371
  const earthRadiusKm = 6371;
  const scale = earthRadius / earthRadiusKm;
  
  // Handle both object format {x, y, z} and array format [x, y, z]
  let x, y, z;
  if (Array.isArray(ecef)) {
    [x, y, z] = ecef;
  } else if (ecef.x !== undefined) {
    x = ecef.x;
    y = ecef.y;
    z = ecef.z;
  } else {
    console.error('Invalid ECEF format:', ecef);
    return { x: 0, y: 0, z: 0 };
  }
  
  // Scale ECEF coordinates to match globe scale
  return {
    x: x * scale,
    y: y * scale,
    z: z * scale
  };
}

// Create satellite group and meshes
const satelliteGroup = new THREE.Group();
scene.add(satelliteGroup); // CRITICAL: Add to scene
const satelliteGeometry = new THREE.SphereGeometry(0.03, 8, 8);
const satelliteMeshes = [];
const satelliteTLEs = [];
const satelliteInfo = []; // Store satellite information
const searchEl = document.getElementById("satSearch");

if (searchEl) {
  searchEl.addEventListener("input", () => {
  const q = searchEl.value.toLowerCase();

  // If a satellite is active but search hides it, remove orbit
  if (activeSatellite) {
    const name = activeSatellite.userData.name.toLowerCase();
    if (!name.includes(q)) {
      if (activeSatellite.userData.orbitLine) {
        scene.remove(activeSatellite.userData.orbitLine);
        activeSatellite.userData.orbitLine.geometry.dispose();
        activeSatellite.userData.orbitLine.material.dispose();
        delete activeSatellite.userData.orbitLine;
      }

      if (activeSatellite.userData.coverageCircle) {
        scene.remove(activeSatellite.userData.coverageCircle);
        activeSatellite.userData.coverageCircle.geometry.dispose();
        activeSatellite.userData.coverageCircle.material.dispose();
        delete activeSatellite.userData.coverageCircle;
      }
      activeSatellite.material.color.set(0xff0000);
      activeSatellite = null;
    }
  }

  satelliteMeshes.forEach((mesh, i) => {
    const name = satelliteInfo[i]?.name?.toLowerCase() || "";
    mesh.visible = q === "" || name.includes(q);
  });

  const infoPanel = document.getElementById('satelliteInfo');
  if (infoPanel) infoPanel.classList.remove('visible');
});
}

// Helper function to create a new satellite mesh with its own material
function createSatelliteMesh() {
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // new instance for each satellite
  const mesh = new THREE.Mesh(satelliteGeometry, material);
  return mesh;
}

function positionTestSatellite(mesh, lat, lon, alt = 1.1) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  mesh.position.set(
    alt * Math.sin(phi) * Math.cos(theta),
    alt * Math.cos(phi),
    alt * Math.sin(phi) * Math.sin(theta)
  );
}

// Initialize satellites
async function initializeRealSatellites() {
  console.log('initializeRealSatellites called, satellite available:', !!satellite);
  if (!satellite) return;

  // Clear test satellites and arrays
  satelliteMeshes.forEach(m=>satelliteGroup.remove(m));
  satelliteMeshes.length=0;
  satelliteTLEs.length=0;
  satelliteInfo.length=0;
  orbitLines.length=0;
  coverageCircles.length=0;

  const tles = await fetchTLEsBatch();
  if (!tles.length) return;

  tles.forEach((tle, idx) => {
    const mesh = createSatelliteMesh(); 
    mesh.userData = { 
      isTest: false, 
      name: tle.name, 
      index: idx, 
      catId: tle.noradId || tle.satrec?.satnum?.toString() // ✅ assign here
    };
    satelliteGroup.add(mesh);
    satelliteMeshes.push(mesh);
    satelliteTLEs.push(tle.satrec);
    satelliteInfo.push(tle);
    
    // Initialize empty slots for orbit lines and coverage circles
    orbitLines[idx] = null;
    coverageCircles[idx] = null;
  });

  console.log('Created', satelliteMeshes.length, 'satellite meshes');
  updateSatellitePositions(); // initial placement
}

let lastUpdateTime = 0;
function updateSatellitePositions() {
  if (!satellite || !satelliteTLEs.length) return;

  const now = Date.now();
  const delta = now - lastUpdateTime;
  lastUpdateTime = now;

  // Remove the throttle — we’ll update every frame
  const date = new Date();

  // Use GMST directly from the current time
  const gmst = satellite.gstime(date);

  satelliteMeshes.forEach((mesh, idx) => {
    if (mesh.userData.isTest) return;
    const satrec = satelliteTLEs[idx];
    if (!satrec) return;

    const posVel = satellite.propagate(satrec, date);
    if (!posVel?.position) return;

    let ecef;
    try {
      ecef = satellite.eciToEcf(posVel.position, gmst);
    } catch {
      ecef = posVel.position;
    }

    const coords = ecefToGlobeCoords(ecef);
    if (isFinite(coords.x) && isFinite(coords.y) && isFinite(coords.z)) {
      mesh.position.set(coords.x, coords.y, coords.z);
    }
  });
}

// Initialize satellites after satellite.js loads
satelliteImportPromise.then(loaded => {
  if (loaded) {
    initializeRealSatellites();
  }
});

function drawSatelliteOrbit(idx) {
  const satrec = satelliteTLEs[idx];
  if (!satrec) return;

  // Remove existing orbit line if it exists
  if (orbitLines[idx]) {
    scene.remove(orbitLines[idx]);
    orbitLines[idx].geometry.dispose();
    orbitLines[idx].material.dispose();
  }

  const points = [];
  const colors = [];
  const now = new Date();
  const earthRadiusKm = 6371;
  const scale = 1 / earthRadiusKm;

  // Sample 1440 points along the orbit, 1 minute apart (one full day)
  for (let i = 0; i <= 1440; i++) {
    const futureDate = new Date(now.getTime() + i * 60 * 1000);
    const pv = satellite.propagate(satrec, futureDate);
    if (!pv?.position) continue;

    const ecef = satellite.eciToEcf(pv.position, satellite.gstime(futureDate));
    points.push(new THREE.Vector3(
      ecef.x * scale,
      ecef.y * scale,
      ecef.z * scale
    ));

    // Calculate color based on time progress (0 to 1)
    const progress = i / 1440;
    
    const r = progress;           // 0 -> 1 (green to red)
    const g = 1 - progress;       // 1 -> 0 (green fades out)
    const b = 0;                  // stays 0
    
    colors.push(r, g, b);
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  
  // Add color attribute to geometry
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  // Use vertexColors to enable per-vertex coloring
  const material = new THREE.LineBasicMaterial({ 
    vertexColors: true,
    linewidth: 2
  });
  
  const orbitLine = new THREE.Line(geometry, material);
  orbitLine.visible = showAllOrbits; // Respect the global toggle
  scene.add(orbitLine);

  // Store in both arrays for different access patterns
  orbitLines[idx] = orbitLine;
  activeSatellite.userData.orbitLine = orbitLine;
}


// ---------- Solar / time helpers ----------
function toRadians(d){ return d * Math.PI / 180; }
function toDegrees(r){ return r * 180 / Math.PI; }

function julianDay(date) {
  // date: JS Date in UTC
  return date.getTime() / 86400000 + 2440587.5;
}

// Returns { lat: degrees, lon: degrees } for sub-solar point at `date` (UTC)
function subSolarLatLon(date) {
  const JD = julianDay(date);
  const n = JD - 2451545.0;                       // days since J2000.0
  const T = n / 36525.0;                          // centuries since J2000.0

  // Mean longitude of the Sun (deg)
  let L = (280.460 + 36000.770 * T + 0.98564736 * n) % 360;
  if (L < 0) L += 360;

  // Mean anomaly (deg)
  const g = (357.528 + 35999.050 * T + 0.98560028 * n) % 360;
  const gRad = toRadians(g);

  // Ecliptic longitude (deg) - approximate (includes small periodic terms)
  const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
  const lambdaRad = toRadians(lambda);

  // Obliquity of the ecliptic (deg)
  const epsilon = 23.439291 - 0.0130042 * T;
  const epsRad = toRadians(epsilon);

  // Sun's right ascension (deg) and declination (deg)
  const sinLambda = Math.sin(lambdaRad);
  const cosLambda = Math.cos(lambdaRad);
  const sinEps = Math.sin(epsRad);
  const cosEps = Math.cos(epsRad);

  const declRad = Math.asin(sinEps * sinLambda);
  const decl = toDegrees(declRad); // sub-solar latitude

  // RA in radians (use atan2 to get full circle)
  const raRad = Math.atan2(cosEps * sinLambda, cosLambda);
  let raDeg = toDegrees(raRad);
  if (raDeg < 0) raDeg += 360;

  // Greenwich Mean Sidereal Time (deg)
  // More accurate GMST formula:
  const JD0 = Math.floor(JD - 0.5) + 0.5;
  const H = (JD - JD0) * 24;                 // UT hours past previous midnight
  const D = JD - 2451545.0;
  const D0 = JD0 - 2451545.0;
  const T0 = D0 / 36525.0;
  let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0)
             + 0.000387933 * T * T - (T * T * T) / 38710000;
  GMST = ((GMST % 360) + 360) % 360; // normalize 0..360

  // Greenwich Hour Angle (deg) = GMST - RA
  let GHA = GMST - raDeg;
  // normalize to -180..180
  GHA = ((GHA + 180) % 360) - 180;

  // subsolar longitude = -GHA (if GHA is degrees west of Greenwich)
  let subLon = -GHA;
  if (subLon > 180) subLon -= 360;
  if (subLon < -180) subLon += 360;

  return { lat: decl, lon: subLon };
}

// convert lat/lon (deg) on sphere radius r -> THREE.Vector3
function latLonToVector3(latDeg, lonDeg, r = 1) {
 const lat = toRadians(latDeg);
  const lon = toRadians(lonDeg);
  // spherical to cartesian: assume lat = +N, lon measured +E from Greenwich
  const x = r * Math.cos(lat) * Math.cos(lon);
  const z = r * Math.cos(lat) * Math.sin(lon);
  const y = r * Math.sin(lat);
  return new THREE.Vector3(x, y, z);
}

// ---------- Marker for Columbia ----------
const columbiaMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.02, 8, 8),
  new THREE.MeshStandardMaterial({ color: 0xffff00 })
);
scene.add(columbiaMarker);

// Columbia coords
const COLUMBIA_LAT = 38.9517;   // degrees
const COLUMBIA_LON = -92.3341;  // degrees (negative = west)

// Raycaster for click detection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let currentlyHovered = null;
let activeSatellite = null;

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(satelliteMeshes);

  if (intersects.length > 0) {
    const closest = intersects[0].object;

    document.body.style.cursor = 'pointer';

    // Only temporarily highlight if it’s not the active one
    if (closest !== activeSatellite) {
      if (currentlyHovered && currentlyHovered !== activeSatellite) {
        currentlyHovered.material.color.set(0xff0000); // reset previous hover
      }

      currentlyHovered = closest;
      currentlyHovered.material.color.set(0x00ff00); // temporary hover green
    }

  } else {
    document.body.style.cursor = 'default';

    if (currentlyHovered && currentlyHovered !== activeSatellite) {
      currentlyHovered.material.color.set(0xff0000); // reset hover
      currentlyHovered = null;
    }
  }
}


// Click handler
function onMouseClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(satelliteMeshes);

  if (intersects.length === 0) {
    return; // no satellite clicked
  }

  const clickedSatellite = intersects[0].object;

  // If the same satellite is clicked again, do nothing
  if (activeSatellite === clickedSatellite) {
    return;
  }

  // If a different satellite was active before, reset it
  if (activeSatellite) {
    activeSatellite.material.color.set(0xff0000); // reset to red

    // ALWAYS remove the old orbit line (regardless of toggle state)
    if (activeSatellite.userData?.orbitLine) {
      scene.remove(activeSatellite.userData.orbitLine);
      activeSatellite.userData.orbitLine.geometry.dispose();
      activeSatellite.userData.orbitLine.material.dispose();
      delete activeSatellite.userData.orbitLine;
    }

    // ALWAYS remove the old coverage circle (regardless of toggle state)
    if (activeSatellite.userData?.coverageCircle) {
      scene.remove(activeSatellite.userData.coverageCircle);
      activeSatellite.userData.coverageCircle.geometry.dispose();
      activeSatellite.userData.coverageCircle.material.dispose();
      delete activeSatellite.userData.coverageCircle;
    }
  }

  // Set new active satellite
  activeSatellite = clickedSatellite;
  activeSatellite.material.color.set(0x00ff00); // highlight green

  // Show info panel
  showSatelliteInfo(activeSatellite);

  // Draw orbit for the newly clicked satellite if orbits are toggled on
  if (showAllOrbits) {
    drawSatelliteOrbit(activeSatellite.userData.index);
  }
  
  // Draw coverage circle if coverage is toggled on
  if (showAllCoverage) {
    drawCoverageCircle(activeSatellite);
  }

  // Optional zoom to satellite if enabled
  if (autoZoomEnabled) {
    const targetPos = clickedSatellite.position.clone();
    const distance = 3; // Adjust this for zoom level (lower = closer)
    const direction = targetPos.clone().normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const toggleOrbitsBtn = document.getElementById('toggle-orbits-btn');
  const toggleCoverageBtn = document.getElementById('toggle-coverage-btn');
  
  if (toggleOrbitsBtn) {
    toggleOrbitsBtn.addEventListener('click', toggleAllOrbits);
  }
  
  if (toggleCoverageBtn) {
    toggleCoverageBtn.addEventListener('click', toggleAllCoverage);
  }
});

// Show satellite information
// Show satellite information
async function showSatelliteInfo(satelliteMesh) {
  const infoPanel = document.getElementById('satelliteInfo');
  const nameElement = document.getElementById('satelliteName');
  const detailsElement = document.getElementById('satelliteDetails');

  const name = satelliteMesh.userData.name || 'Unknown Satellite';
  const isTest = satelliteMesh.userData.isTest;

  nameElement.textContent = name;

  let html = '';

  if (isTest) {
    html += `
      <div class="info-item">
        <span class="info-label">Type:</span> Test
      </div>
      <div class="info-item">
        <span class="info-label">Status:</span> Test Satellite
      </div>
    `;
  } else {
    const index = satelliteMesh.userData.index;
    const info = satelliteInfo[index];
    const satrec = satelliteTLEs[index]; // ADD THIS - needed for pass calculation
    const favorited = await isFavorited(name);
    
    if (info) {
      const country = info.country && info.country.trim() !== "" ? info.country : "Unknown";
      html += `
        <div class="info-item">
          <span class="info-label">Name:</span> ${info.name}
        </div>
        <div class="info-item">
          <span class="info-label">Country:</span> ${country}
        </div>
        <div class="info-item">
          <span class="info-label">Position:</span> 
          X: ${satelliteMesh.position.x.toFixed(3)}, 
          Y: ${satelliteMesh.position.y.toFixed(3)}, 
          Z: ${satelliteMesh.position.z.toFixed(3)}
        </div>
        <div class="info-item">
          <button id="favorite-btn" style="
            padding: 8px 16px;
            background: ${favorited ? '#f44336' : '#4CAF50'};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
          ">
            ${favorited ? '★ Unfavorite' : '☆ Favorite'}
          </button>
        </div>
        <div class="info-item">
          <button id="next-pass-btn" style="
            padding: 8px 16px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 5px;
            width: 100%;
          ">
            Next Visible Pass
          </button>
        </div>
        <div id="pass-info" style="margin-top: 10px; font-size: 12px; display: none;"></div>
      `;
    } else {
      html += `
        <div class="info-item">
          <span class="info-label">Type:</span> Real Satellite
        </div>
      `;
    }
  }

  // Always add the download button
  html += `
    <button id="downloadSatData" style="
      padding: 8px 16px;
      background: #9C27B0;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 5px;
      width: 100%;
    ">Download Data</button>
  `;

  detailsElement.innerHTML = html;

  const favoriteBtn = document.getElementById('favorite-btn');
  const nextPassBtn = document.getElementById('next-pass-btn');
  const passInfoDiv = document.getElementById('pass-info');
  const downloadBtn = document.getElementById('downloadSatData');
  const toggleOrbitBtn = document.getElementById('toggle-orbit-btn');

  if (favoriteBtn) {
    const index = satelliteMesh.userData.index;
    const favorited = await isFavorited(name);
    
    favoriteBtn.addEventListener('click', async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        alert('Please log in to save favorites!');
        if (loginBtn) loginBtn.click();
        return;
      }
      
      if (favorited) {
        const success = await removeFavorite(name);
        if (success) {
          favoriteBtn.textContent = '☆ Favorite';
          favoriteBtn.style.background = '#4CAF50';
          updateFavoritesList();
        }
      } else {
        const success = await addFavorite(name, index);
        if (success) {
          favoriteBtn.textContent = '★ Unfavorite';
          favoriteBtn.style.background = '#f44336';
          updateFavoritesList(); 
        }
      }
    });
  }

  if (nextPassBtn && passInfoDiv && !isTest) {
    const index = satelliteMesh.userData.index;
    const satrec = satelliteTLEs[index];
    
    nextPassBtn.addEventListener('click', () => {
      // Toggle visibility
      if (passInfoDiv.style.display === 'block') {
        passInfoDiv.style.display = 'none';
        return;
      }
      
      const passes = calculatePasses(satrec, COLUMBIA_LAT, COLUMBIA_LON, 0, 48);
      
      if (passes.length === 0) {
        passInfoDiv.innerHTML = '<p style="color: #f44336;">No visible passes in next 48 hours</p>';
        passInfoDiv.style.display = 'block';
        return;
      }
      
      const nextPass = passes[0];
      const startTime = nextPass.startTime.toLocaleString();
      const maxEl = nextPass.maxElevation.toFixed(1);
      const duration = nextPass.duration.toFixed(1);
      
      // Calculate rough direction at max elevation
      const maxPosVel = satellite.propagate(satrec, nextPass.maxElevationTime);
      const maxGmst = satellite.gstime(nextPass.maxElevationTime);
      const maxEcef = satellite.eciToEcf(maxPosVel.position, maxGmst);
      const maxLook = calculateLookAngles(COLUMBIA_LAT, COLUMBIA_LON, 0, maxEcef.x, maxEcef.y, maxEcef.z, maxGmst);
      const direction = getDirection(maxLook.azimuth);
      
      passInfoDiv.innerHTML = `
        <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 4px;">
          <strong>Next Pass:</strong><br>
          ${startTime}<br>
          ⏱Duration: ${duration} min<br>
          Max Elevation: ${maxEl}°<br>
          Direction: ${direction}<br>
          ${maxEl > 30 ? 'Good visibility!' : maxEl > 10 ? 'Moderate visibility' : 'Low on horizon'}
        </div>
      `;
      passInfoDiv.style.display = 'block';
    });
  }

  document.getElementById('downloadSatData').onclick = () => {
    downloadSatelliteData(satelliteMesh);
  };

  if (toggleOrbitBtn && !isTest) {
    toggleOrbitBtn.addEventListener('click', () => {
      if (activeSatellite.userData.orbitLine) {
        activeSatellite.userData.orbitLine.visible = !activeSatellite.userData.orbitLine.visible;
        toggleOrbitBtn.textContent = activeSatellite.userData.orbitLine.visible ? 'Hide Orbit' : 'Show Orbit';
      }
    });
  }

  infoPanel.classList.add('visible');
}

// Download satellite data
function downloadSatelliteData(satelliteMesh) {
  const index = satelliteMesh.userData.index;
  const info = satelliteInfo[index];

  if (!info) return;

  // Prepare CSV or JSON string
  const dataStr = `
Name: ${info.name}
TLE Line 1: ${info.line1}
TLE Line 2: ${info.line2}
Position X: ${satelliteMesh.position.x.toFixed(3)}
Position Y: ${satelliteMesh.position.y.toFixed(3)}
Position Z: ${satelliteMesh.position.z.toFixed(3)}
`;

  // Create a Blob and link
  const blob = new Blob([dataStr], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${info.name.replace(/\s+/g,'_')}_data.txt`; // filename
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the object URL
  URL.revokeObjectURL(url);
}


// Add click event listener
window.addEventListener('click', onMouseClick);
// Add the mouse move event listener
window.addEventListener('mousemove', onMouseMove);

// Sun light
const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(-2, 0.5, 1.5);
scene.add(sunLight);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const now = Date.now() / 1000;
  const t = now - epoch;
  const rotationAngle = initialAngle + ANGULAR_SPEED_RAD_S * t;

  earthMesh.rotation.y  = rotationAngle;
  lightsMesh.rotation.y = rotationAngle;
  cloudsMesh.rotation.y = rotationAngle * 1.0001;
  glowMesh.rotation.y   = rotationAngle;

  // ---- compute sun/sub-solar and position the light ----
  const date = new Date(); // current UTC
  const sub = subSolarLatLon(date); // {lat, lon} in degrees

  // Place sun directional light at sub-solar point direction
  const sunPos = latLonToVector3(sub.lat, sub.lon, 10); // push out along direction
  sunLight.position.copy(sunPos); // directional light uses position -> direction to origin

  // Put the Columbia marker on the globe surface
  const colVec = latLonToVector3(COLUMBIA_LAT, COLUMBIA_LON, 1.01); // slightly above surface
  columbiaMarker.position.copy(colVec);

  // Simple daylight check: dot(sunDir, columbiaVec) > 0 -> sun above horizon
  const sunDir = sunPos.clone().normalize().negate(); // direction from Earth toward Sun
  const colNorm = colVec.clone().normalize();
  const dot = sunDir.dot(colNorm);
  const columbiaInDaylight = dot > 0;

  // Optionally: change the marker color based on day/night
  columbiaMarker.material.color.set(columbiaInDaylight ? 0x00ff00 : 0xff0000);

  // optional logging for verification (throttled visually by console)
  // console.log('Subsolar lat/lon:', sub, 'Columbia daylight?', columbiaInDaylight);

  // update satellite positions continuously
  updateSatellitePositions();
  renderer.render(scene, camera);

}

animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== PASS PREDICTION & COVERAGE =====

// Calculate satellite passes for observer location
function calculatePasses(satrec, observerLat, observerLon, observerAlt = 0, hoursAhead = 24) {
  const passes = [];
  const now = new Date();
  const endTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  
  let inPass = false;
  let passStart = null;
  let maxElevation = 0;
  let maxElevationTime = null;
  
  // Check every minute
  for (let time = now.getTime(); time <= endTime.getTime(); time += 60000) {
    const date = new Date(time);
    const posVel = satellite.propagate(satrec, date);
    if (!posVel?.position) continue;
    
    const gmst = satellite.gstime(date);
    const ecef = satellite.eciToEcf(posVel.position, gmst);
    
    // Calculate look angles from observer to satellite
    const lookAngles = calculateLookAngles(
      observerLat, observerLon, observerAlt,
      ecef.x, ecef.y, ecef.z, gmst
    );
    
    const isVisible = lookAngles.elevation > 0; // Above horizon
    
    if (isVisible && !inPass) {
      // Pass starting
      inPass = true;
      passStart = date;
      maxElevation = lookAngles.elevation;
      maxElevationTime = date;
    } else if (isVisible && inPass) {
      // Continue tracking max elevation
      if (lookAngles.elevation > maxElevation) {
        maxElevation = lookAngles.elevation;
        maxElevationTime = date;
      }
    } else if (!isVisible && inPass) {
      // Pass ending
      inPass = false;
      passes.push({
        startTime: passStart,
        endTime: date,
        maxElevation: maxElevation,
        maxElevationTime: maxElevationTime,
        duration: (date - passStart) / 1000 / 60 // minutes
      });
    }
  }
  
  return passes;
}

// Calculate look angles (azimuth, elevation) from observer to satellite
function calculateLookAngles(obsLat, obsLon, obsAlt, satX, satY, satZ, gmst) {
  // Convert observer lat/lon to radians
  const latRad = obsLat * Math.PI / 180;
  const lonRad = obsLon * Math.PI / 180;
  
  // Observer position in ECEF (km)
  const earthRadius = 6371;
  const obsX = (earthRadius + obsAlt / 1000) * Math.cos(latRad) * Math.cos(lonRad);
  const obsY = (earthRadius + obsAlt / 1000) * Math.cos(latRad) * Math.sin(lonRad);
  const obsZ = (earthRadius + obsAlt / 1000) * Math.sin(latRad);
  
  // Satellite position relative to observer
  const dx = satX - obsX;
  const dy = satY - obsY;
  const dz = satZ - obsZ;
  
  // Convert to topocentric coordinates (East, North, Up)
  const south = Math.sin(latRad) * Math.cos(lonRad) * dx + 
                Math.sin(latRad) * Math.sin(lonRad) * dy - 
                Math.cos(latRad) * dz;
  const east = -Math.sin(lonRad) * dx + Math.cos(lonRad) * dy;
  const up = Math.cos(latRad) * Math.cos(lonRad) * dx + 
             Math.cos(latRad) * Math.sin(lonRad) * dy + 
             Math.sin(latRad) * dz;
  
  // Calculate range, azimuth, elevation
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const elevation = Math.asin(up / range) * 180 / Math.PI;
  let azimuth = Math.atan2(east, -south) * 180 / Math.PI;
  if (azimuth < 0) azimuth += 360;
  
  return { azimuth, elevation, range };
}

// Check if satellite can see a point on Earth
function canSatelliteSeePoint(satrec, targetLat, targetLon, date = new Date()) {
  const posVel = satellite.propagate(satrec, date);
  if (!posVel?.position) return false;
  
  const gmst = satellite.gstime(date);
  const ecef = satellite.eciToEcf(posVel.position, gmst);
  
  // Calculate look angles FROM satellite TO ground point
  const lookAngles = calculateLookAngles(targetLat, targetLon, 0, ecef.x, ecef.y, ecef.z, gmst);
  
  // If elevation from satellite's perspective is positive, it can see the point
  // Typically satellites can see points within ~2500km radius depending on altitude
  return lookAngles.elevation < 0 && lookAngles.range < 5000; // Rough approximation
}

// Get direction name from azimuth
function getDirection(azimuth) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(azimuth / 22.5) % 16;
  return directions[index];
}

// Draw coverage circle on Earth showing where satellite is visible from
function drawCoverageCircle(satelliteMesh) {
  const index = satelliteMesh.userData.index;
  const satrec = satelliteTLEs[index];
  if (!satrec) return;

  // Remove existing coverage circle if it exists
  if (coverageCircles[index]) {
    scene.remove(coverageCircles[index]);
    coverageCircles[index].geometry.dispose();
    coverageCircles[index].material.dispose();
  }

  const date = new Date();
  const posVel = satellite.propagate(satrec, date);
  if (!posVel?.position) return;

  const gmst = satellite.gstime(date);
  const ecef = satellite.eciToEcf(posVel.position, gmst);
  
  // Satellite position in km
  const satPos = new THREE.Vector3(ecef.x, ecef.y, ecef.z);
  const satAltitude = satPos.length() - 6371; // altitude above Earth surface
  
  // Calculate coverage radius based on satellite altitude
  // Assuming minimum elevation angle of 10 degrees for visibility
  const earthRadius = 6371;
  const minElevationRad = 10 * Math.PI / 180;
  const coverageRadiusKm = earthRadius * Math.acos(
    earthRadius / (earthRadius + satAltitude) * Math.cos(minElevationRad)
  );
  
  // Convert coverage radius to angle on sphere
  const coverageAngle = coverageRadiusKm / earthRadius;
  
  // Create circle at satellite's sub-point
  const points = [];
  const segments = 64;
  
  // Normalize satellite position to get sub-satellite point on Earth surface
  const subSatPoint = satPos.clone().normalize();
  
  // Create a circle perpendicular to the sub-satellite point
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    
    // Create a point at coverage radius around sub-satellite point
    // This is simplified - creates a circle on the sphere
    const lat = Math.asin(subSatPoint.y);
    const lon = Math.atan2(subSatPoint.z, subSatPoint.x);
    
    const pointLat = lat + coverageAngle * Math.cos(angle);
    const pointLon = lon + coverageAngle * Math.sin(angle) / Math.cos(lat);
    
    // Convert back to 3D coordinates
    const x = 1.01 * Math.cos(pointLat) * Math.cos(pointLon);
    const y = 1.01 * Math.sin(pointLat);
    const z = 1.01 * Math.cos(pointLat) * Math.sin(pointLon);
    
    points.push(new THREE.Vector3(x, y, z));
  }
  
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ 
    color: 0x00ffff,
    linewidth: 2,
    transparent: true,
    opacity: 0.6
  });
  
  const coverageCircle = new THREE.Line(geometry, material);
  coverageCircle.visible = showAllCoverage; // Respect the global toggle
  scene.add(coverageCircle);
  
  // Store in both arrays for different access patterns
  coverageCircles[index] = coverageCircle;
  satelliteMesh.userData.coverageCircle = coverageCircle;
}