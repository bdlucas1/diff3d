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
scene.background = new THREE.Color(0xf4f4f4)
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

// Two objects loaded for display and comparison.
const objects = [null, null];
const loadedURLs = [null, null];
const loadingSlots = [false, false];

// Alignment may be a little slow so it's handled in a
// dedicated separate worker thread using alignment-worker.js. 
// Progress updates are passed back via messages.
// Start position is remembered in case of cancelation.
const alignButton = document.getElementById("align");
const alignStatus = document.getElementById("align-status");
let alignmentWorker = null;
let alignmentStartPosition = null;
let pendingAlignmentDelta = null;
let alignmentFrameRequested = false;

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
    updateAlignButton();
}

function setSlotLoading(index, loading) {
    loadingSlots[index] = loading;
    updateAlignButton();
}

// Fetch a local file and load it into the scene at slot index
async function loadFile(event, index) {

    const file = event.target.files[0];
    if (!file)
        return;

    cancelAlignment();
    alignStatus.textContent = "";

    //const displayURL = new URL(file.name, "file:").href;
    const displayURL = file.name
    const urlInput = document.getElementById(index === 0 ? "url-a" : "url-b");
    urlInput.value = "Loading " + displayURL + "...";
    urlInput.setCustomValidity("");

    setSlotLoading(index, true);
    try {
        await loadBuffer(await file.arrayBuffer(), file.name, index);
        loadedURLs[index] = displayURL;
        urlInput.value = displayURL;
    } catch (error) {
        urlInput.setCustomValidity(`Unable to load file: ${error.message}`);
        urlInput.reportValidity();
    } finally {
        setSlotLoading(index, false);
    }
}


// Fetch a remote URL and load it into the scene at slot index
async function loadURL(input, index) {

    const url = input.value.trim();
    if (!url || url === loadedURLs[index])
        return;

    cancelAlignment();
    alignStatus.textContent = "";

    input.value = "Loading " + url + "..."
    setSlotLoading(index, true);
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
    } finally {
        setSlotLoading(index, false);
    }
}

// Create compact world-space triangle arrays dedicated to the alignment worker.
// These are copies, so transferring them does not detach the rendering geometry.
function flattenObject(object) {

    object.updateWorldMatrix(true, true);
    const meshData = [];
    let vertexCount = 0;
    let indexCount = 0;

    object.traverse(child => {
        if (!child.isMesh)
            return;
        const position = child.geometry.getAttribute("position");
        if (!position)
            return;
        const index = child.geometry.getIndex();
        const count = index ? index.count : position.count;
        if (count % 3 !== 0)
            throw new Error(`Mesh "${child.name}" does not contain triangles`);
        meshData.push({child, position, index});
        vertexCount += position.count;
        indexCount += count;
    });

    if (meshData.length === 0)
        throw new Error("Model contains no triangle meshes");

    const positions = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    const point = new THREE.Vector3();
    let vertexOffset = 0;
    let indexOffset = 0;

    for (const {child, position, index} of meshData) {
        for (let i = 0; i < position.count; ++i) {
            point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
            const offset = 3 * (vertexOffset + i);
            positions[offset] = point.x;
            positions[offset + 1] = point.y;
            positions[offset + 2] = point.z;
        }
        const count = index ? index.count : position.count;
        for (let i = 0; i < count; ++i)
            indices[indexOffset + i] = vertexOffset + (index ? index.getX(i) : i);
        vertexOffset += position.count;
        indexOffset += count;
    }

    return {positions, indices};
}

function updateAlignButton() {
    if (alignmentWorker) {
        alignButton.disabled = false;
        alignButton.textContent = "Cancel alignment";
    } else {
        alignButton.disabled = !objects[0] || !objects[1] || loadingSlots.some(Boolean);
        alignButton.textContent = "Align";
    }
}

function applyAlignmentDelta(delta) {
    console.log("applying delta", delta)
    objects[1].position.set(
        alignmentStartPosition.x + delta[0],
        alignmentStartPosition.y + delta[1],
        alignmentStartPosition.z + delta[2]
    );
}

