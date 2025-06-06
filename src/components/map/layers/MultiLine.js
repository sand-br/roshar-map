import { AdditiveBlending, BufferAttribute, Group, Mesh, PlaneBufferGeometry, ShaderMaterial, Vector2, Vector3 } from 'three'

export default class MultiLine extends Group {
  constructor (points) {
    super()
    this.name = 'line'

    this.frustumCulled = false

    let totalLength = 0
    for (let i = 0; i < points.length - 1; i++) {
      totalLength += new Vector2(points[i].x - points[i + 1].x, points[i].y - points[i + 1].y).length()
    }

    this.init(points, totalLength)
  }

  init (points, totalLength) {
    const mat = new ShaderMaterial({
      // language=GLSL
      vertexShader: `
        varying vec2 vUv;

        uniform float Size;
        uniform float Scale;

        void main() {
          vUv = uv;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      // language=GLSL
      fragmentShader: `
        #ifdef GL_ES
        precision highp float;
        #endif
        
        #define PI 3.141592653

        uniform float Length;
        uniform float Frequency;
        uniform float TemporalFrequency;
        uniform float Opacity;
        uniform float Bias;
        uniform float Amplitude;
        uniform float InnerRingThickness;
        uniform float Time;
        uniform float Brightness;
        uniform float WhitePoint;
        uniform float Seed;
        uniform vec3 Color;

        varying vec2 vUv;

        float simplexNoise(vec3 uv, float res)
        {
          const vec3 s = vec3(1e0, 1e2, 1e3);

          uv *= res;

          vec3 uv0 = floor(mod(uv, res))*s;
          vec3 uv1 = floor(mod(uv+vec3(1.), res))*s;

          vec3 f = fract(uv);
          f = f*f*(3.-2.*f);

          vec4 v = vec4(uv0.x+uv0.y+uv0.z, uv1.x+uv0.y+uv0.z,
          uv0.x+uv1.y+uv0.z, uv1.x+uv1.y+uv0.z);

          vec4 r = fract(sin(v*1e-1)*1e3);
          float r0 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);

          r = fract(sin((v + uv1.z - uv0.z)*1e-1)*1e3);
          float r1 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);

          return mix(r0, r1, f.z)*2.-1.;
        }

        vec4 stormlight(in vec2 p)
        {
          float l = abs(p.y);
          float a = (1. - l) * 3.;

          float glowRange = 50. / Length;
          float glowParam = fract(vUv.x - Time * 0.01 * sqrt(Length));
          a += 0.8 * sin((1. - smoothstep(.0, glowRange, glowParam)) * PI);

          //make sure to not clip the quad
          a -= Bias;

          vec3 coord = vec3(p.x, p.y * .2, .5);
          float power = 1.;
          float t = Time * TemporalFrequency + Seed * 200.;
          for (int i = 1; i <= 3; i++)
          {
            power *= 2.;
            a += simplexNoise(coord + vec3(0., -t, t*.2), power * Frequency) / power;
          }
          a = max(a * Amplitude, 0.);

          //bright ring around dimmed ring
          float d3 = 0.02;
          float d2 = InnerRingThickness;
          a += smoothstep(d3, 0., l - d2) * 0.25;

          a *= Brightness;

          vec3 c = Color;

          //bright is white
          c = mix(c, vec3(1, 1, 1), smoothstep(1., WhitePoint, a));
          return vec4(c, a);
        }

        void main(void) {
          vec4 c = stormlight(vUv * 2. - 1.);
          c.a *= smoothstep(0., 5. / Length, vUv.x) * smoothstep(1., 1. - 5. / Length, vUv.x) * smoothstep(0., vUv.x, Opacity);
          c.rgb *= c.a;
          gl_FragColor = c;
        }
      `,
      uniforms: {
        Time: { value: 0 },
        Length: { value: totalLength },
        Opacity: { value: 1 },
        Frequency: { value: 4 },
        TemporalFrequency: { value: 0.25 },
        Bias: { value: 0.4 },
        Amplitude: { value: 0.6 },
        InnerRingThickness: { value: 0.1 },
        Brightness: { value: 1 },
        WhitePoint: { value: 3 },
        Color: { value: new Vector3(23 / 255, 98 / 255, 15 / 255) },
        Seed: { value: totalLength }
      },
      depthTest: false,
      premultipliedAlpha: true,
      transparent: true,
      blending: AdditiveBlending
    })

    let progress = 0
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i]
      const end = points[i + 1]
      const ref = new Vector2()
      ref.subVectors(end, start)
      const geo = new PlaneBufferGeometry(ref.length(), 10, 1, 1)
      const contribution = ref.length() / totalLength
      geo.setAttribute(
        'uv',
        new BufferAttribute(new Float32Array([progress, 1.0, progress + contribution, 1.0, progress, 0.0, progress + contribution, 0.0]), 2)
      )
      const plane = new Mesh(geo, mat)
      plane.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, 1)
      plane.rotation.set(0, 0, ref.angle())
      plane.frustumCulled = false
      progress += contribution

      this.add(plane)
    }
  }

  update (camera, timestamp) {
    this.children.forEach((plane) => {
      plane.material.uniforms.Time.value = timestamp / 1000
    })
  }
}
