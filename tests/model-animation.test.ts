import { AnimationClip, Group, Object3D, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { ModelAnimation } from '../client/src/components/model-animation.ts';

describe('3D animation controls', () => {
  it('plays, pauses, seeks, changes speed and switches clips without mixing old poses', () => {
    const root = new Group();
    const bone = new Object3D();
    bone.name = 'Bone';
    root.add(bone);
    const clips = [
      new AnimationClip('Walk', 1, [new VectorKeyframeTrack('Bone.position', [0, 1], [0, 0, 0, 10, 0, 0])]),
      new AnimationClip('Run', 1, [new VectorKeyframeTrack('Bone.position', [0, 1], [0, 0, 0, -10, 0, 0])]),
    ];
    const animation = new ModelAnimation(root, clips);
    animation.select(0);
    animation.update(0.25);
    expect(bone.position.x).toBeCloseTo(2.5);
    animation.setPlaying(false);
    animation.update(0.25);
    expect(bone.position.x).toBeCloseTo(2.5);
    animation.seek(0.5);
    expect(bone.position.x).toBeCloseTo(5);
    animation.setPlaying(true);
    animation.setSpeed(2);
    animation.update(0.1);
    expect(bone.position.x).toBeCloseTo(7);
    animation.select(1);
    animation.update(0.1);
    expect(bone.position.x).toBeCloseTo(-2);
    animation.dispose();
    expect(bone.position.x).toBeCloseTo(0);
  });

  it('supports models without animations', () => {
    const animation = new ModelAnimation(new Group(), []);
    animation.select(0);
    animation.seek(10);
    animation.update(1);
    expect(animation.time).toBe(0);
    animation.dispose();
  });
});
