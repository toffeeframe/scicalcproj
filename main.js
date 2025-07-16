/**
 * TODO
 * 
 * [x] Implement constants/imports
 * [x] Implement SpaceObject class
 * [x] Implement routines in IIFE
 * [o] Implement simulation logic (things are asynchronous?)
 * [o] Implement UI
 * [o] Implement dynamic satellites (TODO fix movement)
 * 
 * TODO
 * 
 * 1. fix objects movement (weirdo satellite problem)
 * 2. implement UI and ability to control things through it
 * 3. cleanup code
 * 4. finalize any other steps
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import GUI from 'lil-gui';

/* ===== Constants ===== */

/* TODO pull some of them out of being global (SHOULD I?) */

const G = 6.67430e-11,
  EARTH_MASS = 5.972e24, /* in kg */
  EARTH_RADIUS = 6.371e6,
  SATELLITE_MASS = 1000, /* in kg */
  INIT_ALTITUDE = 500e3,
  VISUAL_SCALE = 1e5,    /* control scale of results */
  TIME_STEP = 60,       /* timestep for physics update (6 secs), shall be removed? */

  /* for atmosphere */
  AIR_DENSITY_SEA_LEVEL = 1.225, /* in kg/m^3 */
  SCALE_HEIGHT = 8500, /* in metres (m) */


  simulationObjectTypes = ["None", "Earth", "Satellite"],
  OBJECT_TYPE_NONE = 0,
  OBJECT_TYPE_EARTH = 1,
  OBJECT_TYPE_SATELLITE = 2;

let simulationObjects = {
  earthPlanets: [],
  satellites: []
};

/* ===== SimulationObject ===== */


/* TODO link satellites with earth planets? */
class SimulationObject {
  position = new THREE.Vector3(0, 0, 0);
  rotation = new THREE.Euler(0, 0, 0, 'XYZ');
  scale = new THREE.Vector3(1, 1, 1);
  velocity = new THREE.Vector3(0, 0, 0);
  previousAcceleration = new THREE.Vector3(0, 0, 0);
  mass = 0;
  isModelLoaded = false;
  isInScene = false;
  model = null;
  name = "(unnamed)";
  type = OBJECT_TYPE_NONE;

  static nextId = 0;
  id = SimulationObject.nextId++;

  constructor(name = "", type = 0) {
    this.name = name || `SimulationObject${this.id}`;
    this.type = type;
  }

