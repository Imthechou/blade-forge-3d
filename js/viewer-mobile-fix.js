/* Knife3D · viewer.js — mobile centering hotfix */
(function (global) {
'use strict';
const K3D = (global.K3D = global.K3D || {});
const THREE = global.THREE;
const KNIFE_VIEW_ANGLE_Y = { knife_balisong: 0 };
const DEFAULT_VIEW_ANGLE_Y = 0;

class Viewer {
  constructor(container) {
    this.container = container; this.disposed = false; this.root = null;
    this.modelSize = null; this.fitDistance = 1; this.needsRender = true; this.renderUntil = 0;
    const rect = container.getBoundingClientRect(), w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    this.renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'high-performance' });
    const dprCap = /Mobi|Android|iPhone|iPad/i.test(global.navigator?.userAgent || '') ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, dprCap));
    this.renderer.setSize(w,h,false); this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=.9;
    container.appendChild(this.renderer.domElement);
    this.scene=new THREE.Scene(); this.camera=new THREE.PerspectiveCamera(42,w/h,.01,500); this.camera.position.set(0,.6,3);
    this.pivot=new THREE.Group(); this.scene.add(this.pivot);
    this.controls=new THREE.OrbitControls(this.camera,this.renderer.domElement);
    Object.assign(this.controls,{enableDamping:true,dampingFactor:.08,enablePan:false,rotateSpeed:.85,zoomSpeed:.9,autoRotate:false,autoRotateSpeed:1.6});
    this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};
    this.controls.addEventListener('change',()=>this.invalidate(260)); this.controls.addEventListener('start',()=>this.invalidate(900)); this.controls.addEventListener('end',()=>this.invalidate(260));
    this.keyLight=new THREE.DirectionalLight(0xffffff,1.4); this.keyLight.position.set(2.2,3,2.4); this.scene.add(this.keyLight);
    this.fillLight=new THREE.DirectionalLight(0xd4e0f0,.6); this.fillLight.position.set(-2.4,.6,-2); this.scene.add(this.fillLight);
    this.backLight=new THREE.DirectionalLight(0xffffff,.5); this.backLight.position.set(0,1,-3.5); this.scene.add(this.backLight);
    this.maxAnisotropy=this.renderer.capabilities.getMaxAnisotropy(); this.clock=new THREE.Clock();
    this.renderer.setAnimationLoop(()=>this._render());
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(container); this.resize();
  }
  _applyEnvMapToScene(){ if(!this.envMap)return; this.scene.traverse(o=>{if(!o.isMesh)return; const ms=Array.isArray(o.material)?o.material:[o.material]; ms.forEach(m=>{if(m){m.envMap=this.envMap;m.needsUpdate=true;}});}); }
  async loadEnvironment(url='assets/environment.hdr'){try{let src=url;if(global.location.protocol==='file:'&&global.K3D_INLINE?.hdr)src='data:application/octet-stream;base64,'+global.K3D_INLINE.hdr;const hdr=await new THREE.RGBELoader().loadAsync(src);if(this.disposed)return;hdr.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(this.renderer);this.envMap=pmrem.fromEquirectangular(hdr).texture;this.scene.environment=this.envMap;if('environmentIntensity'in this.scene)this.scene.environmentIntensity=.55;hdr.dispose();pmrem.dispose();this._applyEnvMapToScene();if(this.onEnvMapReady)this.onEnvMapReady(this.envMap);this.needsRender=true;}catch(e){}}
  invalidate(ms=0){this.needsRender=true;if(ms>0)this.renderUntil=Math.max(this.renderUntil,performance.now()+ms);}
  _render(){if(this.disposed)return;if(document.hidden&&!this.needsRender)return;const now=performance.now(),animated=this.controls.autoRotate||now<this.renderUntil;if(!this.needsRender&&!animated)return;this.controls.update();this.renderer.render(this.scene,this.camera);this.needsRender=false;}
  resize(){if(this.disposed)return;const r=this.container.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);if(this.modelSize){const cur=this.camera.position.distanceTo(this.controls.target),was=!this.fitDistance||Math.abs(cur-this.fitDistance)<this.fitDistance*.05;this._computeFit();if(was)this.resetView();}this.invalidate();}
  setModel(root,knifeId){
    this._clearModel();
    if(!root.userData.__viewerBaseTransform)root.userData.__viewerBaseTransform={position:root.position.clone(),quaternion:root.quaternion.clone(),scale:root.scale.clone()};
    const base=root.userData.__viewerBaseTransform;root.position.copy(base.position);root.quaternion.copy(base.quaternion);root.scale.copy(base.scale);
    const rawBox=new THREE.Box3().setFromObject(root),rawSize=rawBox.getSize(new THREE.Vector3());
    const isStage=knifeId==='stage';
    this.pivot.position.set(0,0,0);this.pivot.rotation.set(0,0,0);this.pivot.scale.setScalar(1);
    if(!isStage)this.pivot.rotation.z=Math.PI/2;
    else if(rawSize.x>rawSize.y*1.25&&rawSize.x>=rawSize.z)this.pivot.rotation.z=Math.PI/2;
    this.pivot.add(root);this.pivot.updateMatrixWorld(true);
    let box=new THREE.Box3().setFromObject(this.pivot),center=box.getCenter(new THREE.Vector3());
    this.pivot.position.sub(center);this.pivot.updateMatrixWorld(true);
    box=new THREE.Box3().setFromObject(this.pivot);
    const orientedSize=box.getSize(new THREE.Vector3()),currentHeight=Math.max(orientedSize.y,.0001);
    const targetHeight=isStage?1.15:1.62,uniformScale=targetHeight/currentHeight;
    this.pivot.scale.setScalar(uniformScale);this.pivot.updateMatrixWorld(true);
    box=new THREE.Box3().setFromObject(this.pivot);center=box.getCenter(new THREE.Vector3());
    this.pivot.position.sub(center);this.pivot.updateMatrixWorld(true);
    box=new THREE.Box3().setFromObject(this.pivot);
    this.fitSize=box.getSize(new THREE.Vector3());this.modelSize=rawSize;this.displayScale=uniformScale;
    this._computeFit();this.baseRotation=this.pivot.rotation.clone();this.baseViewAngleY=0;this.root=root;this.resetView();this.needsRender=true;
  }

  _computeFit(){
    const fitSize=this.fitSize||this.modelSize||new THREE.Vector3(1,1,1);
    const halfVFov=THREE.MathUtils.degToRad(this.camera.fov/2);
    const aspect=Math.max(.2,this.camera.aspect);
    const halfHFov=Math.atan(Math.tan(halfVFov)*aspect);
    const distV=(fitSize.y/2)/Math.tan(halfVFov);
    const distH=(fitSize.x/2)/Math.tan(halfHFov);
    // Mobile stage models can be deep (ore/ingot shapes). Fit against the
    // bounding sphere as well, otherwise the front/back can be clipped even
    // when X/Y appear to fit.
    const radius=fitSize.length()/2;
    const distDepth=radius/Math.sin(Math.min(halfVFov,halfHFov));
    this.fitDistance=Math.max(distV,distH,distDepth)*1.12;
    const depth=Math.max(fitSize.x,fitSize.y,fitSize.z,.05);
    this.camera.near=Math.max(depth*.005,.001);
    this.camera.far=Math.max(depth*60,10);
    this.camera.updateProjectionMatrix();
    this.controls.minDistance=this.fitDistance*.35;
    this.controls.maxDistance=this.fitDistance*3;
  }

  resetView(){if(!this.fitDistance)return;if(this.baseRotation)this.pivot.rotation.copy(this.baseRotation);else this.pivot.rotation.set(0,this.pivot.rotation.y,0);this.camera.position.set(0,0,-this.fitDistance);this.controls.target.set(0,0,0);this.controls.update();this.invalidate();}

  setAutoRotate(on){this.controls.autoRotate=!!on;this.invalidate();}
  setExposure(v){this.renderer.toneMappingExposure=Math.min(2.5,Math.max(.3,v));this.invalidate();}
  snapshot(w=160,h=120){const oldSize=new THREE.Vector2();this.renderer.getSize(oldSize);const oldPR=this.renderer.getPixelRatio();this.renderer.setPixelRatio(1);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);const url=this.renderer.domElement.toDataURL('image/webp',.8);this.renderer.setPixelRatio(oldPR);this.renderer.setSize(oldSize.x,oldSize.y,false);this.camera.aspect=oldSize.x/Math.max(1,oldSize.y);this.camera.updateProjectionMatrix();this.needsRender=true;return url;}
  _clearModel(){if(this.root){this.pivot.remove(this.root);if(!this.root.userData?.k3dEngineOwned)this._disposeObject(this.root);this.root=null;}}
  _disposeObject(obj){obj.traverse(c=>{if(c.isMesh){c.geometry&&c.geometry.dispose();const ms=Array.isArray(c.material)?c.material:[c.material];ms.forEach(m=>m&&m.dispose());}});}
  dispose(){this.disposed=true;this.renderer.setAnimationLoop(null);this.resizeObserver&&this.resizeObserver.disconnect();this._clearModel();this.envMap&&this.envMap.dispose();this.controls&&this.controls.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
K3D.Viewer=Viewer;
if(typeof module!=='undefined'&&module.exports)module.exports={Viewer};
})(typeof window!=='undefined'?window:globalThis);
