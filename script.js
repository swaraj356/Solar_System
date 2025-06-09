// Control flags for animation and theme
let isPaused = false;   // Flag to pause/resume animation
let darkMode = true;    // Flag for dark/light theme mode

// Create the main scene
const scene = new THREE.Scene();

// Set up camera with perspective projection
const camera = new THREE.PerspectiveCamera(
  75,                             // Field of view
  window.innerWidth / window.innerHeight,  // Aspect ratio
  0.1,                            // Near clipping plane
  1000                            // Far clipping plane
);

// Create WebGL renderer with antialiasing
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight); // Full window size
document.body.appendChild(renderer.domElement);          // Add canvas to DOM

// Add a point light source at the origin (sun's position)
const light = new THREE.PointLight(0xffffff, 1.5, 1000);
light.position.set(0, 0, 0);
scene.add(light);

// Load a starfield texture and set it as scene background
const starTexture = new THREE.TextureLoader().load(
  "https://upload.wikimedia.org/wikipedia/commons/8/86/Astronomy_picture_of_black_space_with_stars.jpg"
);
scene.background = starTexture;

// Create a large cloud of star points for ambient stars in space
const stars = (() => {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i < 2000; i++) {
    // Randomly distribute stars in a large cube centered at origin
    const x = (Math.random() - 0.5) * 1000;
    const y = (Math.random() - 0.5) * 1000;
    const z = (Math.random() - 0.5) * 1000;
    positions.push(x, y, z);
  }
  // Assign positions to geometry
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  // Star points material - white, small, slightly transparent
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.7,
    transparent: true,
    opacity: 0.8
  });

  // Create Points object from geometry and material
  const starPoints = new THREE.Points(geometry, material);
  scene.add(starPoints);  // Add stars to scene

  return { mesh: starPoints, material };
})();

// Create the Sun - a yellow sphere with no shading (MeshBasicMaterial)
const sunGeometry = new THREE.SphereGeometry(3, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xFDB813 });
const sun = new THREE.Mesh(sunGeometry, sunMaterial);
scene.add(sun);

// Create a group to hold all planets and their orbits, tilted for better viewing angle
const solarSystemGroup = new THREE.Group();
solarSystemGroup.rotation.x = Math.PI / 6; // tilt 30 degrees
scene.add(solarSystemGroup);

// Data for planets: name, color, size, distance from sun, orbit speed, eccentricity for elliptical orbits
const planetData = [
  { name: 'Mercury', color: 0xaaaaaa, size: 0.3, distance: 5, speed: 0.04, eccentricity: 0.2 },
  { name: 'Venus',   color: 0xffcc99, size: 0.6, distance: 7, speed: 0.015, eccentricity: 0.1 },
  { name: 'Earth',   color: 0x3399ff, size: 0.65, distance: 9, speed: 0.01, eccentricity: 0.1 },
  { name: 'Mars',    color: 0xff3300, size: 0.5, distance: 11, speed: 0.008, eccentricity: 0.15 },
  { name: 'Jupiter', color: 0xff9966, size: 1.2, distance: 14, speed: 0.006, eccentricity: 0.05 },
  { name: 'Saturn',  color: 0xffffcc, size: 1.1, distance: 17, speed: 0.004, eccentricity: 0.07 },
  { name: 'Uranus',  color: 0x66ffff, size: 0.9, distance: 20, speed: 0.002, eccentricity: 0.08 },
  { name: 'Neptune', color: 0x3333ff, size: 0.85, distance: 23, speed: 0.0015, eccentricity: 0.06 },
];

// Arrays to store planets, their angles, speeds, target positions for fly-in animation, orbit lines, and arrival flags
const planets = [];
const planetAngles = [];
const planetSpeeds = [];
const targetPositions = [];
const orbitLines = [];
const arrived = [];

// Reference to control panel container in HTML
const controlPanel = document.getElementById("controls");

// Add control buttons for pause/resume, theme toggle, and reset view
controlPanel.innerHTML += `
  <div style="margin-bottom: 10px">
    <button id="togglePause">Pause</button>
    <button id="toggleTheme">Light Mode</button>
    <button id="resetView">Reset View</button>
  </div>
`;

// Pause/resume toggle button logic
document.getElementById("togglePause").onclick = () => {
  isPaused = !isPaused;
  document.getElementById("togglePause").innerText = isPaused ? "Resume" : "Pause";
};

// Theme toggle button logic (dark/light mode)
document.getElementById("toggleTheme").onclick = () => {
  darkMode = !darkMode;
  scene.background = darkMode ? starTexture : new THREE.Color("white");
  document.body.style.backgroundColor = darkMode ? "black" : "white";
  document.getElementById("toggleTheme").innerText = darkMode ? "Light Mode" : "Dark Mode";

  // Change orbit lines and stars colors based on theme for visibility
  orbitLines.forEach(orbit => orbit.material.color.set(darkMode ? 0xffffff : 0x222222));
  stars.material.color.set(darkMode ? 0xffffff : 0x000000);
};

// Default camera position to reset to
const defaultCameraPosition = new THREE.Vector3(0, 0, 40);

// Reset view button logic - reset camera position and orientation
document.getElementById("resetView").onclick = () => {
  camera.position.copy(defaultCameraPosition);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
};

