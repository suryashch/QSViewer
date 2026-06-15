import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { PerformanceMonitor } from './utils/PerformanceMonitor.js';
import { FrameProfiler } from './utils/FrameProfiler.js';

import { ObjectBVH, acceleratedRaycast, INTERSECTED, NOT_INTERSECTED, computeBatchedBoundsTree } from 'three-mesh-bvh';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor("#8f8f8f");
// renderer.setClearColor("#262837");
renderer.setPixelRatio(window.devicePixelRatio);

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const mouse = new THREE.Vector2();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
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

const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Color, Intensity, 0.5
scene.add(ambientLight);

const gridHelper = new THREE.GridHelper( 100, 50, 0x444444, 0x444444 ); // ( size, divisions )
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
    changeLODcolor: true,
    darkMode: false
}

let struct_bvh;
let bvh;
let bm;
let bvh_group = new THREE.Group();
let struct_group = new THREE.Group();

let focusIds = new Set();
let referenceIds = new Set();
let facadeIds = new Set();

const loader = new GLTFLoader().setPath('public/models/');

init();

async function init() {
    let material_map = new Map();
    let struct_map = new Map();

    const _focus = [
        // "sixty5-mep_hires.glb",
        // "sixty5-mep_lowres.glb",
        // "sixty5-W-installatie_hires.glb",
        // "sixty5-W-installatie_lowres.glb",
    ]; // this group changes color

    const _reference = [
        "sixty5-mep_hires.glb",
        "sixty5-mep_lowres.glb",
        "sixty5-W-installatie_hires.glb",
        "sixty5-W-installatie_lowres.glb",
        "sixty5-interiors-kitchens-final.glb",
        "sixty5-architectural-interiors-final.glb",
        "sixty5-E-installatie.glb",
        // "sixty5-architectural-insulation-final.glb"
    ]; // this group just stays as is
    
    const _facade = [
        "sixty5-architectural-facade-final.glb",
        "sixty5-structural.glb",
    ]; // this group turns transparent

    const defaultMaterial = new THREE.MeshLambertMaterial({
        color: "#717171",
    });

    const structMaterial = new THREE.MeshLambertMaterial({
        color: "#d9d8d8",
        transparent: true,
        opacity: 1.0,
        depthTest: true,
        depthFunc: THREE.LessDepth,
    });
    
    material_map = await initFiles( _focus, material_map, "focus", defaultMaterial );
    material_map = await initFiles( _reference, material_map, "reference", defaultMaterial );
    struct_map = await initFiles( _facade, struct_map, "facade", structMaterial );

    for (const material of material_map.keys()) {

        const meshes = material_map.get( material );
        const bm = await createBatchedMesh( meshes, material );
        bvh_group.add( bm );
    }

    for (const material of struct_map.keys()) {

        const meshes = struct_map.get( material );
        const bm = await createBatchedMesh( meshes, material );
        struct_group.add( bm );
    }
    
    bvh = new ObjectBVH( [bvh_group, struct_group] );

    scene.add( bvh_group );
    scene.add( struct_group );

    material_map = null;

    configGUI();
    requestRender();
}
 
async function initFiles( files, material_map, qsGroup= null, defMaterial= null ) {
    let material;

    if (!defMaterial) {
        material = new THREE.MeshStandardMaterial({
            color: "#e6e6e6",
            transparent: true,
            opacity: 1.0,
            depthWrite: true
        });
    } else {
        material = defMaterial;
    }
    
    for (const _file of files) {
        const gltf = await loader.loadAsync( _file );

        const [name, res] = _file.split("_");

        if (res === "lowres.glb") {
            material_map = await appendMaterialMap( gltf, material_map, material );
        } else if (name === "sixty5-mep" || name === "sixty5-W-installatie"){
            material_map = await createMaterialMap( gltf, material_map, qsGroup, material, new THREE.Color( "#F600C1" ) );
        } else {
            material_map = await createMaterialMap( gltf, material_map, qsGroup, material  );
        }
    };

    return material_map;
}


