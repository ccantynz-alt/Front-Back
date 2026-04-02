// ── Matrix Multiplication Compute Shader ────────────────────────────
// Foundation for ML operations. Multiplies two matrices A (MxK) and B (KxN)
// producing result C (MxN).
//
// Layout: Row-major storage. Each workgroup computes a TILE_SIZE x TILE_SIZE
// block of the output using shared memory tiling for cache efficiency.

struct Dimensions {
  M: u32,  // rows of A, rows of C
  N: u32,  // cols of B, cols of C
  K: u32,  // cols of A, rows of B
}

@group(0) @binding(0) var<storage, read> dimensions: Dimensions;
@group(0) @binding(1) var<storage, read> matA: array<f32>;
@group(0) @binding(2) var<storage, read> matB: array<f32>;
@group(0) @binding(3) var<storage, read_write> matC: array<f32>;

const TILE_SIZE: u32 = 16u;

var<workgroup> tileA: array<array<f32, 16>, 16>;
var<workgroup> tileB: array<array<f32, 16>, 16>;

@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>,
) {
  let row = global_id.y;
  let col = global_id.x;
  let localRow = local_id.y;
  let localCol = local_id.x;

  let M = dimensions.M;
  let N = dimensions.N;
  let K = dimensions.K;

  var sum: f32 = 0.0;
  let numTiles = (K + TILE_SIZE - 1u) / TILE_SIZE;

  for (var t: u32 = 0u; t < numTiles; t = t + 1u) {
    // Load tile from A into shared memory
    let aCol = t * TILE_SIZE + localCol;
    if (row < M && aCol < K) {
      tileA[localRow][localCol] = matA[row * K + aCol];
    } else {
      tileA[localRow][localCol] = 0.0;
    }

    // Load tile from B into shared memory
    let bRow = t * TILE_SIZE + localRow;
    if (bRow < K && col < N) {
      tileB[localRow][localCol] = matB[bRow * N + col];
    } else {
      tileB[localRow][localCol] = 0.0;
    }

    workgroupBarrier();

    // Compute partial dot product for this tile
    for (var k: u32 = 0u; k < TILE_SIZE; k = k + 1u) {
      sum = sum + tileA[localRow][k] * tileB[k][localCol];
    }

    workgroupBarrier();
  }

  // Write result
  if (row < M && col < N) {
    matC[row * N + col] = sum;
  }
}
