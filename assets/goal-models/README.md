> Latest interaction contract: each of the 135 stage/persona models now requires ten authored clips: the five lifecycle clips below plus `interact_pat`, `interact_offer`, `interact_play`, `interact_care`, `interact_cheer`. Each interaction must be visibly different and include the matching prop choreography; the player dispatches to that exact clip. Interaction names are stage/theme-specific in `AcademyGoalArt.interactions`. Current model manifest still contains **zero production models**. The procedural leek study was rejected as unlike the original art; use the illustrated atlas as the visual acceptance reference, never approve the geometric study automatically. Full character production remains unfinished; the illustrated interactions are 2.5D and must be labeled as such.

> 2026-10-16 update: `assets/member-leek-3d.js` is an original procedural volume study, available only by choosing the leek 3D study in the companion preview/goal settings. It has real three-dimensional surfaces, lighting, camera orbit, continuous idle and growth, and three scene styles. It is **not approved production character art**, does not fill any manifest entry, and does not make the other eight companions 3D. Keep the illustrated option until appearance is accepted. No test tetrahedron is used in this study.

# True 3D companion assets — not yet supplied

The production manifest is intentionally empty. No test model is shipped as a user character. The fallback remains the existing illustrated scene. A working GLB player does **not** imply the nine characters have been produced or approved.

## Deliverables

Each of immortal, garden, mountain, space, castle, pet, ocean, gem, train needs female, male and neutral personas, each with five growth forms. A form can be a separately authored model (current player contract). All forms must retain recognizable identity, increasing detail, grounded feet and animation continuity. Immortal specifically progresses from scallion to immortal. Use the existing illustrated art as an approved visual reference, not a flat texture plane disguised as a 3D character.

Each GLB must contain a real skinned mesh, bones and authored clips named **enter, idle, interact, evolve, celebrate**. `idle` loops seamlessly; others are finite clips, followed by idle. Author each theme's interaction (watering/nuzzling/flippers/thrust/steam etc.) rather than reusing one whole-body motion. Stage transitions fade out/in while clips blend over 0.35 s. The current player has no automatic topology morphing between different models.

## Technical contract

- glTF 2.0 binary `.glb`, at most 12 MB per stage; all buffers and textures embedded. No external URLs, scripts, audio, Draco or unsupported decoder extensions.
- Model center/front and ground position consistent across growth forms. Camera framing currently normalizes the largest body dimension. Prefer <50k rendered triangles, <60 bones, <=2k textures, <=8 materials per model; verify total scene/frame cost on an actual midrange phone. These are budgets to verify, not claims about absent assets.
- Artist-supplied commercial web distribution license and provenance. Review appearance, anatomy, all five motions, all growth transitions, mobile performance, skin deformation, reduced motion and dark/light scene composition before setting `approved:true`.
- Player: native local Three.js 0.180.0 modules, transparent stage over existing background, PBR lights, contact shadow, damped pointer yaw, AnimationMixer clip crossfade, visible-only rendering, cancellation and GPU resource disposal. WebGL/model failures fall back to illustration.

Manifest entry example (paths are illustrative and do not exist):

```js
window.AcademyCompanionModels={version:1,themes:{immortal:{female:{
  approved:true,
  license:'Commercial web license — author and evidence reference',
  stages:[0,1,2,3,4].map(i=>'assets/goal-models/immortal/female/'+i+'.glb')
}}}};
```

`node scripts/validate_companion_models.cjs` reports mechanical readiness and missing assets. It cannot certify visual/game quality. Browser tests use synthetic skinned geometry solely to verify the GLB load/action/stage/fallback lifecycle; the synthetic asset is never in the production manifest.

References: [Three.js GLTFLoader](https://threejs.org/docs/#GLTFLoader), [AnimationMixer](https://threejs.org/docs/#AnimationMixer). Dependency license/provenance: `../vendor/three-0.180.0/README.md`.
