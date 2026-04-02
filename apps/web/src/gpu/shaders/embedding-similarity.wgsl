// ── Cosine Similarity Compute Shader ────────────────────────────────
// Massively parallel vector similarity computation.
// Takes two arrays of vectors and outputs a similarity matrix.
//
// Use case: Client-side vector search on GPU. Compare a query embedding
// against thousands of stored embeddings in a single dispatch.
//
// Memory layout:
//   vectorsA: [numA * dim] f32 values (query vectors, row-major)
//   vectorsB: [numB * dim] f32 values (candidate vectors, row-major)
//   output:   [numA * numB] f32 similarity scores

struct Params {
  numA: u32,       // number of query vectors
  numB: u32,       // number of candidate vectors
  dim: u32,        // dimensionality of each vector
  _padding: u32,   // align to 16 bytes
}

@group(0) @binding(0) var<storage, read> params: Params;
@group(0) @binding(1) var<storage, read> vectorsA: array<f32>;
@group(0) @binding(2) var<storage, read> vectorsB: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
) {
  let idx = global_id.x;
  let totalPairs = params.numA * params.numB;

  if (idx >= totalPairs) {
    return;
  }

  // Map flat index to (i, j) pair
  let i = idx / params.numB;  // index into vectorsA
  let j = idx % params.numB;  // index into vectorsB

  let dim = params.dim;
  let offsetA = i * dim;
  let offsetB = j * dim;

  // Compute dot product, magnitude A, magnitude B in single pass
  var dotProduct: f32 = 0.0;
  var magA: f32 = 0.0;
  var magB: f32 = 0.0;

  // Process 4 elements at a time for better throughput
  let dim4 = dim / 4u;
  let remainder = dim % 4u;

  for (var k: u32 = 0u; k < dim4; k = k + 1u) {
    let base = k * 4u;

    let a0 = vectorsA[offsetA + base];
    let a1 = vectorsA[offsetA + base + 1u];
    let a2 = vectorsA[offsetA + base + 2u];
    let a3 = vectorsA[offsetA + base + 3u];

    let b0 = vectorsB[offsetB + base];
    let b1 = vectorsB[offsetB + base + 1u];
    let b2 = vectorsB[offsetB + base + 2u];
    let b3 = vectorsB[offsetB + base + 3u];

    dotProduct = dotProduct + a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
    magA = magA + a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
    magB = magB + b0 * b0 + b1 * b1 + b2 * b2 + b3 * b3;
  }

  // Handle remaining elements
  let remStart = dim4 * 4u;
  for (var k: u32 = 0u; k < remainder; k = k + 1u) {
    let a = vectorsA[offsetA + remStart + k];
    let b = vectorsB[offsetB + remStart + k];
    dotProduct = dotProduct + a * b;
    magA = magA + a * a;
    magB = magB + b * b;
  }

  // Cosine similarity = dot(A, B) / (|A| * |B|)
  let denominator = sqrt(magA) * sqrt(magB);

  // Guard against zero-magnitude vectors
  if (denominator < 1e-8) {
    output[idx] = 0.0;
  } else {
    output[idx] = dotProduct / denominator;
  }
}
