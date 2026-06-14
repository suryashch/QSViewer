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
renderer.setClearColor("#9c9c9c");
// renderer.setClearColor("#262837");
renderer.setPixelRatio(window.devicePixelRatio);

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const mouse = new THREE.Vector2();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-70,70,50);

// const camera = new THREE.OrthographicCamera( window.innerWidth / - 2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / - 2, 10, 1000 );
// scene.add( camera );
// camera.position.set(40,10,25);
// camera.zoom = 10;
// camera.updateProjectionMatrix();

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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Color, Intensity
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
    changeLODcolor: true
}

let struct_bvh;
let bvh;
let bm;
let bvh_group = new THREE.Group();
let struct_group = new THREE.Group();

let focusIds = new Set();
let referenceIds = new Set();
let facadeIds = new Set();


// // Testing - Basic Loader

// // const loader1 = new GLTFLoader().setPath('public/models/');
// // loader1.load('sixty5-architectural-noglass_facade_external.glb', (gltf) => { // 'piperacks_merged.glb
    
// //     const mesh = gltf.scene
// //     mesh.position.set(0,0,0);
// //     mesh.material = new THREE.MeshStandardMaterial({
// //         color:"#e0e0e0",
// //     });
// //     scene.add(mesh);
// // });

// const loader2 = new GLTFLoader().setPath('public/models/');
// loader2.load('sixty5-structural.glb', (gltf) => { // 'piperacks_merged.glb
    
//     const mesh = gltf.scene
//     mesh.position.set(0,0,0);
//     mesh.material = new THREE.MeshStandardMaterial({
//         color:"#e0e0e0",
//     });
//     scene.add(mesh);
// });


const loader = new GLTFLoader().setPath('public/models/');

init();

async function init() {
    let material_map = new Map();

    const _focus = [
        "sixty5-mep_hires.glb",
        "sixty5-mep_lowres.glb",
        "sixty5-W-installatie_hires.glb",
        "sixty5-W-installatie_lowres.glb",
    ]; // this group changes color

    const _reference = [
        "sixty5-interiors-kitchens.glb",
        "sixty5-interiors-kitchens_lowres.glb",
        "sixty5-architectural-noglass_interiors_rev2.glb",
        "sixty5-architectural-noglass_structural_interior.glb",
    ]; // this group just stays as is
    
    const _facade = [
        "sixty5-architectural-noglass_facade_external.glb",
        "sixty5-structural.glb",
    ]; // this group turns transparent

    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: "#717171",
        // transparent: true,
        // opacity: 1.0,
        // depthTest: true,
        // depthWrite: true
    });

    const structMaterial = new THREE.MeshStandardMaterial({
        color: "#717171",
        transparent: true,
        opacity: 1.0,
        // depthTest: true,
        depthWrite: true
    });
    
    material_map = await initFiles( _focus, material_map, "focus", defaultMaterial );
    material_map = await initFiles( _reference, material_map, "reference", defaultMaterial );
    material_map = await initFiles( _facade, material_map, "facade", defaultMaterial );

    for (const material of material_map.keys()) {

        const meshes = material_map.get( material );
        const bm = await createBatchedMesh( meshes, material );
        bvh_group.add( bm );
    }
    
    console.log(bvh_group);
    bvh = new ObjectBVH( bvh_group );

    scene.add( bvh_group );

    material_map = null;
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
        material.transparent = true;
    }
    
    for (const _file of files) {
        const gltf = await loader.loadAsync( _file );

        const [name, res] = _file.split("_");

        if (res === "lowres.glb") {
            material_map = await appendMaterialMap( gltf, material_map, material );
        } else {
            material_map = await createMaterialMap( gltf, material_map, material, qsGroup );
        }
    };

    return material_map;

    // for (const material of material_map.keys()) {

    //     const meshes = material_map.get( material );
    //     const bm = await createBatchedMesh( meshes, material );
    //     bvh_group.add( bm );
    // }
    
    // console.log(bvh_group);

    // bvh = new ObjectBVH( bvh_group );

    // scene.add( bvh_group );

    // material_map = null;
}


