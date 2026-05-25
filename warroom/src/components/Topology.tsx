import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@/store/store'

interface NodeDef {
  id: string
  label: string
  position: [number, number, number]
  color: string
  group: 'agent' | 'provider' | 'tool' | 'engine'
}

const NODES: NodeDef[] = [
  { id: 'agent',       label: 'agent',           position: [0, 0, 0],         color: '#a259ff', group: 'agent' },
  { id: 'tf-gateway',  label: 'TF Gateway',      position: [0, 1.7, 0],       color: '#a259ff', group: 'agent' },
  { id: 'tf-primary',  label: 'TF·Groq',         position: [1.0, 2.5, 0],     color: '#a259ff', group: 'provider' },
  { id: 'tf-verify',   label: 'TF·Gemini',       position: [1.1, 1.3, 0],     color: '#a259ff', group: 'provider' },
  { id: 'tf-tertiary', label: 'TF·OpenRtr',      position: [1.1, 0.0, 0],     color: '#a259ff', group: 'provider' },
  { id: 'ollama',      label: 'ollama',          position: [1.0, -1.3, 0],    color: '#60a5fa', group: 'provider' },
  { id: 'mock',        label: 'mock',            position: [0.6, -2.4, 0],    color: '#6b7280', group: 'provider' },
  { id: 'kubectl',     label: 'kubectl',         position: [-1.0, 2.5, 0],    color: '#60a5fa', group: 'tool' },
  { id: 'prometheus',  label: 'prometheus',      position: [-1.1, 1.0, 0],    color: '#60a5fa', group: 'tool' },
  { id: 'loki',        label: 'loki',            position: [-1.0, -0.6, 0],   color: '#60a5fa', group: 'tool' },
  { id: 'engine',      label: 'scenario engine', position: [-0.8, -2.4, -0.8],color: '#fbbf24', group: 'engine' },
]

interface EdgeDef {
  from: string
  to: string
  // base traffic intensity 0..1; killed nodes drop to 0
  baseFlow: number
}

const EDGES: EdgeDef[] = [
  { from: 'agent', to: 'tf-gateway',       baseFlow: 1.0 },
  { from: 'tf-gateway', to: 'tf-primary',  baseFlow: 0.7 },
  { from: 'tf-gateway', to: 'tf-verify',   baseFlow: 0.5 },
  { from: 'tf-gateway', to: 'tf-tertiary', baseFlow: 0.15 },
  { from: 'agent', to: 'ollama',           baseFlow: 0.05 },
  { from: 'agent', to: 'mock',             baseFlow: 0.02 },
  { from: 'agent', to: 'kubectl',          baseFlow: 0.9 },
  { from: 'agent', to: 'prometheus',       baseFlow: 0.2 },
  { from: 'agent', to: 'loki',             baseFlow: 0.1 },
  { from: 'kubectl', to: 'engine',         baseFlow: 0.9 },
  { from: 'prometheus', to: 'engine',      baseFlow: 0.3 },
  { from: 'loki', to: 'engine',            baseFlow: 0.1 },
]

function nodeById(id: string): NodeDef {
  return NODES.find((n) => n.id === id)!
}

function NodeSphere({ node, killed }: { node: NodeDef; killed: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (!ref.current) return
    const target = killed ? 0.85 : 1.0
    ref.current.scale.x += (target - ref.current.scale.x) * Math.min(1, dt * 4)
    ref.current.scale.y = ref.current.scale.x
    ref.current.scale.z = ref.current.scale.x
  })
  const isAgent = node.id === 'agent'
  const isGateway = node.id === 'tf-gateway'
  const size = isAgent ? 0.42 : isGateway ? 0.36 : 0.22
  return (
    <group position={node.position}>
      <mesh ref={ref}>
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial
          color={killed ? '#f87171' : node.color}
          emissive={killed ? '#f87171' : node.color}
          emissiveIntensity={killed ? 0.6 : 0.45}
          roughness={0.4}
          metalness={0.15}
        />
      </mesh>
      <Text
        position={[0, -size - 0.22, 0]}
        fontSize={isGateway ? 0.16 : 0.14}
        color={killed ? '#f87171' : isGateway ? '#f2f5fa' : '#9aa3b2'}
        anchorX="center"
        anchorY="top"
        outlineWidth={isGateway ? 0.005 : 0}
        outlineColor="#0a0b0f"
      >
        {node.label}
      </Text>
    </group>
  )
}

