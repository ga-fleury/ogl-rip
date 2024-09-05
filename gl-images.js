import { Renderer } from "https://unpkg.com/ogl@0.0.74/src/core/Renderer.js";
import { Program } from "https://unpkg.com/ogl@0.0.74/src/core/Program.js";
import { Texture } from "https://unpkg.com/ogl@0.0.74/src/core/Texture.js";
import { Triangle } from "https://unpkg.com/ogl@0.0.74/src/extras/Triangle.js";
import { Mesh } from "https://unpkg.com/ogl@0.0.74/src/core/Mesh.js";
// import { Flowmap } from "https://unpkg.com/ogl@0.0.74/src/extras/Flowmap.js";
import { Flowmap } from "./Flowmap.js";
import { Vec2 } from "https://unpkg.com/ogl@0.0.74/src/math/Vec2.js";

class TextureLoader extends Texture {
  load(src) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => (this.image = img);
    img.src = src;
    return this;
  }
}

class GLContext extends Rect {
  constructor(element) {
    super(element);
    this.element = element;
    this.renderer = new Renderer({
      antialias: true,
      alpha: false,
      dpr: window.devicePixelRatio,
      webgl: document.createElement("canvas").getContext("webgl2") ? 2 : 1
    });
    this.gl = this.renderer.gl;
    this.element.appendChild(this.gl.canvas);
  }

  onResize(e) {
    super.onResize(e);

    this.renderer.setSize(this.width, this.height);
    this.aspect = this.width / this.height;
  }
}

class GLImage extends GLContext {
  constructor(element) {
    super(element);

    // this.texture = new Texture(this.gl);

    // this.image = element.querySelector("img");
    // this.image.crossOrigin = "anonymous";
    // this.onLoad = this.onLoad.bind(this);
    // if (this.image.naturalWidth) this.onLoad();
    // this.image.addEventListener("load", this.onLoad);

    const texture = new TextureLoader(this.gl).load(
      element.querySelector("img").src
    );
    texture.minFilter = texture.magFilter = this.gl.LINEAR;
    console.log(this.gl);

    const paper = new TextureLoader(this.gl).load("./paper.jpg");
    paper.minFilter = paper.magFilter = this.gl.LINEAR;

    // Variable inputs to control flowmap
    this.aspect = 1;
    this.mouse = new Vec2(-1);
    this.velocity = new Vec2();

    this.flowmap = new Flowmap(this.gl, {
      size: 512,
      falloff: 0.3
    });

    this.geometry = new Triangle(this.gl);
    this.program = new Program(this.gl, {
      uniforms: {
        uTime: {
          value: 0
        },
        uTexture: {
          value: texture
        },
        uFlow: this.flowmap.uniform,
        uPaper: {
          value: paper
        }
      },
      vertex: `
        attribute vec2 position;
        attribute vec2 uv;

        varying vec2 vTextureUv;
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          vTextureUv = uv;
          gl_Position = vec4(position, 0., 1.);
        }
      `,
      fragment: `
        precision highp float;

        uniform sampler2D uTexture;
        uniform sampler2D uFlow;
        uniform sampler2D uDithering;
        uniform sampler2D uPaper;
        uniform float uTime;

        varying vec2 vTextureUv;
        varying vec2 vUv;

        //	Simplex 3D Noise 
        //	by Ian McEwan, Ashima Arts
        //
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
      
        float snoise(vec3 v){ 
          const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
          const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      
        // First corner
          vec3 i  = floor(v + dot(v, C.yyy) );
          vec3 x0 =   v - i + dot(i, C.xxx) ;
      
        // Other corners
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min( g.xyz, l.zxy );
          vec3 i2 = max( g.xyz, l.zxy );
      
          //  x0 = x0 - 0. + 0.0 * C 
          vec3 x1 = x0 - i1 + 1.0 * C.xxx;
          vec3 x2 = x0 - i2 + 2.0 * C.xxx;
          vec3 x3 = x0 - 1. + 3.0 * C.xxx;
      
        // Permutations
          i = mod(i, 289.0 ); 
          vec4 p = permute( permute( permute( 
                    i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      
        // Gradients
        // ( N*N points uniformly over a square, mapped onto an octahedron.)
          float n_ = 1.0/7.0; // N=7
          vec3  ns = n_ * D.wyz - D.xzx;
      
          vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)
      
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)
      
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
      
          vec4 b0 = vec4( x.xy, y.xy );
          vec4 b1 = vec4( x.zw, y.zw );
      
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
      
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      
          vec3 p0 = vec3(a0.xy,h.x);
          vec3 p1 = vec3(a0.zw,h.y);
          vec3 p2 = vec3(a1.xy,h.z);
          vec3 p3 = vec3(a1.zw,h.w);
      
        //Normalise gradients
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
      
        // Mix final noise value
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                        dot(p2,x2), dot(p3,x3) ) );
        }
      
          float circle(in vec2 _st, in float _radius){
          vec2 dist = _st-vec2(0.5);
        return 1.-smoothstep(_radius-(_radius*0.01),
                               _radius+(_radius*0.01),
                               dot(dist,dist)*4.0);
      }
      
      #define NUM_OCTAVES 5
      
          float fbm(vec3 x) {
            float v = 0.0;
            float a = 0.5;
            vec3 shift = vec3(100);
            for (int i = 0; i < NUM_OCTAVES; ++i) {
              v += a * snoise(x);
              x = x * 2.0 + shift;
              a *= 0.5;
            }
            return v;
          }

        void main() {


          // R and G values are velocity in the x and y direction
          // B value is the velocity length
          vec3 flow = texture2D(uFlow, vUv).rgb;
          // Use flow to adjust the uv lookup of a texture
          vec2 uv = vTextureUv;
          uv += flow.r * 0.01;

          vec4 distorted = texture2D(uTexture, uv  ) ;
          vec4 tex = texture2D(uTexture, uv);

          float gray = dot(distorted.rgb, vec3(0.299, 0.587, 0.114));
          
          vec3 paper = texture2D(uPaper,vUv).rgb;
          gl_FragColor.rgb = mix( tex.rgb, mix( paper , vec3(gray) * paper, min(1.,flow.r * flow.r * 10.)), min(1.,flow.b * flow.b * 10.));


          gl_FragColor.rgb = mix( tex.rgb, mix( paper , vec3(gray) * paper,min(1.,flow.r * flow.r * 10.)),min(1.,flow.b * flow.b * 10.));
          float bFalloff = step(flow.b, 0.2);
          float rFalloff = step(flow.r, 0.2);

          gl_FragColor.a = 1.0;
        }
      `
    });
    this.mesh = new Mesh(this.gl, {
      geometry: this.geometry,
      program: this.program
    });

    this.lastTime = false;
    this.lastMouse = new Vec2();

    this.onMouseMove = this.onMouseMove.bind(this);
    this.element.addEventListener("mousemove", this.onMouseMove);

    this.onFrame = this.onFrame.bind(this);
    gsap.ticker.add(this.onFrame);
  }

