// Load before tf.min.js. TensorFlow.js sets a global `regeneratorRuntime`, and in strict
// mode that only works if the global already exists; otherwise it falls back to
// Function("..."), which extension pages block (no eval), and the library breaks.
self.regeneratorRuntime = undefined;