  async loadModel(src) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        src,
        (gltf) => {
          this.model = gltf.scene;
          this.model.name = this.name;
          this.model.position.copy(this.position.clone().divideScalar(VISUAL_SCALE));
          this.model.rotation.copy(this.rotation);
          this.model.scale.copy(this.scale);
          this.isModelLoaded = true;
          resolve(this);
        },
        (progress) => {
          console.log(`Loading ${this.name}: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
        },
        (error) => {
          console.error(`Failed to load ${this.name}:`, error);
          reject(error);
        }
      );
    });
  }

  addToScene(scene) {
    if (this.model && !this.isInScene) {
      scene.add(this.model);
      this.isInScene = true;
    }
  }

  removeFromScene(scene) {
    if (this.model && this.isInScene) {
      scene.remove(this.model);
      this.isInScene = false;
    }
  }

  updatePhysics(dt, acceleration) {
    // Verlet integration
    const newPosition = this.position.clone()
      .add(this.velocity.clone().multiplyScalar(dt))
      .add(this.previousAcceleration.clone().multiplyScalar(0.5 * dt * dt));

    const newVelocity = this.velocity.clone()
      .add(this.previousAcceleration.clone().add(acceleration).multiplyScalar(0.5 * dt));

    this.previousAcceleration.copy(acceleration);
    this.position.copy(newPosition);
    this.velocity.copy(newVelocity);

    if (this.model)
      this.model.position.copy(this.position.clone().divideScalar(VISUAL_SCALE));
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);

    if (this.model)
      this.model.position.copy(this.position.clone().divideScalar(VISUAL_SCALE));
  }

  setScale(x, y, z) {
    this.scale.set(x, y, z);

    if (this.model)
      this.model.scale.copy(this.scale);
  }

  /* TODO can this function implemented in better way? */
  clone() {
    let clonedObj = new SimulationObject(this.name, this.type);

    clonedObj.position.copy(this.position);
    clonedObj.rotation.copy(this.rotation);
    clonedObj.scale.copy(this.scale);
    clonedObj.velocity.copy(this.velocity);
    clonedObj.previousAcceleration.copy(this.previousAcceleration);
    clonedObj.mass = this.mass;
    clonedObj.model = this.model;
    clonedObj.model.position.copy(this.model.position);
    clonedObj.model.rotation.copy(this.model.rotation);
    clonedObj.model.scale.copy(this.model.scale);
    clonedObj.isModelLoaded = this.isModelLoaded;
    clonedObj.isInScene = this.isInScene;

    return clonedObj;
  }
}

; (function () {
  /* [DEBUG] used to dumb childrens of the loaded model */
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

  function calculateAirDrag(satObj, options = null) {
    const altitude = satObj.position.length() - EARTH_RADIUS;
    if (altitude < 0) return new THREE.Vector3(0, 0, 0);

    let dragCoefficient = ((options !== null && typeof options.dragCoefficient === "number") ? options.dragCoefficient : 2.2),
        crossSectionArea = ((options !== null && typeof options.crossSectionArea === "number") ? options.crossSectionArea : 10),
        airDensitySeaLevel = ((options !== null && typeof options.airDensitySeaLevel === "number") ? options.airDensitySeaLevel : AIR_DENSITY_SEA_LEVEL),
        scaleHeight = ((options !== null && typeof options.scaleHeight === "number") ? options.scaleHeight : SCALE_HEIGHT);

    const airDensity = airDensitySeaLevel * Math.exp(-altitude / scaleHeight),
          speed = satObj.velocity.length();

    if (speed === 0) return new THREE.Vector3(0, 0, 0);

    const dragMagnitude = 0.5 * airDensity * speed * speed * dragCoefficient * crossSectionArea;

    return satObj.velocity.clone().normalize().negate().multiplyScalar(dragMagnitude);
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

  /* we ain't study applied forces on earth, so just do the daily spinning thing */
  function updateEarth(earthObj, dt) {
    if (earthObj.model) {
      earthObj.model.rotateY(7.292115e-5 * dt);
    }
  }

  /* we would apply gravity and air drag forces on the satellite */
  function updateSatellite(satObj, earthObj, dt) {
    const gravity = calculateGravity(earthObj, satObj);
    const airDrag = calculateAirDrag(satObj);

    const totalForce = gravity.add(airDrag);
    const acceleration = totalForce.divideScalar(satObj.mass);

    satObj.updatePhysics(dt, acceleration);

    // Orient satellite to velocity
    if (satObj.model && satObj.velocity.lengthSq() > 0.1) {
      const currentPos = satObj.position.clone().divideScalar(VISUAL_SCALE);
      const velocityDir = satObj.velocity.clone().normalize();
      const targetPos = currentPos.clone().add(velocityDir);

      // Calculate up vector perpendicular to orbital plane
      const radialVector = satObj.position.clone().normalize();
      const upVector = radialVector.cross(satObj.velocity).normalize();

      // Create and apply orientation matrix
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.lookAt(currentPos, targetPos, upVector);
      satObj.model.quaternion.setFromRotationMatrix(rotationMatrix);

      // If model's forward is Z-axis, rotate 90 degrees on X
      satObj.model.rotateX(Math.PI / 2);
    }
  }

  /* TODO better fix nested-loop design by linking satellites with planets? */
  function updateObjects(dt) {
    simulationObjects.earthPlanets.forEach(earthPlanetObject => {
      if (earthPlanetObject.isInScene) {
        updateEarth(earthPlanetObject, dt);

        simulationObjects.satellites.forEach(satelliteObject => {
          if (satelliteObject.isInScene) {
            updateSatellite(satelliteObject, earthPlanetObject, dt);
          }
        });
      }
    });
  }

  let stats = new Stats();
  stats.showPanel(0);

  const ui_data = {
    addEarth: function() {
      addObject(OBJECT_TYPE_EARTH);
    },

    addSatellite: function() {
      addObject(OBJECT_TYPE_SATELLITE);
    }
  }

  let gui = new GUI();
  gui.add(ui_data, 'addEarth').name("Add Earth");
  gui.add(ui_data, 'addSatellite').name("Add Satellite");

  let simulationObjectsFolder = gui.addFolder("Simulation Objects");

  let scene = new THREE.Scene();
  scene.name = "Scene";

  let renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, (EARTH_RADIUS * 3) / VISUAL_SCALE);
  camera.lookAt(0, 0, 0);

  let light = new THREE.AmbientLight(0xFFFFFF);
  light.name = "AmbientLight";

  let clock = new THREE.Clock();

  const earthTemplateObject = new SimulationObject("EarthTemplate", OBJECT_TYPE_EARTH);
  earthTemplateObject.setScale(0.5, 0.5, 0.5);
  earthTemplateObject.mass = EARTH_MASS;

  const satelliteTemplateObject = new SimulationObject("SatelliteTemplate", OBJECT_TYPE_SATELLITE);
  satelliteTemplateObject.setScale(2, 2, 2);
  satelliteTemplateObject.setPosition(EARTH_RADIUS + INIT_ALTITUDE, 0, 0);
  satelliteTemplateObject.mass = SATELLITE_MASS;

  document.body.appendChild(stats.dom);
  document.body.appendChild(renderer.domElement);
  scene.add(light);

  let controls = new FlyControls(camera, renderer.domElement);
  controls.movementSpeed = 5;
  controls.rollSpeed = 0.01;

  const orbitalVelocity = Math.sqrt(G * EARTH_MASS / (EARTH_RADIUS + INIT_ALTITUDE));
  earthTemplateObject.velocity.set(0, orbitalVelocity, 0);

  async function loadAssets() {
    /**
      * Skybox Generator:
      * 
      * https://tools.wwwtyro.net/space-3d/index.html
      */
    const skyboxLoader = new THREE.CubeTextureLoader();

    return new Promise((resolve, reject) => {
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
          resolve();
        },
        function (loadProgress) {
          /* (debug) */
          console.log('loading skybox (%' + (loadProgress.loaded / loadProgress.total * 100) + ')');
        },
        function (error) {
          console.error('failed to load skybox');
          console.error(error);
          reject();
        }
      );
    })
      .then((result) => { return earthTemplateObject.loadModel("assets/models/Earth.glb"); })
      .then((result) => { return satelliteTemplateObject.loadModel("assets/models/Satellite2.glb"); })
      .catch((error) => console.error(error));
  }

  /* TODO add focus and ability to control the objects (after implementing UI) */
  function addObject(type) {
    let pushedObject = null;

    if (type === OBJECT_TYPE_EARTH) {
      simulationObjects.earthPlanets.push(earthTemplateObject.clone());

      pushedObject = simulationObjects.earthPlanets.at(-1);
      pushedObject.name = "Earth" + pushedObject.id;

      /* (debug) */
      console.log(pushedObject);
    } else if (type === OBJECT_TYPE_SATELLITE) {
      simulationObjects.satellites.push(satelliteTemplateObject.clone());

      pushedObject = simulationObjects.satellites.at(-1);
      pushedObject.name = "Satellite" + pushedObject.id;

      /* (debug) */
      console.log(pushedObject);
    }

    /* TODO make a choice to delete the object if wanted (from it's folder) */
    pushedObject.addToScene(scene);

    /* TODO implement UI functions */
    let pushedObjectFolder = simulationObjectsFolder.addFolder(pushedObject.name + " (ID : " + pushedObject.id + ")");

    /* TODO this has to do with addition/deletion of objects */
    pushedObjectFolder.add(pushedObject, 'isInScene').name("");

    /* TODO modify SimulationObject to add ability to control forces (modify, enable, disable) */
    pushedObjectFolder.add(pushedObject, 'mass').name("Mass (kg)");
    
    let pushedObjectPositionFolder = pushedObjectFolder.addFolder("Position");
    pushedObjectPositionFolder.add(pushedObject.position, 'x').name("X").onChange(function() {});
    pushedObjectPositionFolder.add(pushedObject.position, 'y').name("Y").onChange(function() {});
    pushedObjectPositionFolder.add(pushedObject.position, 'z').name("Z").onChange(function() {});

    let pushedObjectRotationFolder = pushedObjectFolder.addFolder("Rotation");
    pushedObjectRotationFolder.add(pushedObject.rotation, 'x').name("X").onChange(function() {});
    pushedObjectRotationFolder.add(pushedObject.rotation, 'y').name("Y").onChange(function() {});
    pushedObjectRotationFolder.add(pushedObject.rotation, 'z').name("Z").onChange(function() {});

    let pushedObjectScaleFolder = pushedObjectFolder.addFolder("Scale");
    pushedObjectScaleFolder.add(pushedObject.scale, 'x').name("X").onChange(function() {});
    pushedObjectScaleFolder.add(pushedObject.scale, 'y').name("Y").onChange(function() {});
    pushedObjectScaleFolder.add(pushedObject.scale, 'z').name("Z").onChange(function() {});
  }

  function update() {
    requestAnimationFrame(update);
    const dt = Math.min(clock.getDelta(), 0.1) * TIME_STEP; /* control (cap) delta time */
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

  loadAssets().then((result) => {
    window.requestAnimationFrame(update);
  }).catch((error) => {
    console.error("Failed to launch project: \n" + error);
  });
})();