  onMouseMove(e) {
    // if (e.changedTouches && e.changedTouches.length) {
    //   e.x = e.changedTouches[0].offsetX;
    //   e.y = e.changedTouches[0].offsetY;
    // }
    // if (e.x === undefined) {
    // e.x = e.offsetX;
    // e.y = e.offsetY;
    // }

    const x = e.offsetX;
    const y = e.offsetY;

    // Get mouse value in 0 to 1 range, with y flipped
    this.mouse.set(
      x / this.gl.renderer.width,
      1.0 - y / this.gl.renderer.height
    );

    // Calculate velocity
    if (!this.lastTime) {
      // First frame
      this.lastTime = performance.now();
      this.lastMouse.set(x, y);
    }

    const deltaX = x - this.lastMouse.x;
    const deltaY = y - this.lastMouse.y;

    this.lastMouse.set(x, y);

    let time = performance.now();

    // Avoid dividing by 0
    let delta = Math.max(14, time - this.lastTime);
    this.lastTime = time;

    this.velocity.x = deltaX / delta;
    this.velocity.y = deltaY / delta;

    // Flag update to prevent hanging velocity values when not moving
    this.velocity.needsUpdate = true;
  }

  // onLoad() {
  //   this.texture.image = this.image;
  // }

  onFrame(t) {
    // Reset velocity when mouse not moving
    if (!this.velocity.needsUpdate) {
      this.mouse.set(-1);
      this.velocity.set(0);
    }
    this.velocity.needsUpdate = false;

    // Update flowmap inputs
    this.flowmap.aspect = this.aspect;
    this.flowmap.mouse.copy(this.mouse);

    // Ease velocity input, slower when fading out
    this.flowmap.velocity.lerp(this.velocity, this.velocity.len ? 0.5 : 0.1);

    this.flowmap.update();

    this.program.uniforms.uTime.value = t * 0.001;

    this.renderer.render({ scene: this.mesh });
  }
}

export { GLContext, GLImage };
