import { createRoot, useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
export interface OriginalEngine {
  renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera;
  frame: () => void; cameraForView: () => PerspectiveCamera; stop: () => void;
  metrics: () => { frames: number; mode: string; pixelRatio: number; frameMs?: number; geometries?: number; textures?: number };
}
function useGalaxyCamera(engine: OriginalEngine) {
  const set = useThree(state => state.set);
  useFrame(state => { const camera = engine.cameraForView(); if (state.camera !== camera) set({ camera }); }, -1);
}
function useStarField(engine: OriginalEngine) {
  const setFrameloop = useThree(state => state.setFrameloop);
  useFrame(() => engine.frame(), 1); // The scene performs one render pass per frame.
  useEffect(() => {
    // Full-screen forms cover the scene. Retain its last frame so encryption,
    // typing, and prayer controls do not compete with a hidden WebGL render.
    const change = () => setFrameloop(document.hidden || document.querySelector(".um-screen.on") ? "never" : "always");
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === "childList" || record.target instanceof Element && record.target.matches(".um-screen"))) change();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", change);
    change();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", change); };
  }, [setFrameloop]);
}
function GalaxyScene({ engine }: { engine: OriginalEngine }) { useGalaxyCamera(engine); useStarField(engine); return null; }
export async function mountFiberEngine(engine: OriginalEngine) {
  const originalMetrics=engine.metrics, originalFrame=engine.frame; let frames=0, frameMs=0;
  engine.frame=()=>{const start=performance.now();originalFrame();frames++;frameMs=frameMs*.95+(performance.now()-start)*.05;};
  engine.metrics=()=>({...originalMetrics(),frames,frameMs,geometries:engine.renderer.info.memory.geometries,textures:engine.renderer.info.memory.textures});
  engine.stop(); const gl = engine.renderer, toneMapping = gl.toneMapping, exposure = gl.toneMappingExposure;
  const root = createRoot(gl.domElement);
  await root.configure({ gl, scene: engine.scene, camera: engine.camera, frameloop: "always", dpr: gl.getPixelRatio(), size: { width: innerWidth, height: innerHeight, top: 0, left: 0 } });
  gl.toneMapping = toneMapping; gl.toneMappingExposure = exposure;
  root.render(<GalaxyScene engine={engine} />);
  window.addEventListener("resize", () => void root.configure({ size: { width: innerWidth, height: innerHeight, top: 0, left: 0 }, dpr: gl.getPixelRatio() }));
  document.documentElement.dataset.renderer = "react-three-fiber";
}
