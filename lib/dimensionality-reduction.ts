// Simple PCA implementation for dimensionality reduction
export function pcaReduce(vectors: number[][], targetDimensions = 2): number[][] {
  if (vectors.length === 0) return []

  const dimensions = vectors[0].length

  // Center the data
  const means = new Array(dimensions).fill(0)
  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i++) {
      means[i] += vector[i]
    }
  }
  for (let i = 0; i < dimensions; i++) {
    means[i] /= vectors.length
  }

  const centered = vectors.map((vector) => vector.map((val, i) => val - means[i]))

  // For simplicity, we'll use a random projection as a fast approximation
  // In production, you'd want to use a proper PCA library
  const projectionMatrix: number[][] = []
  for (let i = 0; i < targetDimensions; i++) {
    const row: number[] = []
    for (let j = 0; j < dimensions; j++) {
      row.push(Math.random() * 2 - 1)
    }
    // Normalize
    const norm = Math.sqrt(row.reduce((sum, val) => sum + val * val, 0))
    projectionMatrix.push(row.map((val) => val / norm))
  }

  // Project the data
  const reduced = centered.map((vector) => {
    return projectionMatrix.map((projRow) => {
      return vector.reduce((sum, val, i) => sum + val * projRow[i], 0)
    })
  })

  return reduced
}

// Normalize coordinates to fit in a specific range
export function normalizeCoordinates(points: number[][], minX = 0, maxX = 100, minY = 0, maxY = 100): number[][] {
  if (points.length === 0) return []

  const xValues = points.map((p) => p[0])
  const yValues = points.map((p) => p[1])

  const minXVal = Math.min(...xValues)
  const maxXVal = Math.max(...xValues)
  const minYVal = Math.min(...yValues)
  const maxYVal = Math.max(...yValues)

  const xRange = maxXVal - minXVal || 1
  const yRange = maxYVal - minYVal || 1

  return points.map(([x, y]) => [
    minX + ((x - minXVal) / xRange) * (maxX - minX),
    minY + ((y - minYVal) / yRange) * (maxY - minY),
  ])
}
