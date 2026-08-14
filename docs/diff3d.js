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

let mesh = null;

async function loadFile(event) {

    // load STL file
    const file = event.target.files[0];
    if (!file)
        return;
    const buffer = await file.arrayBuffer();
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();

    // dispose of old one
    if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    }

    // rendering parameters
    const material = new THREE.MeshStandardMaterial({
        color: 0x01aaaaaa,
        roughness: 0.65,
        metalness: 0.05
    });

    // Add the mesh and fit the camera
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    fitCameraToObject(mesh);
}

function fitCameraToObject(object) {

    // Move model so its bounding-box center is at the origin
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.sub(center);

    // Recalculate world-space bounding box
    const worldBox = new THREE.Box3().setFromObject(object);
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

document.getElementById("file").addEventListener("change", loadFile);

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



