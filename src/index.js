import "./styles.css";
import { initShaders } from "../lib/cuon-utils";
import { Matrix4 } from "../lib/cuon-matrix-cse160";
const VSHADER_SOURCE = `
  attribute vec3 a_Position;
  attribute vec3 a_Normal;
  attribute vec4 a_Color;

  uniform mat4 u_ModelMatrix;
  uniform mat4 u_NormalMatrix;
  uniform mat4 u_ViewMatrix;
  uniform mat4 u_ProjMatrix;

  varying vec3 v_Normal;
  varying vec3 v_WorldPos;
  varying vec4 v_Color;

  void main() {
    vec4 worldPos = u_ModelMatrix * vec4(a_Position, 1.0);
    v_WorldPos = worldPos.xyz;
    v_Normal = normalize((u_NormalMatrix * vec4(a_Normal, 0.0)).xyz);
    v_Color = a_Color;
    gl_Position = u_ProjMatrix * u_ViewMatrix * worldPos;
  }
`;

const FSHADER_SOURCE = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  varying vec3 v_Normal;
  varying vec3 v_WorldPos;
  varying vec4 v_Color;

  uniform vec3 u_CameraPos;
  uniform bool u_LightingOn;
  uniform bool u_NormalVizOn;

  uniform bool u_PointOn;
  uniform vec3 u_PointPos;
  uniform vec3 u_PointColor;

  uniform bool u_SpotOn;
  uniform vec3 u_SpotPos;
  uniform vec3 u_SpotDir;
  uniform float u_SpotCosCutoff;
  uniform float u_SpotExponent;
  uniform vec3 u_SpotColor;

  const float KA = 0.18;
  const float KS = 0.65;
  const float SHININESS = 48.0;

  vec3 phongLight(vec3 N, vec3 V, vec3 lightPos, vec3 lightColor, float spotFactor) {
    vec3 L = normalize(lightPos - v_WorldPos);
    float diff = max(dot(N, L), 0.0);
    vec3 R = reflect(-L, N);
    float spec = pow(max(dot(R, V), 0.0), SHININESS);
    vec3 ambient = KA * lightColor * v_Color.rgb;
    vec3 diffuse = diff * lightColor * v_Color.rgb;
    vec3 specular = KS * spec * lightColor;
    return (ambient + spotFactor * (diffuse + specular));
  }

  void main() {
    if (u_NormalVizOn) {
      gl_FragColor = vec4(normalize(v_Normal) * 0.5 + 0.5, 1.0);
      return;
    }

    if (!u_LightingOn) {
      gl_FragColor = v_Color;
      return;
    }

    vec3 N = normalize(v_Normal);
    vec3 V = normalize(u_CameraPos - v_WorldPos);
    vec3 color = KA * v_Color.rgb;

    if (u_PointOn) {
      color += phongLight(N, V, u_PointPos, u_PointColor, 1.0) - KA * v_Color.rgb;
    }

    if (u_SpotOn) {
      vec3 L = normalize(u_SpotPos - v_WorldPos);
      vec3 dir = normalize(u_SpotDir);
      float cosAngle = dot(-L, dir);
      float spot = 0.0;
      if (cosAngle > u_SpotCosCutoff) {
        spot = pow(cosAngle, u_SpotExponent);
      }
      color += phongLight(N, V, u_SpotPos, u_SpotColor, spot) - KA * v_Color.rgb;
    }

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), v_Color.a);
  }
