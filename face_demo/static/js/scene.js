import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createAvatarScene(canvas) {
  // Basic scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f4f6);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 0, 1.1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.45;
  controls.maxPolarAngle = Math.PI * 0.55;

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(0.5, 1.0, 1.0);
  scene.add(key);

  let mesh = null;
  let origPos = null;
  let lowerLipIdx = [];
  let upperLipIdx = [];
  let analyser = null;
  let audioCtx = null;
  let rafId = null;

  function fitCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  function buildMeshFromJSON(data) {
    const verts = data.vertices; // [[x,y,z]]
    const faces = data.faces;    // [[a,b,c]]
    const uv = data.uv;          // [[u,v]] one per vertex

    const geometry = new THREE.BufferGeometry();
    const flatPos = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
      flatPos[i*3]   = verts[i][0];
      flatPos[i*3+1] = verts[i][1];
      flatPos[i*3+2] = verts[i][2];
    }
    const flatUv = new Float32Array(uv.length * 2);
    for (let i = 0; i < uv.length; i++) {
      flatUv[i*2]   = uv[i][0];
      flatUv[i*2+1] = 1.0 - uv[i][1]; // flip V
    }
    const idx = new Uint32Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) {
      idx[i*3]   = faces[i][0];
      idx[i*3+1] = faces[i][1];
      idx[i*3+2] = faces[i][2];
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(flatPos, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(flatUv, 2));
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    geometry.computeVertexNormals();
    return geometry;
  }

  function setMeshFromData(meshJson, textureUrl) {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
      mesh = null;
      origPos = null;
    }
    const geometry = buildMeshFromJSON(meshJson);
    const mat = new THREE.MeshPhongMaterial({ side: THREE.DoubleSide });

    if (textureUrl) {
      const tex = new THREE.TextureLoader().load(textureUrl);
      tex.flipY = false;
      mat.map = tex;
    } else {
      mat.color = new THREE.Color(0xdddddd);
    }

    mesh = new THREE.Mesh(geometry, mat);
    mesh.rotation.y = Math.PI;  
    scene.add(mesh);

    // clone base positions for deformation
    const posAttr = mesh.geometry.getAttribute('position');
    origPos = posAttr.array.slice(0);
  }

  function setLipIndices(features) {
    lowerLipIdx = (features.lower_lip || features.lips || []);
    upperLipIdx = (features.upper_lip || []);
  }

  function playAvatarAudio(url) {
    if (audioCtx) {
      try { audioCtx.close(); } catch {}
      audioCtx = null;
    }
    const audio = new Audio(url);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaElementSource(audio);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    an.connect(ctx.destination);
    audioCtx = ctx;
    analyser = an;
    audio.play();
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (mesh && analyser && origPos && lowerLipIdx.length) {
      const N = 256;
      const buf = new Uint8Array(N);
      analyser.getByteTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < N; i++) { const v = buf[i]-128; s += v*v; }
      const rms = Math.sqrt(s/N) / 26;
      const amp = Math.min(1, rms);

      const pos = mesh.geometry.getAttribute('position');
      const arr = pos.array;

      let sumY = 0, n = 0;
      const allLipIdx = lowerLipIdx.concat(upperLipIdx);
      for (const idx of allLipIdx) { sumY += origPos[idx*3+1]; n++; }
      const yC = n ? (sumY / n) : 0;

      for (const idx of lowerLipIdx) {
        const baseY = origPos[idx*3+1];
        const dy = Math.abs(baseY - yC);
        const falloff = Math.max(0.25, 1.0 - dy * 2.0);
        arr[idx*3+1] = baseY - 0.035 * amp * falloff;
      }
      for (const idx of upperLipIdx) {
        const baseY = origPos[idx*3+1];
        arr[idx*3+1] = baseY;
      }
      pos.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    if (rafId) cancelAnimationFrame(rafId);
    if (controls) controls.dispose();
    if (renderer) renderer.dispose();
    if (audioCtx) try { audioCtx.close(); } catch {}
  }

  // Start
  fitCanvas();
  animate();
  window.addEventListener('resize', fitCanvas);

  return {
    scene, camera, renderer, controls,
    setMeshFromData, setLipIndices, playAvatarAudio, fitCanvas, dispose
  };
}
