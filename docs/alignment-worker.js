// The code in this file was written by ChatGPT/Codex as a JavaScript
// implementation of the python algorithm align3d in ../diff3d.py.

import {
    BufferAttribute,
    BufferGeometry,
    Float32BufferAttribute,
    Vector3
} from "https://cdn.jsdelivr.net/npm/three@0.185.1/+esm";

import {
    MeshBVH
} from "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.14/+esm";

const MAX_GRID_POINTS = 2000000;
const MAX_ITERATIONS_PER_PASS = 60;
const MAX_LINE_SEARCH_STEPS = 20;
const HISTORY_SIZE = 5;

function makeGeometry(data) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    return geometry;
}

function boundsOf(positions) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
        for (let axis = 0; axis < 3; ++axis) {
            min[axis] = Math.min(min[axis], positions[i + axis]);
            max[axis] = Math.max(max[axis], positions[i + axis]);
        }
    }
    return {min, max};
}

function centroidOf(positions) {
    const centroid = [0, 0, 0];
    const count = positions.length / 3;
    for (let i = 0; i < positions.length; i += 3) {
        centroid[0] += positions[i];
        centroid[1] += positions[i + 1];
        centroid[2] += positions[i + 2];
    }
    centroid[0] /= count;
    centroid[1] /= count;
    centroid[2] /= count;
    return centroid;
}

function triangleArea(positions, ia, ib, ic) {
    const ax = positions[3 * ia];
    const ay = positions[3 * ia + 1];
    const az = positions[3 * ia + 2];
    const abx = positions[3 * ib] - ax;
    const aby = positions[3 * ib + 1] - ay;
    const abz = positions[3 * ib + 2] - az;
    const acx = positions[3 * ic] - ax;
    const acy = positions[3 * ic + 1] - ay;
    const acz = positions[3 * ic + 2] - az;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    return 0.5 * Math.hypot(cx, cy, cz);
}

function surfaceArea(data) {
    let area = 0;
    for (let i = 0; i < data.indices.length; i += 3) {
        area += triangleArea(
            data.positions,
            data.indices[i],
            data.indices[i + 1],
            data.indices[i + 2]
        );
    }
    return area;
}