`;

// ---- Geometry builders ----

function buildCube() {
  const p = [];
  const n = [];
  const c = [];
  const pushTri = (verts, normal, color) => {
    for (let i = 0; i < 3; i++) {
      p.push(...verts[i]);
      n.push(...normal);
      c.push(...color);
    }
  };
  const face = (verts, normal, color) => {
    pushTri([verts[0], verts[1], verts[2]], normal, color);
    pushTri([verts[0], verts[2], verts[3]], normal, color);
  };

  const red = [1.0, 0.15, 0.2, 1.0];
  const s = 0.5;
  const faces = [
    {
      v: [
        [-s, -s, s],
        [s, -s, s],
        [s, s, s],
        [-s, s, s]
      ],
      n: [0, 0, 1]
    },
    {
      v: [
        [s, -s, -s],
        [-s, -s, -s],
        [-s, s, -s],
        [s, s, -s]
      ],
      n: [0, 0, -1]
    },
    {
      v: [
        [-s, -s, -s],
        [-s, -s, s],
        [-s, s, s],
        [-s, s, -s]
      ],
      n: [-1, 0, 0]
    },
    {
      v: [
        [s, -s, s],
        [s, -s, -s],
        [s, s, -s],
        [s, s, s]
      ],
      n: [1, 0, 0]
    },
    {
      v: [
        [-s, s, s],
        [s, s, s],
        [s, s, -s],
        [-s, s, -s]
      ],
      n: [0, 1, 0]
    },
    {
      v: [
        [-s, -s, -s],
        [s, -s, -s],
        [s, -s, s],
        [-s, -s, s]
      ],
      n: [0, -1, 0]
    }
  ];
  for (const f of faces) face(f.v, f.n, red);
  return { positions: p, normals: n, colors: c };
}

function buildCubeWithColor(color) {
  const data = buildCube();
  const c = [];
  const count = data.positions.length / 3;
  for (let i = 0; i < count; i++) c.push(...color);
  data.colors = c;
  return data;
}

function buildPlane(size, color) {
  const h = size / 2;
  const y = 0;
  const p = [-h, y, -h, h, y, -h, h, y, h, -h, y, -h, h, y, h, -h, y, h];
  const n = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const c = [];
  for (let i = 0; i < 6; i++) c.push(...color);
  return { positions: p, normals: n, colors: c };
}

function buildSphere(radius, slices, stacks, color) {
  const p = [];
  const n = [];
  const c = [];
  const verts = [];

  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * Math.PI;
    const row = [];
    for (let j = 0; j <= slices; j++) {
      const theta = (j / slices) * Math.PI * 2;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      row.push([x, y, z]);
    }
    verts.push(row);
  }

  const pushTri = (a, b, d) => {
    for (const v of [a, b, d]) {
      p.push(...v);
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      n.push(v[0] / len, v[1] / len, v[2] / len);
      c.push(...color);
    }
  };

  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = verts[i][j];
      const b = verts[i + 1][j];
      const d = verts[i + 1][j + 1];
      const e = verts[i][j + 1];
      pushTri(a, b, d);
      pushTri(a, d, e);
    }
  }
  return { positions: p, normals: n, colors: c };
}

class Mesh {
  constructor(gl, data) {
    this.count = data.positions.length / 3;
    this.posBuf = gl.createBuffer();
    this.normBuf = gl.createBuffer();
    this.colorBuf = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(data.positions),
      gl.STATIC_DRAW
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(data.normals),
      gl.STATIC_DRAW
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(data.colors),
      gl.STATIC_DRAW
    );
  }

  static fromObj(gl, model, color) {
    const colors = [];
    for (let i = 0; i < model.vertexCount; i++) colors.push(...color);
    return new Mesh(gl, {
      positions: Array.from(model.positions),
      normals: Array.from(model.normals),
      colors
    });
  }

  updateColor(gl, color) {
    const c = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      c[i * 4] = color[0];
      c[i * 4 + 1] = color[1];
      c[i * 4 + 2] = color[2];
      c[i * 4 + 3] = color[3];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, c, gl.STATIC_DRAW);
  }

  draw(gl, attribs) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.vertexAttribPointer(attribs.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normBuf);
    gl.vertexAttribPointer(attribs.norm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.vertexAttribPointer(attribs.color, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}

// ---- Init WebGL ----

const canvas = document.getElementById("webgl");
const gl = canvas.getContext("webgl");
if (!gl) throw new Error("WebGL not supported");

if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
  throw new Error("Shader init failed");
}

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.12, 0.14, 0.2, 1.0);

const attribs = {
  pos: gl.getAttribLocation(gl.program, "a_Position"),
  norm: gl.getAttribLocation(gl.program, "a_Normal"),
  color: gl.getAttribLocation(gl.program, "a_Color")
};

const uniforms = {
  model: gl.getUniformLocation(gl.program, "u_ModelMatrix"),
  normal: gl.getUniformLocation(gl.program, "u_NormalMatrix"),
  view: gl.getUniformLocation(gl.program, "u_ViewMatrix"),
  proj: gl.getUniformLocation(gl.program, "u_ProjMatrix"),
  camera: gl.getUniformLocation(gl.program, "u_CameraPos"),
  lighting: gl.getUniformLocation(gl.program, "u_LightingOn"),
  normalViz: gl.getUniformLocation(gl.program, "u_NormalVizOn"),
  pointOn: gl.getUniformLocation(gl.program, "u_PointOn"),
  pointPos: gl.getUniformLocation(gl.program, "u_PointPos"),
  pointColor: gl.getUniformLocation(gl.program, "u_PointColor"),
  spotOn: gl.getUniformLocation(gl.program, "u_SpotOn"),
  spotPos: gl.getUniformLocation(gl.program, "u_SpotPos"),
  spotDir: gl.getUniformLocation(gl.program, "u_SpotDir"),
  spotCos: gl.getUniformLocation(gl.program, "u_SpotCosCutoff"),
  spotExp: gl.getUniformLocation(gl.program, "u_SpotExponent"),
  spotColor: gl.getUniformLocation(gl.program, "u_SpotColor")
};

gl.enableVertexAttribArray(attribs.pos);
gl.enableVertexAttribArray(attribs.norm);
gl.enableVertexAttribArray(attribs.color);

const meshGround = new Mesh(gl, buildPlane(12, [1, 1, 1, 1]));
const meshCube = new Mesh(gl, buildCube());
const meshUnitCube = new Mesh(
  gl,
  buildCubeWithColor([0.55, 0.36, 0.22, 1.0])
);
const meshSphereA = new Mesh(
  gl,
  buildSphere(0.55, 24, 16, [0.1, 0.45, 1.0, 1.0])
);
const meshSphereB = new Mesh(
  gl,
  buildSphere(0.4, 20, 14, [0.1, 0.95, 0.35, 1.0])
);
const meshPointMarker = new Mesh(
  gl,
  buildCubeWithColor([1.0, 0.95, 0.2, 1.0])
);
const meshSpotMarker = new Mesh(
  gl,
  buildCubeWithColor([0.3, 0.85, 1.0, 1.0])
);

// ---- State ----

let g_camYaw = 25;
let g_camPitch = 18;
let g_camDist = 10;

let g_pointPos = [3, 2.5, 2];
let g_pointColor = [1, 0.95, 0.85];
let g_pointOn = true;
let g_animateLight = true;

let g_spotPos = [-2, 5, 1];
let g_spotDir = [0.2, -1, 0.15];
let g_spotCutDeg = 22;
let g_spotOn = true;
const g_spotColor = [0.75, 0.85, 1.0];

let g_lightingOn = true;
let g_normalVizOn = false;

const keys = {};

const viewMatrix = new Matrix4();
const projMatrix = new Matrix4();
const modelMatrix = new Matrix4();
const normalMatrix = new Matrix4();
const cameraPos = [0, 3, 10];

function updateCameraMatrices() {
  const yaw = (g_camYaw * Math.PI) / 180;
  const pitch = (g_camPitch * Math.PI) / 180;
  const cx = g_camDist * Math.cos(pitch) * Math.sin(yaw);
  const cy = g_camDist * Math.sin(pitch) + 1.2;
  const cz = g_camDist * Math.cos(pitch) * Math.cos(yaw);

  cameraPos[0] = cx;
  cameraPos[1] = cy;
  cameraPos[2] = cz;

  viewMatrix.setLookAt(cx, cy, cz, 0, 0.6, 0, 0, 1, 0);
  projMatrix.setPerspective(45, canvas.width / canvas.height, 0.1, 100);
}

function setModel(M) {
  gl.uniformMatrix4fv(uniforms.model, false, M.elements);
  normalMatrix.setInverseOf(M);
  normalMatrix.transpose();
  gl.uniformMatrix4fv(uniforms.normal, false, normalMatrix.elements);
}

function drawMesh(mesh, M) {
  setModel(M);
  mesh.draw(gl, attribs);
}

function drawColoredCube(M, color) {
  meshUnitCube.updateColor(gl, color);
  drawMesh(meshUnitCube, M);
}

function pushMatrix(stack, M) {
  stack.push(new Matrix4(M));
}

function popMatrix(stack) {
  return stack.pop();
}

const HORSE_BROWN = [0.55, 0.36, 0.22, 1.0];
const HORSE_DARK = [0.45, 0.28, 0.16, 1.0];
const HORSE_MUZZLE = [0.52, 0.34, 0.21, 1.0];
const HORSE_EAR = [0.5, 0.32, 0.19, 1.0];
const HORSE_MANE = [0.38, 0.24, 0.14, 1.0];
const HORSE_TAIL = [0.25, 0.16, 0.1, 1.0];
const HORSE_TAIL_TIP = [0.18, 0.12, 0.08, 1.0];
const HORSE_CALF = [0.5, 0.32, 0.2, 1.0];
const HORSE_HOOF = [0.1, 0.1, 0.1, 1.0];
const HORSE_EYE_WHITE = [0.92, 0.92, 0.88, 1.0];
const HORSE_EYE = [0.06, 0.06, 0.1, 1.0];
const HORSE_NOSTRIL = [0.1, 0.07, 0.05, 1.0];
const HORSE_MOUTH = [0.2, 0.12, 0.1, 1.0];

function drawHorse(worldRoot) {
  const stack = [];
  const root = new Matrix4(worldRoot);
  root.scale(0.75, 0.75, 0.75);
  root.translate(0, 0.18, 0);

  // Torso: chest, barrel, rump
  const chest = new Matrix4(root);
  chest.translate(0.38, 0.04, 0);
  chest.scale(0.55, 0.52, 0.46);
  drawColoredCube(chest, HORSE_BROWN);

  const barrel = new Matrix4(root);
  barrel.translate(0.02, 0.06, 0);
  barrel.scale(0.95, 0.54, 0.5);
  drawColoredCube(barrel, HORSE_BROWN);

  const rump = new Matrix4(root);
  rump.translate(-0.48, 0.1, 0);
  rump.scale(0.58, 0.5, 0.48);
  drawColoredCube(rump, HORSE_BROWN);

  const withers = new Matrix4(root);
  withers.translate(0.48, 0.24, 0);
  withers.scale(0.38, 0.16, 0.32);
  drawColoredCube(withers, HORSE_BROWN);

  // Neck
  const neck = new Matrix4(root);
  neck.translate(0.68, 0.3, 0);
  neck.rotate(18, 0, 0, 1);
  const neckManeFrame = new Matrix4(neck);
  pushMatrix(stack, neck);
  neck.scale(0.48, 0.22, 0.26);
  drawColoredCube(neck, HORSE_BROWN);

  for (let i = 0; i < 7; i++) {
    const mane = new Matrix4(neckManeFrame);
    mane.translate(-0.2 + i * 0.075, 0.19, 0);
    mane.scale(0.13, 0.22 - i * 0.015, 0.105);
    drawColoredCube(mane, HORSE_MANE);
  }
  const neckToCrest = new Matrix4(root);
  neckToCrest.translate(0.56, 0.31, 0);
  neckToCrest.scale(0.13, 0.19, 0.1);
  drawColoredCube(neckToCrest, HORSE_MANE);

  for (let i = 0; i < 5; i++) {
    const crest = new Matrix4(root);
    crest.translate(0.48 - i * 0.1, 0.32 - i * 0.02, 0);
    crest.scale(0.13 - i * 0.008, 0.2 - i * 0.012, 0.1);
    drawColoredCube(crest, HORSE_MANE);
  }

  // Head, muzzle, ears, eyes
  let headBase = popMatrix(stack);
  headBase.translate(0.32, 0.14, 0);

  const headTopMane = new Matrix4(headBase);
  headTopMane.translate(0, 0.08, 0);
  headTopMane.scale(0.38, 0.07, 0.3);
  drawColoredCube(headTopMane, HORSE_MANE);

  for (let i = 0; i < 3; i++) {
    const poll = new Matrix4(headBase);
    poll.translate(0.02 - i * 0.048, 0.15, 0);
    poll.scale(0.12, 0.15, 0.1);
    drawColoredCube(poll, HORSE_MANE);
  }

  for (let i = 0; i < 4; i++) {
    const headNeckMane = new Matrix4(headBase);
    headNeckMane.translate(-0.1 - i * 0.055, 0.16, 0);
    headNeckMane.scale(0.12, 0.17 - i * 0.01, 0.105);
    drawColoredCube(headNeckMane, HORSE_MANE);
  }

  const head = new Matrix4(headBase);
  head.scale(0.4, 0.24, 0.3);
  drawColoredCube(head, HORSE_DARK);

  const muzzle = new Matrix4(headBase);
  muzzle.translate(0.24, -0.04, 0);
  muzzle.scale(0.32, 0.15, 0.2);
  drawColoredCube(muzzle, HORSE_MUZZLE);

  const nostrilL = new Matrix4(headBase);
  nostrilL.translate(0.405, 0.01, 0.04);
  nostrilL.scale(0.025, 0.045, 0.035);
  drawColoredCube(nostrilL, HORSE_NOSTRIL);

  const nostrilR = new Matrix4(headBase);
  nostrilR.translate(0.405, 0.01, -0.04);
  nostrilR.scale(0.025, 0.045, 0.035);
  drawColoredCube(nostrilR, HORSE_NOSTRIL);

  const mouth = new Matrix4(headBase);
  mouth.translate(0.405, -0.09, 0);
  mouth.scale(0.025, 0.04, 0.1);
  drawColoredCube(mouth, HORSE_MOUTH);

  const mouthLine = new Matrix4(headBase);
  mouthLine.translate(0.403, -0.1, 0);
  mouthLine.scale(0.022, 0.018, 0.09);
  drawColoredCube(mouthLine, HORSE_NOSTRIL);

  function drawEar(side) {
    const ear = new Matrix4(headBase);
    ear.translate(0.02, 0.18, 0.11 * side);
    ear.rotate(8 * side, 0, 1, 0);
    ear.rotate(-18, 1, 0, 0);
    ear.scale(0.09, 0.24, 0.05);
    drawColoredCube(ear, HORSE_EAR);
  }
  drawEar(1);
  drawEar(-1);

  function drawEye(side) {
    const white = new Matrix4(headBase);
    white.translate(0.19, 0.07, 0.065 * side);
    white.scale(0.03, 0.08, 0.055);
    drawColoredCube(white, HORSE_EYE_WHITE);

    const pupil = new Matrix4(headBase);
    pupil.translate(0.2, 0.07, 0.065 * side);
    pupil.scale(0.02, 0.055, 0.04);
    drawColoredCube(pupil, HORSE_EYE);
  }
  drawEye(1);
  drawEye(-1);

  function drawTailPart(base, tx, ty, rotZ, sx, sy, sz, color) {
    const seg = new Matrix4(base);
    seg.translate(tx, ty, 0);
    if (rotZ !== 0) seg.rotate(rotZ, 0, 0, 1);
    seg.scale(sx, sy, sz);
    drawColoredCube(seg, color);
  }

  // Tail: drops on -Y with a gentle curve (sy = length, tiny Z tilt toward rump)
  let tailBase = new Matrix4(root);
  tailBase.translate(-0.74, 0.28, 0);

  drawTailPart(tailBase, 0, -0.06, 0, 0.1, 0.15, 0.1, HORSE_TAIL);

  tailBase = new Matrix4(tailBase);
  tailBase.translate(0, -0.12, 0);
  tailBase.rotate(-8, 0, 0, 1);
  drawTailPart(tailBase, 0, -0.05, 0, 0.09, 0.18, 0.09, HORSE_TAIL);

  tailBase = new Matrix4(tailBase);
  tailBase.translate(0, -0.16, 0);
  tailBase.rotate(-10, 0, 0, 1);
  drawTailPart(tailBase, 0, -0.06, 0, 0.08, 0.21, 0.08, HORSE_TAIL);

  tailBase = new Matrix4(tailBase);
  tailBase.translate(0, -0.18, 0);
  tailBase.rotate(-10, 0, 0, 1);
  drawTailPart(tailBase, 0, -0.07, 0, 0.07, 0.19, 0.07, HORSE_TAIL);

  tailBase = new Matrix4(tailBase);
  tailBase.translate(0, -0.17, 0);
  tailBase.rotate(-7, 0, 0, 1);
  drawTailPart(tailBase, 0, -0.08, 0, 0.06, 0.15, 0.06, HORSE_TAIL_TIP);

  function drawLeg(hipX, hipZ, shoulder, knee, ankle) {
    let M = new Matrix4(root);
    M.translate(hipX, -0.05, hipZ);

    pushMatrix(stack, M);
    M.rotate(shoulder, 0, 0, 1);
    pushMatrix(stack, M);
    {
      const thigh = new Matrix4(M);
      thigh.translate(0, -0.28, 0);
      thigh.scale(0.16, 0.45, 0.16);
      drawColoredCube(thigh, HORSE_BROWN);
    }

    M = popMatrix(stack);
    M.translate(0, -0.52, 0);
    M.rotate(knee, 0, 0, 1);
    {
      const kneeCap = new Matrix4(M);
      kneeCap.translate(0.02, 0, 0);
      kneeCap.scale(0.12, 0.1, 0.12);
      drawColoredCube(kneeCap, HORSE_CALF);
    }
    pushMatrix(stack, M);
    {
      const calf = new Matrix4(M);
      calf.translate(0, -0.23, 0);
      calf.scale(0.14, 0.38, 0.14);
      drawColoredCube(calf, HORSE_CALF);
    }

    M = popMatrix(stack);
    M.translate(0, -0.42, 0);
    M.rotate(ankle, 0, 0, 1);
    {
      const hoof = new Matrix4(M);
      hoof.translate(0.05, -0.06, 0);
      hoof.scale(0.22, 0.12, 0.18);
      drawColoredCube(hoof, HORSE_HOOF);
    }

    popMatrix(stack);
  }

  drawLeg(0.45, 0.18, 15, -25, 10);
  drawLeg(0.45, -0.18, -10, -18, -7);
  drawLeg(-0.45, 0.16, 10, -20, 5);
  drawLeg(-0.45, -0.16, -10, -20, 5);
}

function drawScene() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  updateCameraMatrices();

  gl.uniformMatrix4fv(uniforms.view, false, viewMatrix.elements);
  gl.uniformMatrix4fv(uniforms.proj, false, projMatrix.elements);
  gl.uniform3fv(uniforms.camera, cameraPos);
  gl.uniform1i(uniforms.lighting, g_lightingOn ? 1 : 0);
  gl.uniform1i(uniforms.normalViz, g_normalVizOn ? 1 : 0);

  gl.uniform1i(uniforms.pointOn, g_pointOn ? 1 : 0);
  gl.uniform3fv(uniforms.pointPos, g_pointPos);
  gl.uniform3fv(uniforms.pointColor, g_pointColor);

  gl.uniform1i(uniforms.spotOn, g_spotOn ? 1 : 0);
  gl.uniform3fv(uniforms.spotPos, g_spotPos);
  const dir = normalize3(g_spotDir);
  gl.uniform3fv(uniforms.spotDir, dir);
  const cutRad = (g_spotCutDeg * Math.PI) / 180;
  gl.uniform1f(uniforms.spotCos, Math.cos(cutRad));
  gl.uniform1f(uniforms.spotExp, 12.0);
  gl.uniform3fv(uniforms.spotColor, g_spotColor);

  const ground = new Matrix4();
  drawMesh(meshGround, ground);

  const cube = new Matrix4();
  cube.translate(-1.6, 0.55, 0.4);
  cube.scale(1.1, 1.1, 1.1);
  drawMesh(meshCube, cube);

  const spA = new Matrix4();
  spA.translate(1.5, 0.55, -0.8);
  drawMesh(meshSphereA, spA);

  const spB = new Matrix4();
  spB.translate(0.3, 0.45, 1.8);
  drawMesh(meshSphereB, spB);

  const horse = new Matrix4();
  horse.translate(0.2, 0.88, -0.5);
  horse.rotate(-30, 0, 1, 0);
  drawHorse(horse);

  // Point light marker (emissive-looking yellow cube)
  const savedLighting = g_lightingOn;
  g_lightingOn = false;
  gl.uniform1i(uniforms.lighting, 0);
  const marker = new Matrix4();
  marker.translate(g_pointPos[0], g_pointPos[1], g_pointPos[2]);
  marker.scale(0.18, 0.18, 0.18);
  drawMesh(meshPointMarker, marker);
  g_lightingOn = savedLighting;
  gl.uniform1i(uniforms.lighting, g_lightingOn ? 1 : 0);

  const spotMarker = new Matrix4();
  spotMarker.translate(g_spotPos[0], g_spotPos[1], g_spotPos[2]);
  spotMarker.scale(0.14, 0.14, 0.14);
  drawMesh(meshSpotMarker, spotMarker);
}

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ---- UI ----

function bindSlider(id, read, write, outId, format = (v) => v) {
  const el = document.getElementById(id);
  const out = document.getElementById(outId);
  if (!el) return;
  el.addEventListener("input", () => {
    const v = Number(el.value);
    write(v);
    if (out) out.textContent = format(v);
    drawScene();
  });
  if (out) out.textContent = format(read());
}

bindSlider("camYaw", () => g_camYaw, (v) => (g_camYaw = v), "camYawVal");
bindSlider("camPitch", () => g_camPitch, (v) => (g_camPitch = v), "camPitchVal");
bindSlider("camDist", () => g_camDist, (v) => (g_camDist = v), "camDistVal");
bindSlider("ptX", () => g_pointPos[0], (v) => (g_pointPos[0] = v), "ptXVal");
bindSlider("ptY", () => g_pointPos[1], (v) => (g_pointPos[1] = v), "ptYVal");
bindSlider("ptZ", () => g_pointPos[2], (v) => (g_pointPos[2] = v), "ptZVal");
bindSlider(
  "lightR",
  () => g_pointColor[0],
  (v) => (g_pointColor[0] = v / 100),
  "lightRVal",
  (v) => String(Math.round(v))
);
bindSlider(
  "lightG",
  () => g_pointColor[1],
  (v) => (g_pointColor[1] = v / 100),
  "lightGVal",
  (v) => String(Math.round(v))
);
bindSlider(
  "lightB",
  () => g_pointColor[2],
  (v) => (g_pointColor[2] = v / 100),
  "lightBVal",
  (v) => String(Math.round(v))
);
bindSlider("spX", () => g_spotPos[0], (v) => (g_spotPos[0] = v), "spXVal");
bindSlider("spY", () => g_spotPos[1], (v) => (g_spotPos[1] = v), "spYVal");
bindSlider("spZ", () => g_spotPos[2], (v) => (g_spotPos[2] = v), "spZVal");
bindSlider(
  "spotCut",
  () => g_spotCutDeg,
  (v) => (g_spotCutDeg = v),
  "spotCutVal"
);

const animateEl = document.getElementById("animateLight");
if (animateEl) {
  animateEl.addEventListener("change", () => {
    g_animateLight = animateEl.checked;
  });
}

function wireToggle(btnId, get, set, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const refresh = () => {
    btn.textContent = `${label}: ${get() ? "ON" : "OFF"}`;
  };
  btn.addEventListener("click", () => {
    set(!get());
    refresh();
    drawScene();
  });
  refresh();
}

wireToggle("toggleLighting", () => g_lightingOn, (v) => (g_lightingOn = v), "Lighting");
wireToggle(
  "toggleNormals",
  () => g_normalVizOn,
  (v) => (g_normalVizOn = v),
  "Normal viz"
);
wireToggle("togglePoint", () => g_pointOn, (v) => (g_pointOn = v), "Point light");
wireToggle("toggleSpot", () => g_spotOn, (v) => (g_spotOn = v), "Spot light");

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

function handleKeyboard() {
  const step = 1.2;
  if (keys["a"]) g_camYaw -= step;
  if (keys["d"]) g_camYaw += step;
  if (keys["w"]) g_camPitch = Math.min(89, g_camPitch + step);
  if (keys["s"]) g_camPitch = Math.max(-89, g_camPitch - step);
  if (keys["q"]) g_camDist = Math.max(4, g_camDist - 0.08);
  if (keys["e"]) g_camDist = Math.min(20, g_camDist + 0.08);

  const yawEl = document.getElementById("camYaw");
  const pitchEl = document.getElementById("camPitch");
  const distEl = document.getElementById("camDist");
  if (yawEl) {
    yawEl.value = String(g_camYaw);
    const o = document.getElementById("camYawVal");
    if (o) o.textContent = String(Math.round(g_camYaw));
  }
  if (pitchEl) {
    pitchEl.value = String(g_camPitch);
    const o = document.getElementById("camPitchVal");
    if (o) o.textContent = String(Math.round(g_camPitch));
  }
  if (distEl) {
    distEl.value = String(g_camDist);
    const o = document.getElementById("camDistVal");
    if (o) o.textContent = g_camDist.toFixed(1);
  }
}

// ---- Animation loop ----

let g_prev = performance.now();
let g_fps = 0;
const fpsEl = document.getElementById("fps");
let g_animT = 0;

function tick(now) {
  const dt = now - g_prev;
  g_prev = now;
  g_fps = g_fps ? g_fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  if (fpsEl) fpsEl.textContent = `FPS: ${g_fps.toFixed(1)}`;

  g_animT += dt * 0.001;

  if (g_animateLight) {
    g_pointPos[0] = 3.5 * Math.cos(g_animT * 0.9);
    g_pointPos[2] = 3.5 * Math.sin(g_animT * 0.9);
    g_pointPos[1] = 2.2 + 0.6 * Math.sin(g_animT * 1.4);
    const px = document.getElementById("ptX");
    const py = document.getElementById("ptY");
    const pz = document.getElementById("ptZ");
    if (px) px.value = g_pointPos[0].toFixed(1);
    if (py) py.value = g_pointPos[1].toFixed(1);
    if (pz) pz.value = g_pointPos[2].toFixed(1);
    const ox = document.getElementById("ptXVal");
    const oy = document.getElementById("ptYVal");
    const oz = document.getElementById("ptZVal");
    if (ox) ox.textContent = g_pointPos[0].toFixed(1);
    if (oy) oy.textContent = g_pointPos[1].toFixed(1);
    if (oz) oz.textContent = g_pointPos[2].toFixed(1);
  }

  // Spotlight aims at scene center
  g_spotDir = [0, 0.6, 0];
  g_spotDir[0] -= g_spotPos[0];
  g_spotDir[1] -= g_spotPos[1];
  g_spotDir[2] -= g_spotPos[2];

  handleKeyboard();
  drawScene();
  requestAnimationFrame(tick);
}

drawScene();
requestAnimationFrame(tick);