interface EdgeProps {
  edge: EdgeDef
  flow: number
  killed: boolean
}

function Edge({ edge, flow, killed }: EdgeProps) {
  const a = nodeById(edge.from).position
  const b = nodeById(edge.to).position
  const tubeRef = useRef<THREE.Mesh>(null)

  const curve = useMemo(() => {
    const start = new THREE.Vector3(...a)
    const end = new THREE.Vector3(...b)
    const mid = start.clone().lerp(end, 0.5)
    mid.z += 0.6
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [a[0], a[1], a[2], b[0], b[1], b[2]])

  const tubeGeom = useMemo(
    () => new THREE.TubeGeometry(curve, 24, 0.015, 8, false),
    [curve]
  )

  // particle ring along the curve. positions advance per frame; ts kept in ref.
  const particleRef = useRef<THREE.Points>(null)
  const particleCount = 14
  const particlesT = useMemo<number[]>(
    () => Array.from({ length: particleCount }, (_, i) => i / particleCount),
    []
  )

  const particleGeom = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geom
  }, [])

  useFrame((_, dt) => {
    const speed = killed ? 0 : 0.45 + flow * 0.6
    const positions = particleGeom.attributes.position.array as Float32Array
    for (let i = 0; i < particleCount; i++) {
      particlesT[i] = (particlesT[i] + dt * speed) % 1
      const p = curve.getPoint(particlesT[i])
      positions[i * 3 + 0] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
    }
    particleGeom.attributes.position.needsUpdate = true
    if (tubeRef.current) {
      const mat = tubeRef.current.material as THREE.MeshStandardMaterial
      mat.opacity += ((killed ? 0.05 : 0.4) - mat.opacity) * Math.min(1, dt * 4)
    }
  })

  const tubeColor = killed ? '#f87171' : '#3a3f56'
  const particleColor = killed ? '#f87171' : flow > 0.5 ? '#a259ff' : '#60a5fa'

  return (
    <group>
      <mesh ref={tubeRef} geometry={tubeGeom}>
        <meshStandardMaterial
          color={tubeColor}
          transparent
          opacity={0.4}
          emissive={tubeColor}
          emissiveIntensity={0.2}
        />
      </mesh>
      <points ref={particleRef} geometry={particleGeom}>
        <pointsMaterial
          color={particleColor}
          size={killed ? 0.06 : 0.09}
          sizeAttenuation
          transparent
          opacity={killed ? 0.2 : 0.95}
        />
      </points>
    </group>
  )
}

function Scene() {
  const chaos = useStore((s) => s.chaos)
  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#a259ff" />
      <pointLight position={[-5, -3, 4]} intensity={0.8} color="#60a5fa" />
      {NODES.map((n) => {
        const killed =
          (n.group === 'provider' && chaos.killed_providers.includes(n.id)) ||
          (n.group === 'tool' && chaos.killed_tools.includes(n.id))
        return <NodeSphere key={n.id} node={n} killed={killed} />
      })}
      {EDGES.map((e, i) => {
        const fromKilled =
          chaos.killed_providers.includes(e.from) || chaos.killed_tools.includes(e.from)
        const toKilled =
          chaos.killed_providers.includes(e.to) || chaos.killed_tools.includes(e.to)
        // If primary providers are killed, redistribute flow to fallback.
        let flow = e.baseFlow
        if (e.to === 'tf-verify' && chaos.killed_providers.includes('tf-primary')) flow = 0.9
        if (e.to === 'tf-tertiary' && chaos.killed_providers.includes('tf-verify')) flow = 0.9
        if (e.to === 'ollama' && chaos.killed_providers.includes('tf-gateway')) flow = 0.9
        if (e.to === 'mock' && chaos.killed_providers.includes('ollama')) flow += 0.4
        if (e.to === 'prometheus' && chaos.killed_tools.includes('kubectl')) flow = 0.9
        const killed = fromKilled || toKilled
        return <Edge key={i} edge={e} flow={flow} killed={killed} />
      })}
    </>
  )
}

export default function Topology() {
  return (
    <div className="h-full w-full relative">
      <Canvas
        camera={{ position: [0, 0.1, 9], fov: 44 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0a0b0f' }}
      >
        <Scene />
        <OrbitControls
          enablePan={false}
          minDistance={6}
          maxDistance={16}
          enableDamping
          dampingFactor={0.1}
        />
      </Canvas>
      <div className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        topology / live traffic
      </div>
    </div>
  )
}
