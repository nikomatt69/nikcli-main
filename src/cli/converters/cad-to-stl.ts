type Vec3 = { x: number; y: number; z: number }
type Triangle = { a: Vec3; b: Vec3; c: Vec3; normal?: Vec3 }

function v(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z }
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return v(a.x - b.x, a.y - b.y, a.z - b.z)
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}
function normalize(n: Vec3): Vec3 {
  const len = Math.hypot(n.x, n.y, n.z) || 1
  return v(n.x / len, n.y / len, n.z / len)
}
function tri(a: Vec3, b: Vec3, c: Vec3): Triangle {
  const n = normalize(cross(sub(b, a), sub(c, a)))
  return { a, b, c, normal: n }
}

function numberFrom(obj: any, keys: string[], def: number): number {
  for (const k of keys) {
    const val = obj?.[k]
    if (typeof val === 'number' && Number.isFinite(val)) return val
  }
  return def
}
function pointFrom(obj: any, prefix: string, def: Vec3): Vec3 {
  const x = numberFrom(obj, [`${prefix}x`, `${prefix}X`, 'x', 'X', `${prefix}.x`, `${prefix}.X`], def.x)
  const y = numberFrom(obj, [`${prefix}y`, `${prefix}Y`, 'y', 'Y', `${prefix}.y`, `${prefix}.Y`], def.y)
  const z = numberFrom(obj, [`${prefix}z`, `${prefix}Z`, 'z', 'Z', `${prefix}.z`, `${prefix}.Z`], def.z)
  return v(x, y, z)
}

function trianglesForCube(elem: any): Triangle[] {
  const center = pointFrom(elem, '', v(0, 0, 0))
  const width = numberFrom(elem, ['width'], numberFrom(elem?.geometry, ['width'], 10))
  const height = numberFrom(elem, ['height'], numberFrom(elem?.geometry, ['height'], 10))
  const depth = numberFrom(elem, ['depth'], numberFrom(elem?.geometry, ['depth'], 10))
  const hx = width / 2,
    hy = height / 2,
    hz = depth / 2
  const p = (dx: number, dy: number, dz: number) => v(center.x + dx, center.y + dy, center.z + dz)
  const v000 = p(-hx, -hy, -hz),
    v100 = p(hx, -hy, -hz),
    v110 = p(hx, hy, -hz),
    v010 = p(-hx, hy, -hz)
  const v001 = p(-hx, -hy, hz),
    v101 = p(hx, -hy, hz),
    v111 = p(hx, hy, hz),
    v011 = p(-hx, hy, hz)
  const tris: Triangle[] = []
  tris.push(tri(v000, v100, v110), tri(v000, v110, v010))
  tris.push(tri(v001, v011, v111), tri(v001, v111, v101))
  tris.push(tri(v010, v110, v111), tri(v010, v111, v011))
  tris.push(tri(v000, v001, v101), tri(v000, v101, v100))
  tris.push(tri(v100, v101, v111), tri(v100, v111, v110))
  tris.push(tri(v000, v010, v011), tri(v000, v011, v001))
  return tris
}

function trianglesForCylinder(elem: any): Triangle[] {
  const center = pointFrom(elem, '', v(0, 0, 0))
  const radius = numberFrom(elem, ['radius'], numberFrom(elem?.geometry, ['radius'], 5))
  const height = numberFrom(elem, ['height', 'depth'], numberFrom(elem?.geometry, ['height', 'depth'], 10))
  const segments = Math.max(
    12,
    Math.floor(numberFrom(elem, ['segments'], numberFrom(elem?.geometry, ['segments'], 32)))
  )
  const hz = height / 2
  const tris: Triangle[] = []
  const topCenter = v(center.x, center.y, center.z + hz)
  const bottomCenter = v(center.x, center.y, center.z - hz)
  const ptsTop: Vec3[] = []
  const ptsBot: Vec3[] = []
  for (let i = 0; i < segments; i++) {
    const ang = (i / segments) * Math.PI * 2
    const x = center.x + radius * Math.cos(ang)
    const y = center.y + radius * Math.sin(ang)
    ptsTop.push(v(x, y, center.z + hz))
    ptsBot.push(v(x, y, center.z - hz))
  }
  for (let i = 0; i < segments; i++) {
    const i2 = (i + 1) % segments
    tris.push(tri(topCenter, ptsTop[i2], ptsTop[i]))
    tris.push(tri(bottomCenter, ptsBot[i], ptsBot[i2]))
    tris.push(tri(ptsTop[i], ptsTop[i2], ptsBot[i2]))
    tris.push(tri(ptsTop[i], ptsBot[i2], ptsBot[i]))
  }
  return tris
}

function trianglesForDisk(elem: any, thickness = 2): Triangle[] {
  return trianglesForCylinder({ ...elem, height: thickness })
}
function trianglesForPlate(elem: any, thickness = 2): Triangle[] {
  return trianglesForCube({ ...elem, depth: thickness })
}

function collectTrianglesForElement(element: any): Triangle[] {
  const type = String(element?.type || '').toLowerCase()
  if (type.includes('cube') || type.includes('box') || type.includes('rect') || type.includes('square'))
    return trianglesForCube(element)
  if (type.includes('cyl')) return trianglesForCylinder(element)
  if (type.includes('circle') || type.includes('disk')) {
    const t = numberFrom(element, ['thickness', 'depth', 'height'], 2)
    return trianglesForDisk(element, t)
  }
  if (type.includes('plate') || type.includes('rectangle')) {
    const t = numberFrom(element, ['thickness', 'depth', 'height'], 2)
    return trianglesForPlate(element, t)
  }
  return trianglesForCube({ ...element, width: 10, height: 10, depth: 10 })
}

function toAsciiStl(triangles: Triangle[], name = 'nikcli_model'): string {
  const lines: string[] = []
  lines.push(`solid ${name}`)
  for (const t of triangles) {
    const n = t.normal || normalize(cross(sub(t.b, t.a), sub(t.c, t.a)))
    lines.push(`  facet normal ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}`)
    lines.push('    outer loop')
    lines.push(`      vertex ${t.a.x.toFixed(6)} ${t.a.y.toFixed(6)} ${t.a.z.toFixed(6)}`)
    lines.push(`      vertex ${t.b.x.toFixed(6)} ${t.b.y.toFixed(6)} ${t.b.z.toFixed(6)}`)
    lines.push(`      vertex ${t.c.x.toFixed(6)} ${t.c.y.toFixed(6)} ${t.c.z.toFixed(6)}`)
    lines.push('    endloop')
    lines.push('  endfacet')
  }
  lines.push(`endsolid ${name}`)
  return lines.join('\n')
}

export function convertCadElementsToSTL(elements: any[], modelName = 'nikcli_model'): string {
  const triangles: Triangle[] = []
  for (const el of elements || []) {
    try {
      triangles.push(...collectTrianglesForElement(el))
    } catch {}
  }
  if (triangles.length === 0) triangles.push(...trianglesForCube({ width: 1, height: 1, depth: 1 }))
  return toAsciiStl(triangles, modelName)
}
