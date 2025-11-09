import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStarfield from "./src/getStarfield.js";
import { getFresnelMat } from "./src/getFresnelMat.js";
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
            satrec
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
  if(!satellite) return;

  // Clear test satellites
  satelliteMeshes.forEach(m=>satelliteGroup.remove(m));
  satelliteMeshes.length=0;
  satelliteTLEs.length=0;
  satelliteInfo.length=0;

  const tles = await fetchTLEsBatch();
  console.log('Fetched TLEs:', tles.length);
  if(!tles.length) return;

  tles.forEach((tle, idx) => {
  const mesh = createSatelliteMesh(); // NEW MATERIAL PER SATELLITE
  mesh.userData = { isTest: false, name: tle.name, index: idx };
  satelliteGroup.add(mesh);
  satelliteMeshes.push(mesh);
  satelliteTLEs.push(tle.satrec);
  satelliteInfo.push(tle);
});

  console.log('Created', satelliteMeshes.length, 'satellite meshes');
  console.log('SatelliteGroup children:', satelliteGroup.children.length);
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

  const points = [];
  const now = new Date();
  const earthRadiusKm = 6371;
  const scale = 1 / earthRadiusKm; // since your globe radius is 1

  // Sample 1440 points along the orbit, 1 minute apart
  // Equivalent to one day / 24 hrs
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
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  const orbitLine = new THREE.Line(geometry, material);
  scene.add(orbitLine);

  // Store a reference so we can remove it later
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

    // Remove the old orbit line
    if (activeSatellite.userData?.orbitLine) {
      scene.remove(activeSatellite.userData.orbitLine);
      activeSatellite.userData.orbitLine.geometry.dispose();
      activeSatellite.userData.orbitLine.material.dispose();
      delete activeSatellite.userData.orbitLine;
    }
  }

  // Set new active satellite
  activeSatellite = clickedSatellite;
  activeSatellite.material.color.set(0x00ff00); // highlight green

  // Show info panel
  showSatelliteInfo(activeSatellite);

  // Draw orbit for the newly clicked satellite
  drawSatelliteOrbit(activeSatellite.userData.index);
}

// Show satellite information
function showSatelliteInfo(satelliteMesh) {
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
    if (info) {
      html += `
        <div class="info-item">
          <span class="info-label">Name:</span> ${info.name}
        </div>
        <div class="info-item">
          <span class="info-label">Type:</span> Real Satellite
        </div>
        <div class="info-item">
          <span class="info-label">Position:</span> 
          X: ${satelliteMesh.position.x.toFixed(3)}, 
          Y: ${satelliteMesh.position.y.toFixed(3)}, 
          Z: ${satelliteMesh.position.z.toFixed(3)}
        </div>
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
    <button id="downloadSatData">Download Data</button>
  `;

  detailsElement.innerHTML = html;

  // Attach click handler
  document.getElementById('downloadSatData').onclick = () => {
    downloadSatelliteData(satelliteMesh);
  };

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


// Close satellite info panel
window.closeSatelliteInfo = function() {
  const infoPanel = document.getElementById('satelliteInfo');
  infoPanel.classList.remove('visible');
};

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