function createMaterialMap( gltf, material_map, defMaterial=null, qsGroup ){

    gltf.scene.traverse((child) => {
        if ( child.userData.mesh_id ) {
            
            const meshId = child.userData.mesh_id;
            // console.log(child);

            if (meshId === "166/50248") {
                console.log(child)
            }

            let material;
            let geometry;
            let inst_matrix;
            
            if (child.children.length > 0){
                
                for (const subchild of child.children) {
                    
                    subchild.userData.mesh_id = meshId;

                };
                
                return;   // If the object has more than one child (due to multiple materials), append the mesh_id onto the children and continue
            };

            geometry = child.geometry;
            inst_matrix = child.matrixWorld;

            const childMaterialColor = child.material.color

            if ( defMaterial ) {
                material = defMaterial;
            } else {
                material = child.material;
            }

            // material.transparent = true;

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













// let totalVertexCount = 0;
// let totalIndexCount = 0;
// let totalInstanceCount = 0;

// let hiresGeomIdFor = [];
// let lowresGeomIdFor = [];

// let batchedMesh;
// let bvh;
// let final_map = new Map();


// initDetails();

// async function initDetails() {
//     renderer.render(scene, camera);
//     const loader = new GLTFLoader().setPath( 'public/models/' );
    
//     const status = await loadFiles( loader );
    
//     requestRender();

//     configGUI();

// };

// async function loadFiles( loader ) {
    
//     // Need to sequentially populate the mesh_map

//     const _files = [
//         "sixty5-mep_hires.glb",
//         "sixty5-mep_lowres.glb",
//         "sixty5-W-installatie_hires.glb",
//         "sixty5-W-installatie_lowres.glb"
//     ];

//     for (const fileName of _files) {

//         let gltf = await loadGLTFfile( loader, fileName );
        
//         const [name, res] = fileName.split("_");
        
//         if (res === 'hires.glb') final_map = await initMap( gltf, final_map );
//         if (res === 'lowres.glb') final_map = await appendMap( gltf, final_map );
        
//         gltf = null;

//     };
    
//     batchedMesh = await generateBatchedMesh( final_map );
//     bvh = new ObjectBVH( batchedMesh );
//     scene.add( batchedMesh );

//     return true;
// };

// function loadGLTFfile( loader, fileName ) {
//     const gltf = loader.loadAsync( fileName );

//     return gltf;
// }

// function generateBatchedMesh( final_map, material = new THREE.MeshStandardMaterial()) {

//     const bm = new THREE.BatchedMesh(
//         totalInstanceCount, 
//         totalVertexCount, 
//         totalIndexCount, 
//         material
//     );
    
//     final_map.forEach(( value, key ) => {

//         const hires_geometry = value.get( "geometry_hires" );
//         const matrices = value.get( "matrix" );

//         if (matrices.length > 0) {
            
//             const hires_geomId = bm.addGeometry( hires_geometry );
            
//             let lowres_geomId

//             if ( value.has( "geometry_lowres" ) ) {
//                 lowres_geomId = bm.addGeometry( value.get( "geometry_lowres" ) );
//             } else {
//                 lowres_geomId = hires_geomId; 
//             }

//             for ( let i=0; i < matrices.length; i++ ){

//                 const instanceId = bm.addInstance( lowres_geomId );

//                 bm.setMatrixAt( instanceId, matrices[i] );

//                 hiresGeomIdFor[ instanceId ] = hires_geomId;
//                 lowresGeomIdFor[ instanceId ] = lowres_geomId;
//             };

//         };
//     });

//     // Memory Management
//     final_map.forEach(( value ) => {
//         const hires = value.get( "geometry_hires" );
//         if ( hires ) hires.dispose();

//         const lowres = value.get( "geometry_lowres" );
//         if ( lowres && lowres !== hires ) lowres.dispose();
//     });

//     final_map.clear();
//     final_map = null;
    
//     bm.needsUpdate = true;
//     return bm;
// };

// function initMap( gltf, mesh_map ) {

//     gltf.scene.traverse(( child ) => {

//         if ( child.isMesh ){ 

//             const geom = child.geometry;
//             const mesh_id = child.userData.mesh_id;
            
//             const inst_matrix = child.matrixWorld.clone();

//             if ( !mesh_map.has( mesh_id )) {
                
//                 // If map does not have the uuid already, first create it
                
//                 mesh_map.set( mesh_id, new Map() );

//                 mesh_map.get( mesh_id ).set( "geometry_hires", geom );
//                 mesh_map.get( mesh_id ).set( "matrix", [] );

//                 mesh_map.get( mesh_id ).get( "matrix" ).push( inst_matrix );

//                 totalVertexCount += geom.attributes.position.count;
//                 totalIndexCount += geom.index.count;
//                 totalInstanceCount += 1;
            
//             } else {
                
//                 // Map contains the uuid hence only need to push transformation matrix

//                 mesh_map.get( mesh_id ).get( "matrix" ).push( inst_matrix );
//                 totalInstanceCount += 1;

//             };
//         };
//     });

//     return mesh_map;
// };

// function appendMap( gltf, mesh_map ) {

//     let visited = new Set();

//     gltf.scene.traverse(( child ) => {

//         if ( 
//             child.isMesh && 
//             mesh_map.has( child.userData.mesh_id ) &&
//             !visited.has(child.userData.mesh_id)
//         ) {
//             const mesh_id = child.userData.mesh_id;
//             const geom = child.geometry;
            
//             mesh_map.get( mesh_id ).set( "geometry_lowres", geom );

//             totalVertexCount += geom.attributes.position.count;
//             totalIndexCount += geom.index.count;
//             totalInstanceCount += 1;

//             visited.add( mesh_id );
            
//         };
//     });

//     return mesh_map;
// };


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
            
            if (focusIds.has(instanceId)){
                if ( CONSTANTS.changeLODcolor ) {
                    object.setColorAt( instanceId, highlightColor );
                }
            } else if (referenceIds.has(instanceId)){
                object.setVisibleAt( instanceId, true )
            } else if (facadeIds.has(instanceId)) {
                object.setColorAt( instanceId, structTrans )
            }

            nearIds.add( instanceId );
            return false;
        }

    });

    return nearIds;
};

