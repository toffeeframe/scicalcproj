/**
 * TODO
 * 
 * [x] Implement constants/imports
 * [x] Implement SpaceObject class
 * [x] Implement routines in IIFE
 * [x] Implement simulation logic (things are asynchronous?)
 * [x] Implement UI
 * [o] Implement dynamic satellites (TODO fix movement)
 * 
 * TODO
 * 
 * 1. fix objects movement (weirdo satellite problem)
 * 2. fix the weird checkbox (it doesn't remove object from scene)
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

  OBJECT_TYPE_NONE = 0,
  OBJECT_TYPE_EARTH = 1,
  OBJECT_TYPE_SATELLITE = 2;

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
  enableForces = true;
  enableGravity = true;

  model = null;
  name = "(unnamed)";
  type = OBJECT_TYPE_NONE;

  static nextId = 0;
  id = SimulationObject.nextId++;

  constructor(name = "", type = 0) {
    this.name = name || `SimulationObject${this.id}`;
    this.type = type;

    if (this.type == OBJECT_TYPE_SATELLITE) {
      this.enableAirDrag = true;

      this.airDragCustomPreferences = {
        dragCoefficient: 2.2,
        crossSectionArea: 10,
        airDensitySeaLevel: AIR_DENSITY_SEA_LEVEL,
        scaleHeight: SCALE_HEIGHT
      };
    }
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
    if (this.model !== null && this.isModelLoaded && !this.isInScene) {
      scene.add(this.model);
      this.isInScene = true;
    }
  }

  removeFromScene(scene) {
    if (this.model !== null && this.isModelLoaded && this.isInScene) {
      scene.remove(scene.getObjectByName(this.name));
      this.isInScene = false;
    }
  }

  updatePhysics(dt, acceleration) {
    if (!this.enableForces) return;

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

  clone() {
    let clonedObj = new SimulationObject(this.name, this.type);

    clonedObj.position = this.position.clone();
    clonedObj.rotation = this.rotation.clone();
    clonedObj.scale = this.scale.clone();
    clonedObj.velocity = this.velocity.clone();
    clonedObj.previousAcceleration = this.previousAcceleration.clone();
    clonedObj.mass = this.mass;
    clonedObj.model = this.model.clone();
    clonedObj.isModelLoaded = this.isModelLoaded;
    clonedObj.isInScene = this.isInScene;
    clonedObj.enableForces = this.enableForces;
    clonedObj.enableGravity = this.enableGravity;

    if (clonedObj.type == OBJECT_TYPE_SATELLITE) {
      clonedObj.enableAirDrag = this.enableAirDrag;

      clonedObj.airDragCustomPreferences = {
        dragCoefficient: this.airDragCustomPreferences.dragCoefficient,
        crossSectionArea: this.airDragCustomPreferences.crossSectionArea,
        airDensitySeaLevel: this.airDragCustomPreferences.airDensitySeaLevel,
        scaleHeight: this.airDragCustomPreferences.scaleHeight
      };
    }

    return clonedObj;
  }
}

; (function () {
  let simulationObjects = {
    earthPlanets: [],
    satellites: []
  };

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
    let gravity = (satObj.enableGravity ? calculateGravity(earthObj, satObj) : new THREE.Vector3(0, 0, 0)),
      airDrag = (satObj.enableAirDrag ? calculateAirDrag(satObj, satObj.airDragCustomPreferences) : new THREE.Vector3(0, 0, 0));

    const totalForce = gravity.add(airDrag);
    const acceleration = totalForce.divideScalar(satObj.mass);

    satObj.updatePhysics(dt, acceleration);

    // Orient satellite to velocity
    /* TODO satellite orbiting problems has to do with this? */
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

  /**
   * TODO better fix nested-loop design by linking satellites with planets?
   * 
   * Solution: we can prevent making more than one Earth planet, Ideal right?
   * 
   * */
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
  //stats.dom.style.position = "fixed";
  stats.dom.style.transform = "scale(1.5)";
  stats.dom.style.transformOrigin = "top left"; /* scale from origin */
  stats.showPanel(0);

  const ui_data = {
    addEarth: function () {
      addObject(OBJECT_TYPE_EARTH);
    },

    addSatellite: function () {
      addObject(OBJECT_TYPE_SATELLITE);
    }
  }

  let gui = new GUI();
  //gui.domElement.style.position = "fixed";
  gui.domElement.style.transform = "scale(1.5)";
  gui.domElement.style.transformOrigin = "top right"; /* scale from origin */

  gui.add(ui_data, 'addEarth').name("Add Earth");
  gui.add(ui_data, 'addSatellite').name("Add Satellite");

  let simulationObjectsFolder = gui.addFolder("Simulation Objects");

  let scene = new THREE.Scene();
  scene.name = "Scene";

  let renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, (EARTH_RADIUS * 3) / VISUAL_SCALE);
  camera.lookAt(0, 0, 0);

  let light = new THREE.AmbientLight(0xFFFFFF);
  light.name = "AmbientLight";

  let clock = new THREE.Clock();

  const earthTemplateObject = new SimulationObject("EarthTemplate", OBJECT_TYPE_EARTH);
  earthTemplateObject.setScale(0.5, 0.5, 0.5);
  earthTemplateObject.mass = EARTH_MASS;

  /* TODO smth wrong with initial settings of satellite? (need to figure out that to fix movement) */

  const satelliteTemplateObject = new SimulationObject("SatelliteTemplate", OBJECT_TYPE_SATELLITE);
  satelliteTemplateObject.setScale(1, 1, 1);
  satelliteTemplateObject.setPosition(EARTH_RADIUS + INIT_ALTITUDE, 0, 0);
  satelliteTemplateObject.mass = SATELLITE_MASS;

  const orbitalVelocity = Math.sqrt(G * EARTH_MASS / (EARTH_RADIUS + INIT_ALTITUDE));
  satelliteTemplateObject.velocity.set(0, orbitalVelocity, 0);

  document.body.appendChild(stats.dom);
  document.body.appendChild(renderer.domElement);
  scene.add(light);

  let controls = new FlyControls(camera, renderer.domElement);
  controls.movementSpeed = 5;
  controls.rollSpeed = 0.01;
  controls.dragToLook = true;

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
  
  function addObject(type) {
    let pushedObject = null;

    if (type === OBJECT_TYPE_EARTH) {
      simulationObjects.earthPlanets.push(earthTemplateObject.clone());

      pushedObject = simulationObjects.earthPlanets.at(-1);
      pushedObject.name = "Earth" + pushedObject.id;
      console.log(simulationObjects.earthPlanets);
    } else if (type === OBJECT_TYPE_SATELLITE) {
      simulationObjects.satellites.push(satelliteTemplateObject.clone());

      pushedObject = simulationObjects.satellites.at(-1);
      pushedObject.name = "Satellite" + pushedObject.id;
      console.log(simulationObjects.satellites);
    }

    pushedObject.model.name = pushedObject.name;

    pushedObject.addToScene(scene);
    console.log(dumpObject(scene));

    let pushedObjectFolder = simulationObjectsFolder.addFolder(pushedObject.name + " (ID : " + pushedObject.id + ")");

    let generalPushedObjectUI = {
      deletePushedObject: function () {
        let objName = pushedObject.name;

        pushedObject.removeFromScene(scene);
        pushedObjectFolder.destroy();

        console.log(dumpObject(scene));

        if (pushedObject.type == OBJECT_TYPE_SATELLITE) {
          let idx = simulationObjects.satellites.findIndex(satellite => satellite.name === objName);

          if (idx !== -1) {
            simulationObjects.satellites.splice(index, 1);
            console.log(simulationObjects.satellites);
          }
        } else if (pushedObject.type == OBJECT_TYPE_EARTH) {
          let idx = simulationObjects.earthPlanets.findIndex(earthPlanet => earthPlanet.name === objName);
          
          if (idx !== -1) {
            simulationObjects.earthPlanets.splice(index, 1);
            console.log(simulationObjects.earthPlanets);
          }
        }
      }
    };

    pushedObjectFolder.add(generalPushedObjectUI, 'deletePushedObject').name("Delete");

    /* TODO this checkbox sucks */
    pushedObjectFolder
      .add(pushedObject, 'isInScene')
      .name("In Scene")
      .onChange(function (value) {
        ((value === true) ? pushedObject.addToScene(scene) : pushedObject.removeFromScene(scene));
        console.log(dumpObject(scene));
      });

    let pushedObjectPhysics = pushedObjectFolder.addFolder("Physics");

    pushedObjectPhysics.add(pushedObject, 'mass').name("Mass (kg)");
    pushedObjectPhysics.add(pushedObject, 'enableForces').name("Enable Forces");

    if (pushedObject.type === OBJECT_TYPE_SATELLITE) {
      let gravityForce = pushedObjectPhysics.addFolder("Gravity");
      gravityForce.add(pushedObject, 'enableGravity').name("Enable");

      let airDragForce = pushedObjectPhysics.addFolder("Air Drag");
      airDragForce.add(pushedObject, 'enableAirDrag').name("Enable");

      airDragForce.add(pushedObject.airDragCustomPreferences, 'dragCoefficient').name("Drag Coefficient (Cd)");
      airDragForce.add(pushedObject.airDragCustomPreferences, 'crossSectionArea').name("Cross Sectional Area");
      airDragForce.add(pushedObject.airDragCustomPreferences, 'airDensitySeaLevel').name("Initial Air Density");
      airDragForce.add(pushedObject.airDragCustomPreferences, 'scaleHeight').name("Scale Height");
    }

    let pushedObjectPositionFolder = pushedObjectFolder.addFolder("Position");

    pushedObjectPositionFolder
      .add(pushedObject.position, 'x')
      .name("X")
      .onChange(function (newPosX) {
        pushedObject.setPosition(newPosX, pushedObject.position.y, pushedObject.position.z);
      });

    pushedObjectPositionFolder
      .add(pushedObject.position, 'y')
      .name("Y")
      .onChange(function (newPosY) {
        pushedObject.setPosition(pushedObject.position.x, newPosY, pushedObject.position.z);
      });

    pushedObjectPositionFolder
      .add(pushedObject.position, 'z')
      .name("Z")
      .onChange(function (newPosZ) {
        pushedObject.setPosition(pushedObject.position.x, pushedObject.position.x, newPosZ);
      });

    /* we ain't implement this for now since we didn't provide a setRotation function for SimulationObject */
    /*
    let pushedObjectRotationFolder = pushedObjectFolder.addFolder("Rotation");
    pushedObjectRotationFolder.add(pushedObject.rotation, 'x').name("X").onChange(function(newRotationX) {});
    pushedObjectRotationFolder.add(pushedObject.rotation, 'y').name("Y").onChange(function(newRotationY) {});
    pushedObjectRotationFolder.add(pushedObject.rotation, 'z').name("Z").onChange(function(newRotationZ) {});
    */

    let pushedObjectScaleFolder = pushedObjectFolder.addFolder("Scale");

    pushedObjectScaleFolder
      .add(pushedObject.scale, 'x')
      .name("X")
      .onChange(function (newScaleX) {
        pushedObject.setScale(newScaleX, pushedObject.scale.y, pushedObject.scale.z);
      });

    pushedObjectScaleFolder
      .add(pushedObject.scale, 'y')
      .name("Y")
      .onChange(function (newScaleY) {
        pushedObject.setScale(pushedObject.scale.x, newScaleY, pushedObject.scale.z);
      });

    pushedObjectScaleFolder
      .add(pushedObject.scale, 'z')
      .name("Z")
      .onChange(function (newScaleZ) {
        pushedObject.setScale(pushedObject.scale.x, pushedObject.scale.y, newScaleZ);
      });
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

  loadAssets().then(function (result) {
    window.requestAnimationFrame(update);
  }).catch(function (error) {
    console.error("Failed to launch project: \n" + error);
  });
})();
