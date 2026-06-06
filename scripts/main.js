import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { PerformanceMonitor } from './utils/performanceMonitor.js'
import { FrameProfiler } from './utils/frameProfiler.js';

import { ObjectBVH, acceleratedRaycast, INTERSECTED, NOT_INTERSECTED, computeBatchedBoundsTree } from 'three-mesh-bvh';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor("#262837");
renderer.setPixelRatio(window.devicePixelRatio);

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const mouse = new THREE.Vector2();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.set(-70,70,50);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = true;
controls.minDistance=0.1;
controls.maxDistance=150;
controls.minPolarAngle=0;
controls.maxPolarAngle=3;
controls.autoRotate=false;
controls.target = new THREE.Vector3(21, 30, -30);
controls.rotateSpeed = 0.15;
controls.zoomSpeed = 0.50;
controls.panSpeed = 0.50;
controls.update();

const light = new THREE.DirectionalLight(0xffffff, 0.5);
light.position.set( 10,10,0 )
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Color, Intensity
scene.add(ambientLight);

const gridHelper = new THREE.GridHelper( 100, 50 ); // ( size, divisions )
gridHelper.position.set(21, -1, -30);
scene.add( gridHelper );

const perfMonitor = new PerformanceMonitor();
const profiler = new FrameProfiler(60);

const raycaster = new THREE.Raycaster();
THREE.Mesh.prototype.raycast = acceleratedRaycast;
raycaster.firstHitOnly = true;

const CONSTANTS = {
    SEARCH_RADIUS: 15,
    FOCUS_RADIUS: 15,
    changeLODcolor: true
}


function animate() {
    perfMonitor.update(renderer, scene);
    
    requestAnimationFrame( animate );
    renderer.render( scene, camera )

}

animate()