// Tooltip element for showing planet names on hover
const tooltip = document.createElement("div");
tooltip.style.cssText = `
  position:absolute;
  padding:4px 8px;
  background:#fff;
  color:#000;
  border-radius:4px;
  font-size:12px;
  pointer-events:none;
  display:none;
  z-index:2;
`;
document.body.appendChild(tooltip);

// Raycaster and mouse vector for detecting mouse hover and clicks on planets
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Mouse move event - update mouse vector and raycaster, check intersections with planets
window.addEventListener("mousemove", (event) => {
  // Convert mouse coordinates to normalized device coordinates (-1 to +1)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  // Find intersections with planet meshes
  const intersects = raycaster.intersectObjects(planets.map(p => p.mesh));
  
  if (intersects.length > 0) {
    // If hovering over a planet, show tooltip with planet name near cursor
    tooltip.innerText = intersects[0].object.userData.name;
    tooltip.style.display = "block";
    tooltip.style.left = event.clientX + 10 + "px";
    tooltip.style.top = event.clientY + 10 + "px";
  } else {
    // Hide tooltip if not hovering any planet
    tooltip.style.display = "none";
  }
});

// Create planets, their initial positions, orbits, and speed sliders
planetData.forEach((data, i) => {
  // Create sphere geometry for planet with given size
  const geometry = new THREE.SphereGeometry(data.size, 32, 32);
  // Use standard material so lighting affects the planet color
  const material = new THREE.MeshStandardMaterial({ color: data.color });
  const planet = new THREE.Mesh(geometry, material);

  // Store planet name in userData for tooltip access
  planet.userData.name = data.name;

  // Initially place planets far away for fly-in animation
  planet.position.set(100, 0, 0);

  // Random initial angle on orbit
  planetAngles.push(Math.random() * Math.PI * 2);

  // Store initial speeds from data
  planetSpeeds.push(data.speed);

  // Flag for if planet has arrived at orbit position
  arrived.push(false);

  // Calculate the target position on elliptical orbit for fly-in animation
  const angle = planetAngles[i];
  const x = data.distance * (1 + data.eccentricity) * Math.cos(angle);
  const z = data.distance * Math.sin(angle);
  targetPositions.push(new THREE.Vector3(x, 0, z));

  // Add planet mesh to solar system group
  solarSystemGroup.add(planet);

  // Store planet with its orbital properties for use in animation
  planets.push({ mesh: planet, distance: data.distance, eccentricity: data.eccentricity });

  // Create points for orbit ellipse line
  const points = [];
  for (let j = 0; j <= 100; j++) {
    const a = (j / 100) * Math.PI * 2;
    const px = data.distance * (1 + data.eccentricity) * Math.cos(a);
    const pz = data.distance * Math.sin(a);
    points.push(new THREE.Vector3(px, 0, pz));
  }

  // Create orbit geometry and material
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(points);
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.4, transparent: true });
  const orbit = new THREE.Line(orbitGeo, orbitMat);

  // Add orbit ellipse to solar system group
  solarSystemGroup.add(orbit);
  orbitLines.push(orbit);

  // Create a speed slider control for each planet
  const container = document.createElement("div");
  container.className = "slider-container";
  container.innerHTML = `
    <label>${data.name} Speed:</label>
    <input type="range" min="0" max="0.05" step="0.001" value="${data.speed}" id="speed-${i}">
  `;
  controlPanel.appendChild(container);

  // Update planet speed on slider input
  document.getElementById(`speed-${i}`).addEventListener('input', (e) => {
    planetSpeeds[i] = parseFloat(e.target.value);
  });
});

// Set initial camera position looking at the center of the solar system
camera.position.copy(defaultCameraPosition);

// Animation loop - called each frame
function animate() {
  requestAnimationFrame(animate);

  if (!isPaused) {
    // Update planet positions if animation is not paused
    planets.forEach((p, i) => {
      const planet = p.mesh;
      const target = targetPositions[i];

      if (!arrived[i]) {
        // Fly-in animation: move planet from initial position to orbit target position smoothly
        planet.position.lerp(target, 0.05);
        if (planet.position.distanceTo(target) < 0.1) {
          arrived[i] = true;  // Mark planet as arrived at orbit
        }
      } else {
        // Once arrived, update planet orbit position by incrementing angle with speed
        planetAngles[i] += planetSpeeds[i];
        const a = planetAngles[i];
        // Calculate elliptical orbit position using eccentricity
        planet.position.x = p.distance * (1 + p.eccentricity) * Math.cos(a);
        planet.position.z = p.distance * Math.sin(a);
      }
    });
  }

  // Render the scene from the camera's perspective
  renderer.render(scene, camera);
}

// Start animation loop
animate();

// Handle window resizing: update camera aspect ratio and renderer size
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// On mouse click - zoom camera to clicked planet and look at it
window.addEventListener('click', (event) => {
  // Convert mouse click position to normalized device coordinates
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(planets.map(p => p.mesh));

  if (intersects.length > 0) {
    const planet = intersects[0].object;
    // Move camera close to planet and orient camera to look at the planet
    camera.position.set(planet.position.x + 5, planet.position.y + 5, planet.position.z + 10);
    camera.lookAt(planet.position);
  }
});
