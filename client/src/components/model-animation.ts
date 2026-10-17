import { AnimationMixer, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';

/** Keeps animation controls independent of camera rotation and rendering. */
export class ModelAnimation {
  readonly mixer: AnimationMixer;
  private action?: AnimationAction;
  private playing = true;

  constructor(private root: Object3D, readonly clips: AnimationClip[]) {
    this.mixer = new AnimationMixer(root);
  }

  select(index: number) {
    this.mixer.stopAllAction();
    const clip = this.clips[index];
    this.action = clip ? this.mixer.clipAction(clip).reset().setLoop(LoopRepeat, Infinity).play() : undefined;
    if (this.action) this.action.paused = !this.playing;
    this.mixer.update(0);
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    if (this.action) this.action.paused = !playing;
  }

  setSpeed(speed: number) { this.mixer.timeScale = speed; }
  get time() { return this.action?.time ?? 0; }

  seek(time: number) {
    if (!this.action) return;
    this.action.time = Math.max(0, Math.min(time, this.action.getClip().duration));
    this.mixer.update(0);
  }

  update(delta: number) { this.mixer.update(delta); }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
