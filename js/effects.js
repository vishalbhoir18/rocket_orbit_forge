// Exhaust smoke, explosions, and rigid-body debris (cannon-es).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

function spriteTexture(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const smokeTexture = () => spriteTexture((ctx, s) => {
  for (let i = 0; i < 14; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.35;
    const y = s / 2 + (Math.random() - 0.5) * s * 0.35;
    const r = s * (0.18 + Math.random() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
});

const fireTexture = () => spriteTexture((ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  g.addColorStop(0.55, 'rgba(255,100,20,0.45)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

const rand = (a, b) => a + Math.random() * (b - a);

export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.smokeTex = smokeTexture();
    this.fireTex = fireTexture();
    this.particles = [];
    this.free = [];
    this.maxParticles = 450;
    this.spawnAcc = 0;

    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.allowSleep = true;
    this.debris = [];
    this.ground = null;

    this.flash = new THREE.PointLight(0xffa050, 0, 0, 2);
    scene.add(this.flash);
    this.flashT = 1;

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  addParticle(parent, pos, vel, o) {
    let p;
    if (this.free.length) {
      p = this.free.pop();
    } else if (this.particles.length >= this.maxParticles) {
      p = this.particles.shift();
      p.sprite.parent?.remove(p.sprite);
    } else {
      p = { sprite: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })), vel: new THREE.Vector3() };
    }
    const mat = p.sprite.material;
    const map = o.fire ? this.fireTex : this.smokeTex;
    if (mat.map !== map) {
      mat.map = map;
      mat.needsUpdate = true;
    }
    mat.blending = o.fire ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.fog = !o.fire;
    mat.color.set(o.color ?? 0xffffff);
    mat.rotation = Math.random() * Math.PI * 2;
    p.sprite.position.copy(pos);
    p.sprite.renderOrder = o.fire ? 3 : 2;
    p.vel.copy(vel);
    p.life = 0;
    p.maxLife = o.life;
    p.size0 = o.size0;
    p.size1 = o.size1;
    p.opacity = o.opacity;
    p.drag = o.drag ?? 0.3;
    p.rise = o.rise ?? null;
    p.sprite.scale.setScalar(o.size0);
    mat.opacity = 0;
    parent.add(p.sprite);
    this.particles.push(p);
    return p;
  }

  /** Exhaust plume. Positions/directions are in the world group's frame. */
  exhaust(base, down, up, tangent, { alt, onPad, throttle, dt, exitR }) {
    if (alt > 38_000) return;
    const rate = (onPad ? 55 : 26) * Math.max(throttle, 0.2);
    this.spawnAcc += rate * dt;
    const altScale = 1 + Math.min(alt / 3000, 4);
    const thin = 1 - alt / 38_000;
    const binormal = this._v2.copy(tangent).cross(up).normalize();
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const pos = this._v.copy(base).addScaledVector(down, onPad ? rand(1, 4) : exitR * 5 + rand(0, 8));
      pos.addScaledVector(tangent, rand(-1, 1)).addScaledVector(binormal, rand(-1, 1));
      const vel = new THREE.Vector3();
      if (onPad) {
        const side = Math.random() < 0.5 ? -1 : 1;
        vel.addScaledVector(binormal, side * rand(18, 48))
          .addScaledVector(up, rand(1, 9))
          .addScaledVector(tangent, rand(-10, 10));
        this.addParticle(this.world, pos, vel, {
          life: rand(6, 11), size0: rand(5, 9), size1: rand(30, 55), opacity: 0.62, drag: 0.55, color: 0xdcdcdc, rise: up,
        });
      } else {
        vel.addScaledVector(down, rand(6, 16)).addScaledVector(tangent, rand(-3, 3)).addScaledVector(binormal, rand(-3, 3));
        this.addParticle(this.world, pos, vel, {
          life: rand(4, 8), size0: rand(4, 8) * altScale, size1: rand(18, 34) * altScale, opacity: 0.5 * thin, drag: 0.25, color: 0xe4e4e4,
        });
      }
    }
  }

  explode(parent, pos, scale = 1) {
    for (let i = 0; i < 22 * scale; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize();
      this.addParticle(parent, pos, dir.multiplyScalar(rand(6, 36) * scale), {
        fire: true, life: rand(0.5, 1.3), size0: rand(3, 7) * scale, size1: rand(12, 26) * scale, opacity: 0.55, drag: 1.6,
      });
    }
    for (let i = 0; i < 20 * scale; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize();
      this.addParticle(parent, pos, dir.multiplyScalar(rand(3, 14) * scale), {
        life: rand(4, 9), size0: rand(8, 14) * scale, size1: rand(40, 70) * scale, opacity: 0.75, drag: 0.6, color: 0x3a3634,
      });
    }
    const wp = parent.localToWorld(pos.clone());
    this.flash.position.copy(wp);
    this.flashScale = scale;
    this.flashT = 0;
  }

  /** Break a rocket model into rigid bodies. Coordinates are scene (view) space. */
  shatter(root, { groundY = null, inheritVel = new THREE.Vector3() } = {}) {
    root.updateMatrixWorld(true);
    let meshes = [];
    root.traverse((o) => {
      if (o.isMesh && !o.userData.noDebris) meshes.push(o);
    });
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const info = meshes.map((m) => {
      m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox);
      box.getSize(size);
      const scl = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      m.matrixWorld.decompose(p, q, scl);
      const s = size.clone().multiply(scl);
      return { m, vol: Math.max(s.x, 0.1) * Math.max(s.y, 0.1) * Math.max(s.z, 0.1), s, q, scl, center: box.getCenter(new THREE.Vector3()) };
    });
    info.sort((a, b) => b.vol - a.vol);
    const chosen = info.slice(0, 45);

    const centroid = new THREE.Vector3();
    for (const c of chosen) centroid.add(c.center.clone().applyMatrix4(c.m.matrixWorld));
    centroid.divideScalar(Math.max(chosen.length, 1));

    if (groundY !== null) {
      this.ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
      this.ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      this.ground.position.set(0, groundY, 0);
      this.physics.addBody(this.ground);
    }

    for (const c of chosen) {
      const wp = c.center.clone().applyMatrix4(c.m.matrixWorld);
      const wrapper = new THREE.Group();
      wrapper.position.copy(wp);
      wrapper.quaternion.copy(c.q);
      const clone = new THREE.Mesh(c.m.geometry, c.m.material);
      clone.scale.copy(c.scl);
      clone.position.copy(c.center).multiply(c.scl).negate();
      wrapper.add(clone);
      this.scene.add(wrapper);

      const half = new CANNON.Vec3(Math.max(c.s.x / 2, 0.08), Math.max(c.s.y / 2, 0.08), Math.max(c.s.z / 2, 0.08));
      const body = new CANNON.Body({
        mass: Math.min(Math.max(c.vol * 40, 5), 3000),
        shape: new CANNON.Box(half),
        linearDamping: 0.08,
        angularDamping: 0.15,
      });
      body.position.set(wp.x, wp.y, wp.z);
      body.quaternion.set(c.q.x, c.q.y, c.q.z, c.q.w);
      const dir = wp.clone().sub(centroid);
      if (dir.lengthSq() < 1e-4) dir.set(rand(-1, 1), rand(0, 1), rand(-1, 1));
      dir.normalize();
      const sp = rand(6, 26);
      body.velocity.set(
        dir.x * sp + inheritVel.x + rand(-4, 4),
        dir.y * sp + inheritVel.y + rand(2, 10),
        dir.z * sp + inheritVel.z + rand(-4, 4),
      );
      body.angularVelocity.set(rand(-5, 5), rand(-5, 5), rand(-5, 5));
      this.physics.addBody(body);
      this.debris.push({ wrapper, body, smoky: Math.random() < 0.45, smokeAcc: 0, age: 0 });
    }
    return centroid;
  }

  debrisCenter(out) {
    if (!this.debris.length) return null;
    out.set(0, 0, 0);
    for (const d of this.debris) out.add(d.wrapper.position);
    return out.divideScalar(this.debris.length);
  }

  update(dt) {
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        p.sprite.parent?.remove(p.sprite);
        this.particles.splice(i, 1);
        this.free.push(p);
        continue;
      }
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      if (p.rise) p.vel.addScaledVector(p.rise, dt * 1.2);
      p.sprite.position.addScaledVector(p.vel, dt);
      const size = p.size0 + (p.size1 - p.size0) * (1 - (1 - t) * (1 - t));
      p.sprite.scale.set(size, size, 1);
      const fadeIn = Math.min(1, t / 0.06);
      p.sprite.material.opacity = p.opacity * fadeIn * Math.pow(1 - t, 1.4);
    }

    // flash
    if (this.flashT < 1) {
      this.flashT += dt / 0.9;
      this.flash.intensity = Math.max(0, 1 - this.flashT) ** 2 * 6e5 * (this.flashScale || 1);
    } else {
      this.flash.intensity = 0;
    }

    // debris
    if (this.debris.length) {
      this.physics.step(1 / 60, dt, 4);
      for (const d of this.debris) {
        d.age += dt;
        d.wrapper.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
        d.wrapper.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
        if (d.smoky && d.age < 6) {
          d.smokeAcc += dt * 14;
          while (d.smokeAcc >= 1) {
            d.smokeAcc -= 1;
            this.addParticle(this.scene, d.wrapper.position, new THREE.Vector3(rand(-1, 1), rand(1, 4), rand(-1, 1)), {
              life: rand(2, 4), size0: 2, size1: rand(8, 16), opacity: 0.55, drag: 0.5, color: 0x2e2b2a,
            });
          }
          if (d.age < 1.8 && Math.random() < 0.4) {
            this.addParticle(this.scene, d.wrapper.position, new THREE.Vector3(), {
              fire: true, life: 0.4, size0: 2, size1: 5, opacity: 0.9, drag: 1,
            });
          }
        }
      }
    }
  }

  clear() {
    for (const p of this.particles) {
      p.sprite.parent?.remove(p.sprite);
      this.free.push(p);
    }
    this.particles.length = 0;
    for (const d of this.debris) {
      this.scene.remove(d.wrapper);
      this.physics.removeBody(d.body);
    }
    this.debris.length = 0;
    if (this.ground) {
      this.physics.removeBody(this.ground);
      this.ground = null;
    }
    this.flash.intensity = 0;
    this.flashT = 1;
  }
}
