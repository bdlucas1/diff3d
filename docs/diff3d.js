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

// Loading the STEP support library and tesselating the STEP file is
// potentially a bit slow, so we load it in the background. In practice so far
// it doesn't seem to be that slow, so not sure this complexity is justified.
const stepRequests = new Map();
const stepWorker = new Worker(new URL("./step-worker.js", import.meta.url));
let nextStepRequestId = 0;

stepWorker.addEventListener("message", event => {
    const request = stepRequests.get(event.data.id);
    if (!request)
        return;
    stepRequests.delete(event.data.id);
    if (event.data.error)
        request.reject(new Error(event.data.error));
    else
        request.resolve(event.data.result);
});

stepWorker.addEventListener("error", event => {
    const error = new Error(event.message || "STEP worker failed");
    for (const request of stepRequests.values())
        request.reject(error);
    stepRequests.clear();
});

function getFileExtension(source) {
    const pathname = new URL(source, window.location.href).pathname;
    return pathname.slice(pathname.lastIndexOf(".")).toLowerCase();
}

function parseSTEP(buffer) {
    return new Promise((resolve, reject) => {
        const id = nextStepRequestId++;
        stepRequests.set(id, {resolve, reject});
        stepWorker.postMessage({id, buffer}, [buffer]);
    });
}

function buildSTEPObject(result, material) {
    if (!result.success)
        throw new Error("OpenCascade could not import this STEP file");

    const object = new THREE.Group();
    object.name = result.root?.name || "STEP model";

    for (const sourceMesh of result.meshes) {
        const geometry = new THREE.BufferGeometry();
        geometry.name = sourceMesh.name || "";
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(sourceMesh.attributes.position.array, 3)
        );
        if (sourceMesh.attributes.normal) {
            geometry.setAttribute(
                "normal",
                new THREE.Float32BufferAttribute(sourceMesh.attributes.normal.array, 3)
            );
        } else {
            geometry.computeVertexNormals();
        }
        geometry.setIndex(
            new THREE.BufferAttribute(Uint32Array.from(sourceMesh.index.array), 1)
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = sourceMesh.name || "";
        object.add(mesh);
    }

    if (object.children.length === 0)
        throw new Error("STEP file contains no displayable meshes");
    return object;
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

// Given a buffer containing an STL, OBJ, 3MF, or STEP file, parse it,
// using source extension to determine type, and return a threejs object
async function parseObject(buffer, source, index) {

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

    // STEP contains CAD surfaces rather than triangles. OpenCascade runs in a
    // worker to tessellate them without blocking interaction with the viewer.
    if (extension === ".step" || extension === ".stp") {
        const result = await parseSTEP(buffer);
        return buildSTEPObject(result, materials[index]);
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
async function loadBuffer(buffer, source, index) {

    const object = await parseObject(buffer, source, index);

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
    urlInput.value = "Loading " + displayURL + "...";
    urlInput.setCustomValidity("");

    try {
        await loadBuffer(await file.arrayBuffer(), file.name, index);
        loadedURLs[index] = displayURL;
        urlInput.value = displayURL;
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

    input.value = "Loading " + url + "..."
    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        await loadBuffer(await response.arrayBuffer(), url, index);
        loadedURLs[index] = url;
        input.setCustomValidity("");
        input.value = url
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
