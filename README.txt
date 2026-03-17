FBX → Babylon One-Shot Pipeline
===============================

What it does
------------
This local web app does the whole pipeline in one run:

1. Upload one or more FBX files
2. Convert each FBX to GLB using FBX2glTF
3. Load each converted GLB in Babylon.js
4. Extract Babylon AnimationGroups as JSON
5. Download a single ZIP containing:
   - manifest.json
   - runtime-helper.js
   - converted/*.glb
   - animations/<source>/<clip>.anim.json

Why it still needs FBX2glTF
---------------------------
Node/Babylon do not directly load FBX in a reliable browser-friendly way. The practical route is:
FBX -> GLB -> Babylon animation extraction

Setup
-----
1. Install Node.js 18+
2. In this folder run:
   npm install

3. Download FBX2glTF:
   https://github.com/facebookincubator/FBX2glTF

4. Put the binary in:
   ./bin/FBX2glTF.exe   (Windows)
   ./bin/FBX2glTF       (Linux/macOS)

   Or set FBX2GLTF_PATH to the binary location.

5. Start:
   npm start

6. Open:
   http://localhost:3080

Notes
-----
- This tool assumes the converted GLB contains Babylon-readable animation groups.
- If an FBX converts but produces no animation groups, it will still include the GLB in the final ZIP and note the issue in manifest.json.
- I could not run FBX2glTF in this environment, so the project structure and flow are prepared but the external converter itself must be supplied on your machine.
