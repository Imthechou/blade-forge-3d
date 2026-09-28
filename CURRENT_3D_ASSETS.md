# Current 3D Asset Authority

The current game contains exactly these 12 knife GLB assets:

1. 蝴蝶刀 — `knife_balisong.glb`
2. 刺刀 — `knife_bayonet.glb`
3. 折叠刀 — `knife_folding.glb`
4. 短剑 — `knife_gladius.glb`
5. 爪子刀 — `knife_karambit.glb`
6. 马来剑 — `knife_kris.glb`
7. 开山刀 — `knife_machete.glb`
8. 弯刀 — `knife_saber.glb`
9. 骷髅匕首 — `knife_skull.glb`
10. 直刀 — `knife_straight.glb`
11. 求生匕首 — `knife_survival.glb`
12. 唐刀 — `knife_tangdao.glb`

Historical / planned knife names that do not have a current GLB are not valid runtime model choices. The game must use `BLADE_TYPES_3D` as the authoritative model list.

The Pages deployment includes a runtime cleanup guard that remaps stale card blade IDs to the closest existing model and exposes `window.__BLADE_ASSET_AUDIT__` for QA.
