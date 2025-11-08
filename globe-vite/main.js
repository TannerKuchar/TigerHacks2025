import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStarfield from "./src/getStarfield.js";
import { getFresnelMat } from "./src/getFresnelMat.js";

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
  map: loader.load("./textures/00_earthmap1k.jpg"),
  specularMap: loader.load("./textures/02_earthspec1k.jpg"),
  bumpMap: loader.load("./textures/01_earthbump1k.jpg"),
  bumpScale: 0.04,
});
const earthMesh = new THREE.Mesh(geometry, material);
earthGroup.add(earthMesh);

// Lights overlay
const lightsMat = new THREE.MeshBasicMaterial({
  map: loader.load("./textures/03_earthlights1k.jpg"),
  blending: THREE.AdditiveBlending,
});
const lightsMesh = new THREE.Mesh(geometry, lightsMat);
earthGroup.add(lightsMesh);

// Clouds
const cloudsMat = new THREE.MeshStandardMaterial({
  map: loader.load("./textures/04_earthcloudmap.jpg"),
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  alphaMap: loader.load('./textures/05_earthcloudmaptrans.jpg'),
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

// Generate satellite test data
function generateSatelliteData(numSatellites = 20) {
  const satellites = [];
  const earthRadius = 1;
  
  for (let i = 0; i < numSatellites; i++) {
    // Random altitude between 1.1 and 1.5 times Earth radius
    const altitude = earthRadius * (1.1 + Math.random() * 0.4);
    
    // Random spherical coordinates
    const theta = Math.random() * Math.PI * 2; // Azimuth (0 to 2π)
    const phi = Math.acos(2 * Math.random() - 1); // Polar angle (0 to π)
    
    // Convert to Cartesian coordinates
    const x = altitude * Math.sin(phi) * Math.cos(theta);
    const y = altitude * Math.sin(phi) * Math.sin(theta);
    const z = altitude * Math.cos(phi);
    
    satellites.push({ x, y, z, altitude });
  }
  
  return satellites;
}

// Create satellites as red dots
const satelliteData = generateSatelliteData(25);
const satelliteGroup = new THREE.Group();
const satelliteGeometry = new THREE.SphereGeometry(0.02, 8, 8);
const satelliteMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

satelliteData.forEach((sat) => {
  const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
  satellite.position.set(sat.x, sat.y, sat.z);
  satelliteGroup.add(satellite);
});

scene.add(satelliteGroup);

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

  renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
