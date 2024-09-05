import { RenderTarget } from "https://unpkg.com/ogl@0.0.74/src/core/RenderTarget.js";
import { Program } from "https://unpkg.com/ogl@0.0.74/src/core/Program.js";
import { Mesh } from "https://unpkg.com/ogl@0.0.74/src/core/Mesh.js";
import { Vec2 } from "https://unpkg.com/ogl@0.0.74/src/math/Vec2.js";
import { Triangle } from "https://unpkg.com/ogl@0.0.74/src/extras/Triangle.js";

//https://oframe.github.io/ogl/examples/?src=mouse-flowmap.html

export class Flowmap {
  constructor(
    gl,
    {
      size = 128, // default size of the render targets
      falloff = 0.3, // size of the stamp, percentage of the size
      alpha = 1, // opacity of the stamp
      dissipation = 0.95, // affects the speed that the stamp fades. Closer to 1 is slower
      type // Pass in gl.FLOAT to force it, defaults to gl.HALF_FLOAT
    } = {}
  ) {
    const _this = this;
    this.gl = gl;

    // output uniform containing render target textures
    this.uniform = { value: null };

    this.mask = {
      read: null,
      write: null,

      // Helper function to ping pong the render targets and update the uniform
      swap: () => {
        let temp = _this.mask.read;
        _this.mask.read = _this.mask.write;
        _this.mask.write = temp;
        _this.uniform.value = _this.mask.read.texture;
      }
    };

    {
      createFBOs();

      this.aspect = 1;
      this.mouse = new Vec2();
      this.velocity = new Vec2();

      this.mesh = initProgram();
    }

    function createFBOs() {
      // Requested type not supported, fall back to half float
      if (!type)
        type =
          gl.HALF_FLOAT ||
          gl.renderer.extensions["OES_texture_half_float"].HALF_FLOAT_OES;

      let minFilter = (() => {
        if (gl.renderer.isWebgl2) return gl.LINEAR;
        if (
          gl.renderer.extensions[
            `OES_texture_${type === gl.FLOAT ? "" : "half_"}float_linear`
          ]
        )
          return gl.LINEAR;
        return gl.NEAREST;
      })();

      const options = {
        width: size,
        height: size,
        type,
        format: gl.RGBA,
        internalFormat: gl.renderer.isWebgl2
          ? type === gl.FLOAT
            ? gl.RGBA32F
            : gl.RGBA16F
          : gl.RGBA,
        minFilter,
        depth: false
      };

      _this.mask.read = new RenderTarget(gl, options);
      _this.mask.write = new RenderTarget(gl, options);
      _this.mask.swap();
    }

    function initProgram() {
      return new Mesh(gl, {
        // Triangle that includes -1 to 1 range for 'position', and 0 to 1 range for 'uv'.
        geometry: new Triangle(gl),

        program: new Program(gl, {
          vertex,
          fragment,
          uniforms: {
            tMap: _this.uniform,

            uFalloff: { value: falloff * 0.5 },
            uAlpha: { value: alpha },
            uDissipation: { value: dissipation },

            // User needs to update these
            uAspect: { value: 1 },
            uMouse: { value: _this.mouse },
            uVelocity: { value: _this.velocity }
          },
          depthTest: false
        })
      });
    }
  }

  update() {
    this.mesh.program.uniforms.uAspect.value = this.aspect;

    this.gl.renderer.render({
      scene: this.mesh,
      target: this.mask.write,
      clear: false
    });
    this.mask.swap();
  }
}

const vertex = /* glsl */ `
    attribute vec2 uv;
    attribute vec2 position;

    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = vec4(position, 0, 1);
    }
`;

const fragment = /* glsl */ `
    precision highp float;

    uniform sampler2D tMap;

    uniform float uFalloff;
    uniform float uAlpha;
    uniform float uDissipation;
    
    uniform float uAspect;
    uniform vec2 uMouse;
    uniform vec2 uVelocity;

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
        vec4 color = texture2D(tMap, vUv) * uDissipation;

        vec2 cursor = vUv - uMouse;
        cursor.x *= uAspect;
        float dist = length(cursor) * 1.-min(0.1,length(uVelocity * 0.005 * uVelocity));
        // float dist = length(cursor);

        

        if(dist + (fbm(vec3(vUv *15.,1.0)) * 0.2 * dist) < 0.1) {
          //float rDist = dist + (fbm(vec3(vUv *15.,1.0)) * 0.2 * dist);
          float falloff = smoothstep(uFalloff, 0.1, dist) * uAlpha;
          color.r=mix(color.r, 1., falloff);
        }

        if(dist + (fbm(vec3(vUv *15.,0.0)) * 0.2 * dist) < 0.125) {

          float falloff = smoothstep(uFalloff, 0.1, dist) * uAlpha;
          color.b=mix(color.b, 1., falloff);
        }

        // float bDist = length((vUv + fbm(vec3(vUv * 20.,0.0)) * 0.1 * dist) - uMouse);
        //   float bFalloff = smoothstep(uFalloff , 0.0, bDist) * uAlpha;
        //   // float rFalloff = step(bDist, uFalloff * 0.85);
        //   color.b=mix(color.b, 1., bFalloff);



        //   float rDist = length((vUv + fbm(vec3(vUv * 20.,0.0)) * 0.1 * dist) - uMouse);
        //   float rFalloff = smoothstep(uFalloff *0.8 , 0.0, rDist) * uAlpha;
        //   // float rFalloff = step(rDist, uFalloff);
        //   color.r=mix(color.r, 1., rFalloff);
        //   //color.b -= color.r;



        gl_FragColor = vec4(color.rgb,1.);
    }
`;
