/* Blade Forge mobile 3D hotfix — model visibility + stage framing. */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const K3D = global.K3D;
  if (!THREE || !K3D) return;

  // BladeMask / BladeSkin hooks in this build use GLSL1 syntax
  // (attribute / texture2D). Force converted knife materials to GLSL1
  // so iOS/WebGL2 does not compile the injected shader as GLSL3.
  if (K3D.material && typeof K3D.material.toPhysicalMaterial === 'function') {
    const originalToPhysical = K3D.material.toPhysicalMaterial;
    if (!originalToPhysical.__bladeForgeHotfix) {
      const wrapped = function (original) {
        const m = originalToPhysical.call(this, original);
        if (THREE.GLSL1) m.glslVersion = THREE.GLSL1;
        return m;
      };
      wrapped.__bladeForgeHotfix = true;
      K3D.material.toPhysicalMaterial = wrapped;
    }
  }

  // Stage props were being framed too tightly on mobile.
  if (K3D.Viewer && K3D.Viewer.prototype && !K3D.Viewer.prototype.__bladeForgeHotfix) {
    const originalSetModel = K3D.Viewer.prototype.setModel;
    K3D.Viewer.prototype.setModel = function (root, id) {
      originalSetModel.call(this, root, id);
      if (id === 'stage' && this.pivot && this.modelSize) {
        const scale = 0.68;
        this.pivot.scale.setScalar(scale);
        this.modelSize.multiplyScalar(scale);
        if (this.fitSize) this.fitSize.multiplyScalar(scale);
        this._computeFit();
        this.resetView();
      }
    };
    K3D.Viewer.prototype.__bladeForgeHotfix = true;
  }
})(window);
