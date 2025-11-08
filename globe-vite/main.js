import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStarfield from "./src/getStarfield.js";
import { getFresnelMat } from "./src/getFresnelMat.js";

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
const earthMesh = new THREE.Mesh(geometry, material);
earthGroup.add(earthMesh);

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
    const response = await fetch("/active.json"); // local file in public folder
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

    console.log(`Loaded ${tles.length} satellites from active.json`);
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
// Create satellite group and meshes
const satelliteGroup = new THREE.Group();
scene.add(satelliteGroup); // CRITICAL: Add to scene
const satelliteGeometry = new THREE.SphereGeometry(0.03, 8, 8);
const satelliteMeshes = [];
const satelliteTLEs = [];
const satelliteInfo = []; // Store satellite information

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

// Set satellite positions once (no live updates)
let lastUpdateTime=0;
function updateSatellitePositions(){
  if(!satellite || !satelliteTLEs.length) {
    console.log('updateSatellitePositions: no satellite or TLEs');
    return;
  }
  const now = Date.now();
  if(now-lastUpdateTime<2000) return; // throttle updates every 2s
  lastUpdateTime=now;

  const date = new Date();
  const jday = satellite.jday(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds());

  let positioned = 0;
  satelliteMeshes.forEach((mesh,idx)=>{
    if(mesh.userData.isTest) return;
    const satrec = satelliteTLEs[idx];
    if(!satrec) {
      console.log('No satrec for idx', idx);
      return;
    }
    const posVel = satellite.propagate(satrec,date); // USE DATE OBJECT, NOT JDAY
    if(!posVel?.position) {
      console.log('No position for idx', idx, posVel);
      return;
    }
    console.log('Position for', idx, ':', posVel.position);
    let ecef;
    try{ 
      ecef=satellite.eciToEcf(posVel.position,satellite.gstime(jday)); 
      console.log('ECEF for', idx, ':', ecef);
    }catch(e){ 
      console.log('eciToEcf failed:', e);
      ecef=posVel.position; 
    }
    const coords = ecefToGlobeCoords(ecef);
    console.log('Coords for', idx, ':', coords);
    if(isFinite(coords.x)&&isFinite(coords.y)&&isFinite(coords.z)) {
      mesh.position.set(coords.x,coords.y,coords.z);
      positioned++;
    }
  });
  console.log('Positioned', positioned, 'satellites');
}

// Initialize satellites after satellite.js loads
satelliteImportPromise.then(loaded => {
  if (loaded) {
    initializeRealSatellites();
  }
});


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

  if (intersects.length > 0) {
    const clickedSatellite = intersects[0].object;

    // Reset previous active satellite's color
    if (activeSatellite && activeSatellite !== clickedSatellite) {
      activeSatellite.material.color.set(0xff0000); // back to red
    }

    // Set new active satellite
    activeSatellite = clickedSatellite;
    activeSatellite.material.color.set(0x00ff00); // green

    showSatelliteInfo(activeSatellite);
  }
}

// Show satellite information
function showSatelliteInfo(satelliteMesh) {
  const infoPanel = document.getElementById('satelliteInfo');
  const nameElement = document.getElementById('satelliteName');
  const detailsElement = document.getElementById('satelliteDetails');
  
  const name = satelliteMesh.userData.name || 'Unknown Satellite';
  const isTest = satelliteMesh.userData.isTest;
  
  nameElement.textContent = name;
  
  if (isTest) {
    detailsElement.innerHTML = `
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
      detailsElement.innerHTML = `
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
      detailsElement.innerHTML = `
        <div class="info-item">
          <span class="info-label">Type:</span> Real Satellite
        </div>
      `;
    }
  }
  
  infoPanel.classList.add('visible');
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

  earthMesh.rotation.y += 0.0005;
  lightsMesh.rotation.y += 0.0005;
  cloudsMesh.rotation.y += 0.0006;
  glowMesh.rotation.y += 0.0005;
  stars.rotation.y -= 0.0002;
  
  updateSatellitePositions(); // ADD THIS LINE

  renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
