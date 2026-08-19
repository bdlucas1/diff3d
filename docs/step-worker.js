const OCCT_BASE_URL = "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/";

// Identical parameters are used for both comparison files so that differences
// in tessellation settings do not masquerade as differences in the CAD models.
const STEP_IMPORT_PARAMETERS = {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.001,
    angularDeflection: 0.5
};

let openCascadePromise = null;

function getOpenCascade() {
    if (!openCascadePromise) {
        importScripts(`${OCCT_BASE_URL}occt-import-js.js`);
        openCascadePromise = occtimportjs({
            locateFile: path => `${OCCT_BASE_URL}${path}`
        });
    }
    return openCascadePromise;
}

self.addEventListener("message", async event => {
    const {id, buffer} = event.data;
    try {
        const openCascade = await getOpenCascade();
        const result = openCascade.ReadStepFile(
            new Uint8Array(buffer),
            STEP_IMPORT_PARAMETERS
        );
        self.postMessage({id, result});
    } catch (error) {
        self.postMessage({
            id,
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