function queueAlignmentDelta(delta) {
    pendingAlignmentDelta = delta;
    if (alignmentFrameRequested)
        return;
    alignmentFrameRequested = true;
    requestAnimationFrame(() => {
        alignmentFrameRequested = false;
        if (pendingAlignmentDelta && alignmentWorker)
            applyAlignmentDelta(pendingAlignmentDelta);
        pendingAlignmentDelta = null;
    });
}

function finishAlignment(worker, message) {
    if (worker !== alignmentWorker)
        return;
    worker.terminate();
    alignmentWorker = null;
    pendingAlignmentDelta = null;

    if (message.type === "complete") {
        applyAlignmentDelta(message.delta);
        const formattedDelta = message.delta.map(value => value.toPrecision(4)).join(", ");
        alignStatus.textContent =
            `Aligned by [${formattedDelta}] in ${(message.elapsedMs / 1000).toFixed(1)}s ` +
            `(${message.evaluations} evaluations)`;
    } else {
        objects[1].position.copy(alignmentStartPosition);
        alignStatus.textContent = `Alignment failed: ${message.message}`;
    }
    alignmentStartPosition = null;
    updateAlignButton();
}

function cancelAlignment() {
    if (!alignmentWorker)
        return;
    alignmentWorker.terminate();
    alignmentWorker = null;
    pendingAlignmentDelta = null;
    objects[1].position.copy(alignmentStartPosition);
    alignmentStartPosition = null;
    alignStatus.textContent = "Alignment cancelled";
    updateAlignButton();
}

function startAlignment() {

    if (!objects[0] || !objects[1] || alignmentWorker)
        return;

    let stationary;
    let moving;
    try {
        stationary = flattenObject(objects[0]);
        moving = flattenObject(objects[1]);
    } catch (error) {
        alignStatus.textContent = `Unable to align: ${error.message}`;
        return;
    }

    alignmentStartPosition = objects[1].position.clone();
    alignStatus.textContent = "Preparing alignment…";
    const worker = new Worker(new URL("./alignment-worker.js", import.meta.url), {type: "module"});
    alignmentWorker = worker;
    updateAlignButton();

    worker.addEventListener("message", event => {
        if (worker !== alignmentWorker)
            return;
        const message = event.data;
        if (message.type === "progress") {
            queueAlignmentDelta(message.delta);
            const dots = ".".repeat(1 + message.iteration % 3);
            alignStatus.textContent = `Aligning pass ${message.pass + 1}/${message.passCount}${dots}`;
        } else if (message.type === "status") {
            alignStatus.textContent = message.message;
        } else {
            finishAlignment(worker, message);
        }
    });

    worker.addEventListener("error", event => {
        finishAlignment(worker, {
            type: "error",
            message: event.message || "alignment worker failed"
        });
    });

    worker.postMessage({
        stationary,
        moving,
        options: {
            sampleCount: 2000,
            widthPcts: [Infinity, 8, 2, 0.5],
            toleranceRelative: 1e-5
        }
    }, [
        stationary.positions.buffer,
        stationary.indices.buffer,
        moving.positions.buffer,
        moving.indices.buffer
    ]);
}

alignButton.addEventListener("click", () => {
    if (alignmentWorker)
        cancelAlignment();
    else
        startAlignment();
});

updateAlignButton();

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
    //distance *= 1.5;
    camera.position.set(distance, distance, distance);
    camera.near = Math.max(maxSize / 1000, 0.001);
    camera.far = maxSize * 1000;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
}

// Add event listener to show/hide help
document.getElementById("toggle-help").addEventListener("click", (event) => toggleHelp(event))
function toggleHelp(event) {
    if (event)
        event.preventDefault()
    help.hidden = !help.hidden;
    document.getElementById("toggle-help").innerText = help.hidden? "Show help" : "Hide help"
}
toggleHelp()

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

// Keep the renderer matched to the viewer's remaining layout space. Observing
// the container also handles UI height changes such as showing or hiding help.
function resizeRenderer() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0)
        return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

new ResizeObserver(resizeRenderer).observe(container);

// Rendering loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
