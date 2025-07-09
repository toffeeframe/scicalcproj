/**
 * TODO
 * 
 * 1. Find an workaround to find why Earth and Satellite no longer show even if added to the scene
 *    (Changing camera and constants as an initial troubleshooting step may help?)
 * 
 * 2. Test if forces are being applied just fine in the scene
 * 3. Adjust any details before going with UI
 * 4. Implement UI (With ability to add arbitary number of satellites)
 * 5. Shall then camera perspective changed to orthographic for better control?
 * 6. More polishes if needed
 * 
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

const G = 6.67430e-11;
const EARTH_MASS = 5.972e24;
const EARTH_RADIUS = 6.371e6;
const INIT_ALTITUDE = 500e3;
const VISUAL_SCALE = 1e8;

// Air density parameters (approximate values for Earth's atmosphere)
const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m³
const SCALE_HEIGHT = 8500; // m (atmospheric scale height)

class Object {
  position = new THREE.Vector3(0, 0, 0);
  rotation = new THREE.Euler(0, 0, 0, 'XYZ');
  scale = new THREE.Vector3(1, 1, 1);
  velocity = new THREE.Vector3(0, 0, 0);
  previousAcceleration = new THREE.Vector3(0, 0, 0);
  mass = 0;
  isModelLoaded = false;
  isIntoScene = false;
  model = null;

  static ID = 0;
  objectID = 0;
  name = "(none)";

  constructor() {
    this.objectID = Object.ID++;
    this.name = "Object" + this.objectID;
  }

  loadData(name, src) {
    this.name = name;
    const loader = new GLTFLoader();

    loader.load(src,
      (modelData) => {
        this.model = modelData.scene;
        this.model.name = this.name;
        this.model.position.copy(this.position);
        this.model.rotation.copy(this.rotation);
        this.model.scale.copy(this.scale);
        this.isModelLoaded = true;

        if (this.name === "Earth") {
          this.model.scale.setScalar(EARTH_RADIUS / VISUAL_SCALE);
        }
      },
      (loadProgress) => {
        console.log(`Loading "${src}" (${(loadProgress.loaded / loadProgress.total * 100).toFixed(1)}%)`);
      },
      (error) => {
        console.error(`Failed to load "${src}":`, error);
      }
    );
  }

  addToScene(scene) {
    if (this.model && !this.isIntoScene) {
      this.isIntoScene = true;
      scene.add(this.model);
    }
  }

  removeFromScene(scene) {
    if (this.model && this.isIntoScene) {
      scene.remove(this.model);
      this.isIntoScene = false;
    }
  }

  updatePhysics(dt, acceleration) {
    const newPosition = this.position.clone()
      .add(this.velocity.clone().multiplyScalar(dt))
      .add(this.previousAcceleration.clone().multiplyScalar(0.5 * dt * dt));

    const newVelocity = this.velocity.clone()
      .add(this.previousAcceleration.clone().add(acceleration).multiplyScalar(0.5 * dt));

    this.previousAcceleration.copy(acceleration);
    this.position.copy(newPosition);
    this.velocity.copy(newVelocity);

    if (this.model) {
      this.model.position.copy(this.position.clone().divideScalar(VISUAL_SCALE));
    }
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);

    if (this.model !== null) {
      this.model.position.copy(this.position);
    }
  }
  
  setScale(x, y, z) {
    this.scale.set(x, y, z);

    if (this.model !== null) {
      this.model.scale.copy(x, y, z);
    }
  }
}

;(function () {
  /* used to dumb childrens of the loaded model (useful for debugging...) */
  function dumpObject(obj, lines = [], isLast = true, prefix = '') {
    const localPrefix = isLast ? '└─' : '├─';
    lines.push(`${prefix}${prefix ? localPrefix : ''}${obj.name || '(unnamed)'} [${obj.type}]`);
    const newPrefix = prefix + (isLast ? '  ' : '│ ');
    const lastNdx = obj.children.length - 1;

    obj.children.forEach(function (child, ndx) {
      const isLast = ndx === lastNdx;
      dumpObject(child, lines, isLast, newPrefix);
    });

    return lines;
  }

  let stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  const scene = new THREE.Scene();
  scene.name = "Scene";

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  /**
   * Skybox Generator:
   * 
   * https://tools.wwwtyro.net/space-3d/index.html
   */
  const skyboxLoader = new THREE.CubeTextureLoader();

  skyboxLoader.load(
    [
      /* positive-x (right), negative-x (left) */
      'assets/textures/skybox/right.png',
      'assets/textures/skybox/left.png',

      /* positive-y (top), negative-y (bottom) */
      'assets/textures/skybox/top.png',
      'assets/textures/skybox/bottom.png',

      /* positive-z (front), negative-z (back) */
      'assets/textures/skybox/front.png',
      'assets/textures/skybox/back.png',
    ],
    function (skyboxTexture) {
      scene.background = skyboxTexture;
    },
    function (loadProgress) {
      console.log('loading skybox (%' + (loadProgress.loaded / loadProgress.total * 100) + ')');
    },
    function (error) {
      console.error('failed to load skybox');
      console.error(error);
    }
  );

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, (EARTH_RADIUS * 3) / VISUAL_SCALE);
  camera.lookAt(0, 0, 0);

  let earth = new Object();
  earth.mass = EARTH_MASS;
  earth.setScale(0.5, 0.5, 0.5);
  earth.loadData("Earth", "assets/models/Earth.glb");
  earth.addToScene(scene);

  let satellite = new Object();
  satellite.mass = 1000;
  satellite.setScale(2, 2, 2);
  satellite.setPosition(EARTH_RADIUS + INIT_ALTITUDE, 0, 0);
  satellite.loadData("Satellite", "assets/models/Satellite2.glb");
  satellite.addToScene(scene);
  
  const orbitalVelocity = Math.sqrt(G * EARTH_MASS / (EARTH_RADIUS + INIT_ALTITUDE));
  satellite.velocity.set(0, orbitalVelocity, 0);

  const light = new THREE.AmbientLight(0xFFFFFF);
  light.name = "AmbientLight";
  scene.add(light);

  const controls = new FlyControls(camera, renderer.domElement);
  controls.movementSpeed = 50;
  controls.rollSpeed = 0.5;
  
  const clock = new THREE.Clock();

  /* TODO check again if we need to mock the function */
  function calculateAirDrag(satellite, earth) {
    const altitude = satellite.position.length() - EARTH_RADIUS;
    if (altitude < 0) return new THREE.Vector3(0, 0, 0); // Below surface
    
    // Calculate air density (exponential model)
    const airDensity = AIR_DENSITY_SEA_LEVEL * Math.exp(-altitude / SCALE_HEIGHT);
    
    // Simple drag model (F = 0.5 * ρ * v² * Cd * A)
    const dragCoefficient = 2.2; // Typical for satellites
    const crossSectionArea = 10; // m² (approximate)
    const speed = satellite.velocity.length();
    
    if (speed === 0) return new THREE.Vector3(0, 0, 0);
    
    const dragMagnitude = 0.5 * airDensity * speed * speed * dragCoefficient * crossSectionArea;
    const dragDirection = satellite.velocity.clone().normalize().negate();
    
    return dragDirection.multiplyScalar(dragMagnitude);
  }

  /**
   * r = length(pos2 - pos1)
   * aE = ((G * mS * mE) / (r * r)) / mE
   * aS = -((G * mS * mE) / (r * r)) / mS
   */
  function calculateGravity(body1, body2) {
    const r = body2.position.clone().sub(body1.position);
    const distance = r.length();
    return r.normalize().multiplyScalar(G * body1.mass * body2.mass / (distance * distance));
  }

  function updateEarth(dt) {
    if (earth.model) {
      earth.model.rotateY(7.292115e-5 * dt);
    }
  }
  
  function updateSatellite(dt) {
    const gravity = calculateGravity(earth, satellite);
    const airDrag = calculateAirDrag(satellite, earth);
    
    const totalForce = gravity.add(airDrag);
    const acceleration = totalForce.divideScalar(satellite.mass);
    
    satellite.updatePhysics(dt, acceleration);

    // Orient satellite to velocity
    if (satellite.model && satellite.velocity.lengthSq() > 0.1) {
      const currentPos = satellite.position.clone().divideScalar(VISUAL_SCALE);
      const velocityDir = satellite.velocity.clone().normalize();
      const targetPos = currentPos.clone().add(velocityDir);
      
      // Calculate up vector perpendicular to orbital plane
      const radialVector = satellite.position.clone().normalize();
      const upVector = radialVector.cross(satellite.velocity).normalize();
      
      // Create and apply orientation matrix
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.lookAt(currentPos, targetPos, upVector);
      satellite.model.quaternion.setFromRotationMatrix(rotationMatrix);
      
      // If model's forward is Z-axis, rotate 90 degrees on X
      satellite.model.rotateX(Math.PI/2); 
    }
  }

  function updateObjects(dt) {
    updateEarth(dt);
    updateSatellite(dt);
  }

  function update() {
    requestAnimationFrame(update);
    const dt = Math.min(clock.getDelta(), 0.1); /* control (cap) delta time */
    updateObjects(dt);
    controls.update(dt);
    renderer.render(scene, camera);
    stats.update();
  }

  window.onresize = function () {
    const width = window.innerWidth, height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.requestAnimationFrame(update);
})();