function createMaterialMap( gltf, material_map, qsGroup, defMaterial=null, color=null ){

    gltf.scene.traverse((child) => {
        if ( child.userData.mesh_id ) {

            if ( !child.isMesh ) {
                for (const subchild of child.children) {
                    
                    subchild.userData.mesh_id = subchild.name;

                };
            }
            
            const meshId = child.userData.mesh_id;

            let material;
            let geometry;
            let inst_matrix;
            
            if (child.children.length > 0){
                
                for (const subchild of child.children) {
                    
                    subchild.userData.mesh_id = subchild.name;

                };
                
                return;   // If the object has more than one child (due to multiple materials), append the mesh_id onto the children and continue
            };

            if (child.material.transparent && child.material.opacity < 0.5) {
                return
            }

            geometry = child.geometry;
            inst_matrix = child.matrixWorld;

            let childMaterialColor;

            if ( defMaterial ) {
                material = defMaterial;
            } else {
                material = child.material;
            }

            if ( color ) {
                childMaterialColor = color;
            } else {
                childMaterialColor = child.material.color;
            }

            if ( !material_map.has( material ) ) {
                material_map.set( material, {
                    unique_geoms: new Map(),
                    vCount: 0,
                    iCount: 0,
                    instCount: 0
                });
            };

            const material_key = material_map.get( material );
            material_key.instCount++;

            if ( !material_key.unique_geoms.has( meshId )) {
                material_key.unique_geoms.set( meshId, {
                    geometry: null,
                    qsGroup: null,
                    lowres_geometry: null,
                    color: null,
                    matrices: []
                });

                material_key.vCount += geometry.attributes.position.count;
                material_key.iCount += geometry.index.count;
            
            } 
            
            material_key.unique_geoms.get( meshId ).geometry = geometry;
            material_key.unique_geoms.get( meshId ).qsGroup = qsGroup;
            material_key.unique_geoms.get( meshId ).color = childMaterialColor;
            material_key.unique_geoms.get( meshId ).matrices.push( inst_matrix );            

        };
    });

    return material_map;
}

function appendMaterialMap(gltf, material_map, defMaterial=null ) {
    let visited = new Set();

    gltf.scene.traverse(( child ) => {

        if ( 
            child.userData.mesh_id &&
            !visited.has(child.userData.mesh_id)
        ) {
            const meshId = child.userData.mesh_id;

            let material;
            let geometry;

            if (child.children.length > 0){
                for (const subchild of child.children) {
                    subchild.userData.mesh_id = meshId;
                };
                console.log(child)
                
                return;     // If the object has more than one child (due to mutliple materials) only select the first
            };

            geometry = child.geometry;

            if ( defMaterial ) {
                material = defMaterial;
            } else {
                material = child.material;
            }
            
            let material_key;

            if ( !material_map.has(material) ) {
                for (const material of material_map.keys()) {   // If material map does not have material, loop through all mesh ids until we find it
                    if (material.has( meshId )) {
                        material_key = material_map.get( material );
                        break;
                    }
                };
                
                return;

            } else {
                material_key = material_map.get( material );
            }

            if (material_key.unique_geoms.has( meshId )) {
                material_key.unique_geoms.get( meshId ).lowres_geometry = geometry;

                material_key.instCount++;
                material_key.vCount += geometry.attributes.position.count;
                material_key.iCount += geometry.index.count;
            }
            
        }
    });

    return material_map;
}

function createBatchedMesh( meshes, material ){

    const batchedMesh = new THREE.BatchedMesh(
        meshes.instCount,
        meshes.vCount,
        meshes.iCount,
        material
    );

    batchedMesh.hiresGeomIdFor = [];
    batchedMesh.lowresGeomIdFor = [];
    batchedMesh.colors = [];

    meshes.unique_geoms.forEach((mesh) => {
        const geom = mesh.geometry;
        const lowres_geom = mesh.lowres_geometry;
        const matrices = mesh.matrices;
        const color = mesh.color;
        const qsGroup = mesh.qsGroup;

        if (matrices.length > 0){
            const geom_id = batchedMesh.addGeometry( geom );
            let lowres_geom_id;

            if ( lowres_geom ) {
                lowres_geom_id = batchedMesh.addGeometry( lowres_geom );
            } else {
                lowres_geom_id = geom_id;
            }

            for ( let i=0; i < matrices.length; i++){
                const instanceId = batchedMesh.addInstance(lowres_geom_id)
                batchedMesh.setMatrixAt( instanceId, matrices[i] )

                batchedMesh.setColorAt( instanceId, color);
                batchedMesh.colors[ instanceId ] = color;

                batchedMesh.hiresGeomIdFor[ instanceId ] = geom_id;
                batchedMesh.lowresGeomIdFor[ instanceId ] = lowres_geom_id;

                batchedMesh.qsGroup = qsGroup;

                if (qsGroup === "focus") {
                    focusIds.add(instanceId);
                } else if ( qsGroup === "reference") {
                    referenceIds.add(instanceId)
                    batchedMesh.setVisibleAt(instanceId, false)
                } else if ( qsGroup === "facade") {
                    facadeIds.add(instanceId)
                };

            };
        };

    });

    batchedMesh.needsUpdate = true;

    return batchedMesh;

}


