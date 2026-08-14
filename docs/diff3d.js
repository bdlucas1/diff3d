import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {STLLoader} from "three/addons/loaders/STLLoader.js";

// Our root element
const container = document.getElementById("viewer");

// Set up camera
const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.01,
    100000
);

// Set up renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// Orbit controls
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
//controls.minPolarAngle = 0;
//controls.maxPolarAngle = Math.PI / 2;

// Lighting
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(1, 1, 1);
scene.add(light);

const materials = [
    new THREE.MeshStandardMaterial({
        color: 0x00a6d6,
        roughness: 0.65,
        metalness: 0.05,
        opacity: 0.25,
        transparent: true
    }),
    new THREE.MeshStandardMaterial({
        color: 0xf28e2b,
        roughness: 0.65,
        metalness: 0.05,
        opacity: 0.25,
        transparent: true
    })
];

const meshes = [null, null];

async function loadFile(event, index) {

    // load STL file
    const file = event.target.files[0];
    if (!file)
        return;
    const buffer = await file.arrayBuffer();
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();

    // dispose of old one
    if (meshes[index]) {
        scene.remove(meshes[index]);
        meshes[index].geometry.dispose();
    }

    // Add the mesh with the material assigned to this file chooser
    const mesh = new THREE.Mesh(geometry, materials[index]);
    meshes[index] = mesh;
    scene.add(mesh);
    centerObject(mesh);
    fitCameraToObjects();
}

function centerObject(object) {
    // Move model so its bounding-box center is at the origin
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.sub(center);
}

function fitCameraToObjects() {

    // Calculate a bounding box containing both loaded models
    const worldBox = new THREE.Box3();
    for (const mesh of meshes) {
        if (mesh)
            worldBox.expandByObject(mesh);
    }
    const size = new THREE.Vector3();
    worldBox.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z);

    // Position camera far enough away to see whole object
    const fov = THREE.MathUtils.degToRad(camera.fov);
    let distance = maxSize / (2 * Math.tan(fov / 2));
    distance *= 1.5;
    camera.position.set(distance, distance, distance);
    camera.near = Math.max(maxSize / 1000, 0.001);
    camera.far = maxSize * 1000;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
}

document.getElementById("file1").addEventListener("change", event => loadFile(event, 0));
document.getElementById("file2").addEventListener("change", event => loadFile(event, 1));

window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(
        container.clientWidth,
        container.clientHeight
    );
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

