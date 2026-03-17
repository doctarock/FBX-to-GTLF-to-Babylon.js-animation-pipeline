# FBX → Babylon Animation Pipeline

This document describes the workflow used to convert FBX animation files into reusable Babylon.js animation clips.

The goal of this pipeline is to create a **clean animation library** that can be applied to characters at runtime without bundling animations inside every model.

---

# Overview

The pipeline performs the following steps automatically:

```
FBX animation
     ↓
FBX2glTF conversion
     ↓
GLB model with animation
     ↓
Babylon loads GLB
     ↓
Extract AnimationGroups
     ↓
Serialize animations to JSON
     ↓
Reusable animation library
```

Final output:

```
library.zip
│
├─ converted/
│   ├─ idle.glb
│   ├─ walk.glb
│   └─ talk.glb
│
├─ animations/
│   ├─ idle.anim.json
│   ├─ walk.anim.json
│   └─ talk.anim.json
│
├─ manifest.json
└─ runtime-helper.js
```

---

# Why This Pipeline Exists

FBX files are not directly usable in Babylon.js.

Babylon supports:

```
.glb
.gltf
.babylon
```

FBX must first be converted to GLB.

Additionally, storing animations separately allows:

* smaller model files
* reusable animation libraries
* runtime animation swapping
* easier retargeting

---

# Step 1 — Upload FBX Animations

Animations usually come from tools such as:

* Mixamo
* Meshy
* Blender exports

Example input files:

```
idle.fbx
walk.fbx
run.fbx
talk.fbx
attack.fbx
```

Each FBX normally contains:

```
skeleton
mesh (optional)
animation
```

---

# Step 2 — Convert FBX → GLB

The pipeline uses **FBX2glTF**.

```
fbx2gltf -i input.fbx -o output.glb
```

Result:

```
output.glb
```

The GLB file contains:

```
mesh
skeleton
animation
```

---

# Step 3 — Load GLB in Babylon

Babylon loads the converted GLB:

```javascript
await BABYLON.SceneLoader.AppendAsync("", assetUrl, scene)
```

The scene will now contain:

```
scene.animationGroups[]
```

Each animation group represents a single animation clip.

Example:

```
Idle
Walk
Run
Talk
```

---

# Step 4 — Extract Animation Groups

Each animation group is serialized to JSON.

Correct Babylon API:

```javascript
const data = animationGroup.serialize()
```

Example extractor:

```javascript
for (const group of scene.animationGroups) {

    const json = group.serialize()

    const fileName = group.name + ".anim.json"

}
```

This creates a reusable animation file.

---

# Step 5 — Store Animation Library

Animations are saved to:

```
animations/
   idle.anim.json
   walk.anim.json
   run.anim.json
   talk.anim.json
```

These files contain:

```
targetedAnimations
keyframes
bone targets
frame ranges
```

They are fully compatible with Babylon.

---

# Step 6 — Runtime Usage

Animations can be loaded dynamically.

Example:

```javascript
async function loadAnimation(scene, url) {

    const response = await fetch(url)
    const json = await response.json()

    const group = BABYLON.AnimationGroup.Parse(json, scene)

    return group

}
```

Play animation:

```javascript
const walk = await loadAnimation(scene, "/animations/walk.anim.json")

walk.play(true)
```

---

# Recommended Project Structure

```
game/
│
├─ models/
│   └─ character.glb
│
├─ animations/
│   ├─ idle.anim.json
│   ├─ walk.anim.json
│   ├─ run.anim.json
│   └─ talk.anim.json
│
├─ systems/
│   └─ animationSystem.js
```

---

# Character Animation System Example

```javascript
class CharacterAnimator {

    constructor(scene, skeleton) {

        this.scene = scene
        this.skeleton = skeleton
        this.animations = {}

    }

    async load(name, url) {

        const res = await fetch(url)
        const json = await res.json()

        const group = BABYLON.AnimationGroup.Parse(json, this.scene)

        this.animations[name] = group

    }

    play(name) {

        const anim = this.animations[name]

        if (!anim) return

        anim.play(true)

    }

}
```

Usage:

```javascript
animator.play("walk")
```

---

# Advantages of This System

### Modular animation library

Characters share animations:

```
hero
enemy
npc
```

All can reuse the same clips.

---

### Smaller model sizes

Characters only contain:

```
mesh
skeleton
```

Animations load separately.

---

### Runtime animation swapping

```
idle → walk → run → attack
```

without loading new models.

---

### Easier retargeting

If skeletons match:

```
Mixamo skeleton
```

animations can be reused across all characters.

---

# Common Issues

## Only one animation exported

Some FBX files contain a **single timeline instead of clips**.

Example:

```
0–100 idle
100–200 walk
200–300 run
```

The extractor will see only:

```
Animation
```

Solution:

Split animations in Blender or export them individually.

---

## Animation bones mismatch

Animations require identical bone names.

Example:

```
mixamorig:Hips
mixamorig:Spine
mixamorig:Head
```

If skeletons differ, retargeting is required.

---

# Future Improvements

Potential upgrades to this pipeline:

* automatic Mixamo retargeting
* animation preview viewer
* animation blending test tool
* skeleton compatibility checker
* batch processing for large animation libraries
* automatic animation trimming

---

# Summary

Final automated pipeline:

```
FBX animations
      ↓
FBX2glTF
      ↓
GLB
      ↓
Babylon extraction
      ↓
.anim.json clips
      ↓
Reusable animation library
```

This system allows Babylon projects to manage animations in a **clean, modular, and scalable way**.
