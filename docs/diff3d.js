import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {ThreeMFLoader} from "three/addons/loaders/3MFLoader.js";
import {OBJLoader} from "three/addons/loaders/OBJLoader.js";
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

const objects = [null, null];
const loadedURLs = [null, null];

function getFileExtension(source) {
    const pathname = new URL(source, window.location.href).pathname;
    return pathname.slice(pathname.lastIndexOf(".")).toLowerCase();
}

// Traverse an object, computing normals if needed, and override any
// pre-existing material (color, etc.) with ours
function applyMaterial(object, material) {
    object.traverse(child => {
        if (!child.isMesh)
            return;
        if (!child.geometry.getAttribute("normal"))
            child.geometry.computeVertexNormals();
        const originalMaterials = Array.isArray(child.material) ? child.material : [child.material];
        for (const originalMaterial of originalMaterials)
            originalMaterial.dispose();
        child.material = material;
    });
}

// Given a buffer containing an STL, OBJ, or 3MF file, parse it,
// using source extension to determine type, and return a threejs object
function parseObject(buffer, source, index) {

    const extension = getFileExtension(source);

    // STL files are just a mesh, not a hierarchical threejs object
    // and they don't specify colors etc.
    if (extension === ".stl") {
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, materials[index]);
    }

    // OBJ files may be a hierarchical threejs object,
    // and they may have colors etc. that we need to replace
    if (extension === ".obj") {
        const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
        applyMaterial(object, materials[index]);
        return object;
    }

    // 3MF files may be a hierarchical threejs object,
    // and they may have colors etc. that we need to replace
    if (extension === ".3mf") {
        const object = new ThreeMFLoader().parse(buffer);
        applyMaterial(object, materials[index]);
        return object;
    }

    throw new Error(`Unsupported file type "${extension || "unknown"}"`);
}

function disposeObject(object) {
    object.traverse(child => {
        if (child.geometry)
            child.geometry.dispose();
    });
}

// Given a buffer, parse it using source to determine type, add it to
// the scene in slot index, and adjust the camera
function loadBuffer(buffer, source, index) {

    const object = parseObject(buffer, source, index);

    // dispose of old one
    if (objects[index]) {
        scene.remove(objects[index]);
        disposeObject(objects[index]);
    }

    // Add the object with the material assigned to this file chooser
    objects[index] = object;
    scene.add(object);
    //centerObject(object);
    fitCameraToObjects();
}

// Fetch a local file and load it into the scene at slot index
async function loadFile(event, index) {

    const file = event.target.files[0];
    if (!file)
        return;

    //const displayURL = new URL(file.name, "file:").href;
    const displayURL = file.name
    const urlInput = document.getElementById(index === 0 ? "url-a" : "url-b");
    urlInput.value = displayURL;
    urlInput.setCustomValidity("");

    try {
        loadBuffer(await file.arrayBuffer(), file.name, index);
        loadedURLs[index] = displayURL;
    } catch (error) {
        urlInput.setCustomValidity(`Unable to load file: ${error.message}`);
        urlInput.reportValidity();
    }
}

// Fetch a remote URL and load it into the scene at slot index
async function loadURL(input, index) {

    const url = input.value.trim();
    if (!url || url === loadedURLs[index])
        return;

    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        loadBuffer(await response.arrayBuffer(), url, index);
        loadedURLs[index] = url;
        input.setCustomValidity("");
    } catch (error) {
        input.setCustomValidity(`Unable to load file: ${error.message}`);
        input.reportValidity();
    }
}

function centerObject(object) {
    // Move model so its bounding-box center is at the origin
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.sub(center);
}

function fitCameraToObjects() {

    // Calculate a bounding box containing both loaded models
    const worldBox = new THREE.Box3();
    for (const object of objects) {
        if (object)
            worldBox.expandByObject(object);
    }
    const size = new THREE.Vector3();
    worldBox.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z);
    console.log("maxSize", maxSize)

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

// Add event listeners to input fields and file choosers
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

// Set up the load-samples link
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

// Change rendered size when window resizes
window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(
        container.clientWidth,
        container.clientHeight
    );
});

// Rendering loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
