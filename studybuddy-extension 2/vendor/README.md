# Vendored libraries

Chrome extension pages can only run scripts that ship inside the extension, so the
AI libraries the app uses are copied here instead of loaded from a CDN. The model
weights they download (COCO-SSD, the MediaPipe face model) are data, not scripts,
so those still come from Google's servers at runtime.

| File | Package | License |
|---|---|---|
| `tf.min.js` | `@tensorflow/tfjs@4.22.0` (`dist/tf.min.js`) | Apache-2.0 |
| `coco-ssd.min.js` | `@tensorflow-models/coco-ssd@2.2.3` (`dist/coco-ssd.min.js`) | Apache-2.0 |
| `mediapipe/vision_bundle.mjs`, `mediapipe/wasm/vision_wasm_internal.*` | `@mediapipe/tasks-vision@0.10.14` | Apache-2.0 |

Downloaded from `https://cdn.jsdelivr.net/npm/<package>/<path>`. To update, download
the same paths for the new version. Only the SIMD build of the MediaPipe WebAssembly is
included; every Chrome version that runs this extension supports SIMD.