function updateLODs( cameraPos ) {

    const newNear = queryNearInstances( cameraPos );
    const bm = bvh_group.children.find(child => child.isBatchedMesh);

    const struct_bm = struct_group.children.find(child => child.isBatchedMesh);

    // newNear.forEach(( id ) => {

    //     if (!prevNear.has( id )) {

    //         bm.setGeometryIdAt( id, bm.hiresGeomIdFor[ id ] );
    //         if (focusIds.has(id)){
    //             if ( CONSTANTS.changeLODcolor ) {
    //                 bm.setColorAt( id, highlightColor );
    //             }
    //         } else if (facadeIds.has(id)){
    //             bm.setColorAt( id, structTrans )
    //         }
    //     };
    // });

    prevNear.forEach(( id ) =>{
        const structOpaque = new THREE.Vector4(bm.colors[id].r, bm.colors[id].g, bm.colors[id].b, 1);

        if (!newNear.has( id )) {

            if (focusIds.has(id)){
                bm.setGeometryIdAt( id, bm.lowresGeomIdFor[ id ] );
                if ( CONSTANTS.changeLODcolor ) {
                    bm.setColorAt( id, nonHighlightColor );
                }
            } else if (referenceIds.has(id)){
                bm.setVisibleAt( id, false );
            } else if (facadeIds.has(id)){
                bm.setColorAt( id, structOpaque )
            }
            
            // bm.setColorAt( id, nonHighlightColor );
        };
    });


    prevNear = newNear;
};

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function configGUI() {

    const gui = new GUI();

    gui.add(CONSTANTS, "FOCUS_RADIUS", 0, 20, 1).name("Search Radius").onChange( v => {
        CONSTANTS.FOCUS_RADIUS = v;
        requestRender();
    });

    gui.add(CONSTANTS, "changeLODcolor").name("Highlight LOD").onChange( v => {
        CONSTANTS.changeLODcolor = v;
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
        
        const intersectionPoint = intersects[0].point;

        controls.target.copy( intersectionPoint );
        controls.update();
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
    };
}

controls.addEventListener( 'change', requestRender);

// window.addEventListener( 'wheel', requestRender );
window.addEventListener( 'resize', requestRender );

// let frameCount = 0;
renderer.render(scene, camera);

function animate() {
    
    requestAnimationFrame( animate );
    // renderer.render(scene, camera);

    perfMonitor.update(renderer, scene);

    // // Throttled Frame Refresh
    // if (bvh && frameCount % 100 === 0) {
    //     requestRender();
    // }
    
    // frameCount++;

}

animate()