const querySphere = new THREE.Sphere();
let prevNear = new Set();
let prevStruct = new Set();

const highlightColor = new THREE.Color( "#F600C1" );
const nonHighlightColor = new THREE.Color( "#d8d8d8" );

const structTrans = new THREE.Vector4(0, 0, 0.55, 0.25);

function queryNearInstances( cameraPos ) {

    const nearIds = new Set();
    const structIds = new Set();

    querySphere.center.copy( cameraPos );
    querySphere.radius = CONSTANTS.SEARCH_RADIUS;

    bvh.shapecast({

        intersectsBounds : ( box ) => {

            if (!querySphere.intersectsBox( box )) return NOT_INTERSECTED;
            return INTERSECTED;
        },
        intersectsObject : ( object, instanceId ) => {

            object.setGeometryIdAt( instanceId, object.hiresGeomIdFor[ instanceId ] );
            
            if (object.qsGroup === "facade") {
                object.setColorAt( instanceId, structTrans )
                structIds.add(instanceId);
            } else if (object.qsGroup === "reference" || object.qsGroup === "focus") {
                if (focusIds.has(instanceId)){
                    if ( CONSTANTS.changeLODcolor ) {
                        object.setColorAt( instanceId, highlightColor );
                    }
                } else if (referenceIds.has(instanceId)){
                    object.setVisibleAt( instanceId, true )
                }
                nearIds.add( instanceId );
            }

            return false;
        }

    });

    return [nearIds, structIds];
};

function updateLODs( cameraPos ) {

    const [newNear, newStruct] = queryNearInstances( cameraPos );
    const bm = bvh_group.children.find(child => child.isBatchedMesh);

    const struct_bm = struct_group.children.find(child => child.isBatchedMesh);

    prevNear.forEach(( id ) =>{

        if (!newNear.has( id )) {

            if (focusIds.has(id)){
                bm.setGeometryIdAt( id, bm.lowresGeomIdFor[ id ] );
                if ( CONSTANTS.changeLODcolor ) {
                    bm.setColorAt( id, nonHighlightColor );
                }
            } else if (referenceIds.has(id)){
                bm.setVisibleAt( id, false );
            }
        };
    });

    prevStruct.forEach(( id ) =>{
        const structOpaque = new THREE.Vector4(struct_bm.colors[id].r, struct_bm.colors[id].g, struct_bm.colors[id].b, 1);

        if (!newStruct.has( id )) {

            if (facadeIds.has(id)){
                struct_bm.setColorAt( id, structOpaque )
            }
            
        };
    });

    prevNear = newNear;
    prevStruct = newStruct;
};

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function configGUI() {

    const gui = new GUI();

    gui.add(CONSTANTS, "SEARCH_RADIUS", 0, 30, 1).name("Query Radius").onChange( v => {
        CONSTANTS.FOCUS_RADIUS = v;
        requestRender();
    });

    gui.add(CONSTANTS, "darkMode").name("Dark Mode").onChange( v => {
        const renderBackgroundColor = v ? "#262837" : "#8f8f8f";
        renderer.setClearColor(renderBackgroundColor)
        requestRender();
    })
}

window.addEventListener( 'resize', onWindowResize );

window.addEventListener('dblclick', (event) => {
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects( bvh.objects );

    if (intersects.length > 0) {

        for (let i=0; i<intersects.length; i++) {
            if (! (intersects[i].object.qsGroup === "facade") ) {
                const intersectionPoint = intersects[i].point;

                controls.target.copy( intersectionPoint );
                controls.update();
                break;
            };
        };
        
    };

});

let lastCameraPos = camera.position.clone();
let renderRequested = false;

function render() {

    renderRequested = false;
    
    renderer.render( scene, camera );
    updateLODs( camera.position );

}

function requestRender() {
    
    if (
        !renderRequested &&
        bvh &&
        camera.position != lastCameraPos
    ) {
        renderRequested = true;
        requestAnimationFrame( render );
        perfMonitor.update(renderer, scene);
    };
}

controls.addEventListener( 'change', requestRender);
window.addEventListener( 'resize', requestRender );

renderer.render(scene, camera);

function animate() {
    
    requestAnimationFrame( animate );
    perfMonitor.update(renderer, scene);


}

animate()
