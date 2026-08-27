"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type ConstellationActivity = "files" | "idle" | "thinking" | "voice";

function activityColor(activity: ConstellationActivity): string {
  return activity === "voice"
    ? "#69f3bd"
    : activity === "files"
      ? "#ff8f79"
      : "#77d8ff";
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function ConstellationScene({
  activity,
  reducedMotion,
  starfallEnabled,
}: {
  activity: ConstellationActivity;
  reducedMotion: boolean;
  starfallEnabled: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const { points, segments } = useMemo(() => {
    const random = seededRandom(4317);
    const nodes = Array.from(
      { length: 68 },
      () =>
        new THREE.Vector3(
          (random() - 0.5) * 13,
          (random() - 0.5) * 8,
          (random() - 0.5) * 5 - 2,
        ),
    );
    const pointBuffer = new Float32Array(nodes.length * 3);
    nodes.forEach((node, index) => node.toArray(pointBuffer, index * 3));

    const links: number[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const source = nodes[index];
      if (!source) continue;
      const candidates = nodes
        .map((target, targetIndex) => ({
          distance: source.distanceTo(target),
          target,
          targetIndex,
        }))
        .filter(
          (candidate) =>
            candidate.targetIndex > index && candidate.distance < 2.25,
        )
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 2);
      for (const candidate of candidates) {
        links.push(...source.toArray(), ...candidate.target.toArray());
      }
    }
    return { points: pointBuffer, segments: new Float32Array(links) };
  }, []);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      pointer.current.x = event.clientX / window.innerWidth - 0.5;
      pointer.current.y = event.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", handlePointer, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointer);
  }, []);

  useFrame((state, delta) => {
    if (!group.current || reducedMotion) return;
    const speed = activity === "thinking" ? 0.055 : 0.018;
    group.current.rotation.z += delta * speed;
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      pointer.current.y * 0.09,
      0.025,
    );
    group.current.rotation.y = THREE.MathUtils.lerp(
      group.current.rotation.y,
      pointer.current.x * 0.12,
      0.025,
    );
    const pulse =
      activity === "voice" ? Math.sin(state.clock.elapsedTime * 4) : 0;
    group.current.scale.setScalar(1 + pulse * 0.008);
  });

  const pointColor = activityColor(activity);

  return (
    <>
      <group ref={group} rotation={[0.04, -0.08, -0.06]}>
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[segments, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={pointColor}
            opacity={activity === "thinking" ? 0.28 : 0.16}
            transparent
          />
        </lineSegments>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[points, 3]} />
          </bufferGeometry>
          <pointsMaterial
            color={pointColor}
            opacity={0.74}
            size={activity === "voice" ? 0.048 : 0.036}
            sizeAttenuation
            transparent
          />
        </points>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[points, 3]} />
          </bufferGeometry>
          <pointsMaterial
            blending={THREE.AdditiveBlending}
            color={pointColor}
            depthWrite={false}
            opacity={activity === "thinking" ? 0.16 : 0.1}
            size={activity === "voice" ? 0.14 : 0.1}
            sizeAttenuation
            transparent
          />
        </points>
      </group>
      <AmbientParticles activity={activity} reducedMotion={reducedMotion} />
      {starfallEnabled ? <Starfall reducedMotion={reducedMotion} /> : null}
    </>
  );
}

function AmbientParticles({
  activity,
  reducedMotion,
}: {
  activity: ConstellationActivity;
  reducedMotion: boolean;
}) {
  const field = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(7219);
    return new Float32Array(
      Array.from({ length: 96 }, () => [
        (random() - 0.5) * 18,
        (random() - 0.5) * 11,
        (random() - 0.5) * 8 - 3,
      ]).flat(),
    );
  }, []);

  useFrame((state, delta) => {
    if (!field.current || reducedMotion) return;
    field.current.rotation.y += delta * 0.006;
    field.current.position.x = Math.sin(state.clock.elapsedTime * 0.09) * 0.12;
    field.current.position.y = Math.cos(state.clock.elapsedTime * 0.07) * 0.06;
  });

  return (
    <points ref={field}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        color={activityColor(activity)}
        depthWrite={false}
        opacity={activity === "thinking" ? 0.26 : 0.18}
        size={0.032}
        sizeAttenuation
        transparent
      />
    </points>
  );
}

function Starfall({ reducedMotion }: { reducedMotion: boolean }) {
  const stars = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(9081);
    return new Float32Array(
      Array.from({ length: 42 }, () => [
        (random() - 0.5) * 16,
        (random() - 0.5) * 10,
        (random() - 0.5) * 3 - 1,
      ]).flat(),
    );
  }, []);
  useFrame((_, delta) => {
    if (!stars.current || reducedMotion) return;
    const attribute = stars.current.geometry.attributes.position;
    if (!(attribute instanceof THREE.BufferAttribute)) return;
    for (let index = 0; index < attribute.count; index += 1) {
      let x = attribute.getX(index) + delta * 0.22;
      let y = attribute.getY(index) - delta * 0.72;
      if (y < -5.2) {
        y = 5.2;
        x = ((index * 47) % 160) / 10 - 8;
      }
      attribute.setXY(index, x > 8.2 ? -8.2 : x, y);
    }
    attribute.needsUpdate = true;
  });
  return (
    <points ref={stars}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        color="#d9f7ff"
        depthWrite={false}
        opacity={0.4}
        size={0.028}
        sizeAttenuation
        transparent
      />
    </points>
  );
}

export function ConstellationBackground({
  activity,
  motionEnabled = true,
  starfallEnabled = true,
}: {
  activity: ConstellationActivity;
  motionEnabled?: boolean;
  starfallEnabled?: boolean;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div aria-hidden="true" className="constellation-background">
      <Canvas
        camera={{ fov: 48, position: [0, 0, 8] }}
        dpr={[1, 1.5]}
        frameloop={reducedMotion || !motionEnabled ? "demand" : "always"}
        gl={{
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
        }}
      >
        <ConstellationScene
          activity={activity}
          reducedMotion={reducedMotion || !motionEnabled}
          starfallEnabled={starfallEnabled && motionEnabled}
        />
      </Canvas>
    </div>
  );
}
