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
//controls.enableDamping = true;
//controls.minPolarAngle = 0;
//controls.maxPolarAngle = Math.PI / 2;

// Lighting
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff)
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(1, 1, 1);
scene.add(light);

const opacity = 0.5

// TODO: set button colors programmatically based on these colors
const materials = [
    new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        roughness: 0.65,
        metalness: 0.05,
        opacity: opacity,
        transparent: true,
        depthWrite: false,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true,
    }),
    new THREE.MeshStandardMaterial({
        color: 0xff00ff,
        roughness: 0.65,
        metalness: 0.05,
        opacity: opacity,
        transparent: true,
        depthWrite: false,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true,
    }),
];

const meshes = [null, null];
const loadedURLs = [null, null];

function loadBuffer(buffer, index) {
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
    //centerObject(mesh);
    fitCameraToObjects();
}

async function loadFile(event, index) {

    const file = event.target.files[0];
    if (!file)
        return;

    //const displayURL = new URL(file.name, "file:").href;
    const displayURL = file.name
    const urlInput = document.getElementById(index === 0 ? "url-a" : "url-b");
    urlInput.value = displayURL;
    urlInput.setCustomValidity("");

    loadBuffer(await file.arrayBuffer(), index);
    loadedURLs[index] = displayURL;
}

async function loadURL(input, index) {

    const url = input.value.trim();
    if (!url || url === loadedURLs[index])
        return;

    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        loadBuffer(await response.arrayBuffer(), index);
        loadedURLs[index] = url;
        input.setCustomValidity("");
    } catch (error) {
        input.setCustomValidity(`Unable to load STL: ${error.message}`);
        input.reportValidity();
    }
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

for (const [index, suffix] of ["a", "b"].entries()) {
    const fileInput = document.getElementById(`file-${suffix}`);
    const urlInput = document.getElementById(`url-${suffix}`);
    document.getElementById(`choose-file-${suffix}`).addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", event => loadFile(event, index));
    urlInput.addEventListener("change", () => loadURL(urlInput, index));
    urlInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadURL(urlInput, index);
        }
    });
}

// Replace these with the sample STL URLs when they are available.
const sampleURLs = [
    "https://bdlucas1.github.io/diff3d/lens-clamp-A.stl",
    "https://bdlucas1.github.io/diff3d/lens-clamp-B.stl",
];

document.getElementById("load-samples").addEventListener("click", event => {

    event.preventDefault();

    for (const [index, suffix] of ["a", "b"].entries()) {
        const input = document.getElementById(`url-${suffix}`);
        input.value = sampleURLs[index];
        input.setCustomValidity("");
        loadURL(input, index);
    }
});

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