function sampleSurface(data, bvh, targetCount) {
    const area = surfaceArea(data);
    const cellSize = Math.sqrt(area / targetCount);
    if (!Number.isFinite(cellSize) || cellSize <= 0)
        throw new Error("Moving model has zero surface area");

    const {min, max} = boundsOf(data.positions);
    const counts = min.map((value, axis) =>
        Math.ceil((max[axis] + cellSize - value) / cellSize)
    );
    const gridCount = counts[0] * counts[1] * counts[2];
    if (gridCount > MAX_GRID_POINTS) {
        throw new Error(
            `Sampling grid would contain ${gridCount.toLocaleString()} points; ` +
            "reduce model aspect ratio or sample count"
        );
    }

    self.postMessage({
        type: "status",
        message: `Sampling moving surface (${gridCount.toLocaleString()} grid points)…`
    });

    const query = new Vector3();
    const hit = {};
    const samples = [];
    const threshold = cellSize / 2;
    for (let ix = 0; ix < counts[0]; ++ix) {
        const x = min[0] + ix * cellSize;
        for (let iy = 0; iy < counts[1]; ++iy) {
            const y = min[1] + iy * cellSize;
            for (let iz = 0; iz < counts[2]; ++iz) {
                const z = min[2] + iz * cellSize;
                query.set(x, y, z);
                bvh.closestPointToPoint(query, hit);
                const point = hit.point;
                if (
                    Math.abs(point.x - x) <= threshold &&
                    Math.abs(point.y - y) <= threshold &&
                    Math.abs(point.z - z) <= threshold
                ) {
                    samples.push(point.x, point.y, point.z);
                }
            }
        }
    }

    if (samples.length === 0)
        throw new Error("Unable to sample the moving surface");
    return new Float64Array(samples);
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function addScaled(a, b, scale) {
    return [a[0] + scale * b[0], a[1] + scale * b[1], a[2] + scale * b[2]];
}

function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(a) {
    return Math.hypot(a[0], a[1], a[2]);
}

function makeObjective(samples, stationaryBVH, modelSize) {

    const query = new Vector3();
    const hit = {};

    return (delta, widthPct) => {
        const robust = Number.isFinite(widthPct);
        const squaredWidth = robust ? (modelSize * widthPct / 100) ** 2 : Infinity;
        const gradient = [0, 0, 0];
        let value = 0;
        const count = samples.length / 3;

        for (let i = 0; i < samples.length; i += 3) {
            query.set(
                samples[i] + delta[0],
                samples[i + 1] + delta[1],
                samples[i + 2] + delta[2]
            );
            stationaryBVH.closestPointToPoint(query, hit);
            const rx = query.x - hit.point.x;
            const ry = query.y - hit.point.y;
            const rz = query.z - hit.point.z;
            const squaredDistance = rx * rx + ry * ry + rz * rz;

            if (robust) {
                const weight = Math.exp(-squaredDistance / squaredWidth);
                value -= weight;
                const scale = 2 * weight / squaredWidth;
                gradient[0] += scale * rx;
                gradient[1] += scale * ry;
                gradient[2] += scale * rz;
            } else {
                value += squaredDistance;
                gradient[0] += 2 * rx;
                gradient[1] += 2 * ry;
                gradient[2] += 2 * rz;
            }
        }

        return {
            value: value / count,
            gradient: gradient.map(component => component / count)
        };
    };
}

function lbfgs(objective, initial, tolerance, onIteration) {

    let x = initial.slice();
    let current = objective(x);
    const sHistory = [];
    const yHistory = [];
    let evaluations = 1;

    for (let iteration = 0; iteration < MAX_ITERATIONS_PER_PASS; ++iteration) {
        let direction = current.gradient.slice();
        const alphas = new Array(sHistory.length);

        for (let i = sHistory.length - 1; i >= 0; --i) {
            const rho = 1 / dot(yHistory[i], sHistory[i]);
            alphas[i] = rho * dot(sHistory[i], direction);
            direction = addScaled(direction, yHistory[i], -alphas[i]);
        }

        if (sHistory.length > 0) {
            const last = sHistory.length - 1;
            const scale = dot(sHistory[last], yHistory[last]) / dot(yHistory[last], yHistory[last]);
            direction = direction.map(component => component * scale);
        }

        for (let i = 0; i < sHistory.length; ++i) {
            const rho = 1 / dot(yHistory[i], sHistory[i]);
            const beta = rho * dot(yHistory[i], direction);
            direction = addScaled(direction, sHistory[i], alphas[i] - beta);
        }
        direction = direction.map(component => -component);

        let directionalDerivative = dot(current.gradient, direction);
        if (!Number.isFinite(directionalDerivative) || directionalDerivative >= 0) {
            direction = current.gradient.map(component => -component);
            directionalDerivative = -dot(current.gradient, current.gradient);
            sHistory.length = 0;
            yHistory.length = 0;
        }

        if (length(direction) <= Number.EPSILON)
            break;

        let step = 1;
        let next = null;
        let nextX = null;
        for (let lineStep = 0; lineStep < MAX_LINE_SEARCH_STEPS; ++lineStep) {
            nextX = addScaled(x, direction, step);
            next = objective(nextX);
            ++evaluations;
            if (next.value <= current.value + 1e-4 * step * directionalDerivative)
                break;
            step *= 0.5;
            next = null;
        }
        if (!next)
            break;

        const s = subtract(nextX, x);
        const y = subtract(next.gradient, current.gradient);
        if (dot(s, y) > 1e-12) {
            sHistory.push(s);
            yHistory.push(y);
            if (sHistory.length > HISTORY_SIZE) {
                sHistory.shift();
                yHistory.shift();
            }
        }

        x = nextX;
        current = next;
        onIteration(x, iteration, evaluations);
        if (length(s) <= tolerance)
            break;
    }

    return {argument: x, evaluations};
}

self.addEventListener("message", event => {

    const started = performance.now();
    try {
        const {stationary, moving, options} = event.data;
        self.postMessage({type: "status", message: "Building alignment indexes…"});
        const stationaryGeometry = makeGeometry(stationary);
        const movingGeometry = makeGeometry(moving);
        const stationaryBVH = new MeshBVH(stationaryGeometry);
        const movingBVH = new MeshBVH(movingGeometry);
        const samples = sampleSurface(moving, movingBVH, options.sampleCount);

        const stationaryBounds = boundsOf(stationary.positions);
        const modelSize = Math.hypot(
            stationaryBounds.max[0] - stationaryBounds.min[0],
            stationaryBounds.max[1] - stationaryBounds.min[1],
            stationaryBounds.max[2] - stationaryBounds.min[2]
        );
        const stationaryCentroid = centroidOf(stationary.positions);
        const movingCentroid = centroidOf(moving.positions);
        let delta = subtract(stationaryCentroid, movingCentroid);
        const evaluate = makeObjective(samples, stationaryBVH, modelSize);
        let evaluations = 0;

        for (let pass = 0; pass < options.widthPcts.length; ++pass) {
            const widthPct = options.widthPcts[pass];
            const result = lbfgs(
                x => evaluate(x, widthPct),
                delta,
                options.toleranceRelative * modelSize,
                (currentDelta, iteration, passEvaluations) => {
                    self.postMessage({
                        type: "progress",
                        delta: currentDelta,
                        pass,
                        passCount: options.widthPcts.length,
                        iteration,
                        evaluations: evaluations + passEvaluations
                    });
                }
            );
            delta = result.argument;
            evaluations += result.evaluations;
        }

        self.postMessage({
            type: "complete",
            delta,
            evaluations,
            elapsedMs: performance.now() - started
        });
    } catch (error) {
        self.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error)
        });
    }
});
