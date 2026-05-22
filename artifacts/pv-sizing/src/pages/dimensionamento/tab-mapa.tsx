import { useCallback, useEffect, useRef, useState } from "react";
import { useMapa } from "@/contexts/MapaContext";
import { usePanelCtx } from "@/contexts/PanelContext";
import { useSolar } from "@/contexts/SolarContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Maximize2,
  Minimize2,
  MousePointer2,
  Grid2x2,
  PencilLine,
  Trash2,
  RotateCcw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────── MAP HTML ─────────────── */
const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;height:100%;overflow:hidden;background:#0D2B45;}
#map{width:100%;height:100%;cursor:crosshair;}
#map.mode-auto{cursor:default;}
#map.mode-select{cursor:pointer;}
#toolbar{
  position:absolute;top:8px;left:50%;transform:translateX(-50%);
  display:flex;gap:4px;z-index:1001;background:rgba(13,43,69,0.93);
  border:1px solid rgba(245,166,35,0.4);border-radius:10px;padding:4px;
}
.tb-btn{
  display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;
  border:none;cursor:pointer;font-size:11px;font-family:-apple-system,sans-serif;
  font-weight:600;color:#94A3B8;background:transparent;transition:all .15s;
  white-space:nowrap;
}
.tb-btn:hover{background:rgba(255,255,255,0.08);color:#fff;}
.tb-btn.active{background:rgba(30,136,229,0.8);color:#fff;}
.tb-btn.danger{color:#FCA5A5;}
.tb-btn.danger:hover{background:rgba(239,68,68,0.3);color:#fff;}
.tb-sep{width:1px;background:rgba(255,255,255,0.15);margin:2px 2px;}
.info-bar{
  position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
  background:rgba(13,43,69,0.92);color:#fff;padding:5px 14px;
  border-radius:14px;font-family:-apple-system,sans-serif;font-size:11px;
  z-index:1000;pointer-events:none;white-space:nowrap;max-width:90%;
  border:1px solid rgba(245,166,35,0.4);overflow:hidden;text-overflow:ellipsis;
}
.mount-badge{
  position:absolute;bottom:38px;left:50%;transform:translateX(-50%);
  background:rgba(13,43,69,0.88);color:#F5A623;padding:3px 10px;
  border-radius:10px;font-family:-apple-system,sans-serif;font-size:10px;
  z-index:1000;pointer-events:none;border:1px solid rgba(245,166,35,0.3);
}
.nudge-pad{
  position:absolute;bottom:70px;left:8px;z-index:1001;
  display:grid;grid-template-columns:repeat(3,30px);grid-template-rows:repeat(3,30px);gap:2px;
}
.move-pad{
  position:absolute;bottom:70px;left:108px;z-index:1001;
  display:grid;grid-template-columns:repeat(3,30px);grid-template-rows:repeat(3,30px);gap:2px;
}
.nudge-btn{
  background:rgba(13,43,69,0.88);color:#F5A623;border:1px solid rgba(245,166,35,0.5);
  border-radius:6px;font-size:13px;cursor:pointer;display:flex;align-items:center;
  justify-content:center;width:30px;height:30px;font-family:-apple-system,sans-serif;
  user-select:none;touch-action:manipulation;transition:background .1s;
}
.nudge-btn:active,.nudge-btn:hover{background:rgba(30,136,229,0.7);}
.nudge-reset{font-size:10px;color:#fff;}
#compassBox{
  position:absolute;right:8px;bottom:120px;z-index:1001;text-align:center;pointer-events:none;
}
#compassLabel{
  background:rgba(13,43,69,0.93);color:#F5A623;font-size:9px;
  font-family:-apple-system,sans-serif;border-radius:5px;padding:2px 7px;margin-top:2px;
  border:1px solid rgba(245,166,35,0.45);white-space:nowrap;
}
.sel-hint{
  position:absolute;top:50px;left:50%;transform:translateX(-50%);
  background:rgba(245,166,35,0.15);border:1px solid rgba(245,166,35,0.5);
  color:#F5A623;padding:6px 14px;border-radius:8px;font-size:11px;
  font-family:-apple-system,sans-serif;z-index:1001;pointer-events:none;
  animation:fadeIn .3s ease;
}
@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(-4px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
</style>
</head>
<body>
<div id="map" class="mode-auto"></div>
<div id="toolbar">
  <button class="tb-btn" id="btn-auto" onclick="setMode('auto')" title="Preenchimento automático da área">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    Auto
  </button>
  <button class="tb-btn" id="btn-manual" onclick="setMode('manual')" title="Clique para colocar painéis">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M2 12h20"/></svg>
    Manual
  </button>
  <button class="tb-btn" id="btn-select" onclick="setMode('select')" title="Selecionar e mover painéis">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4l6 18 3-7 7-3L4 4z"/></svg>
    Seleção
  </button>
  <div class="tb-sep"></div>
  <button class="tb-btn danger" id="btn-clear-manual" onclick="clearManual()" title="Apagar painéis manuais">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
    Limpar
  </button>
  <div class="tb-sep"></div>
  <button class="tb-btn" id="btn-fs" onclick="toggleFullscreen()" title="Ecrã inteiro">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
  </button>
</div>
<div id="info" class="info-bar">📐 Desenhe a área do telhado com a ferramenta de polígono</div>
<div id="mountBadge" class="mount-badge">▲ Estrutura Triângulos</div>
<div id="compassBox">
  <svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
    <circle cx="26" cy="26" r="24" fill="rgba(13,43,69,0.93)" stroke="rgba(245,166,35,0.55)" stroke-width="1.5"/>
    <text x="26" y="13" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="7.5" font-family="-apple-system">N</text>
    <text x="26" y="46" text-anchor="middle" fill="#F5A623" font-size="7.5" font-weight="bold" font-family="-apple-system">S</text>
    <text x="8" y="30" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="7" font-family="-apple-system">O</text>
    <text x="44" y="30" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="7" font-family="-apple-system">E</text>
    <g id="compassArrow" transform="rotate(0,26,26)">
      <polygon points="26,6 29.5,24 26,21 22.5,24" fill="#F5A623" opacity="0.95"/>
      <polygon points="26,46 29.5,28 26,31 22.5,28" fill="rgba(255,255,255,0.3)"/>
    </g>
  </svg>
  <div id="compassLabel">Sul · ideal</div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
// ── Config ──────────────────────────────────────────────────────────
var cfg={panelW:1.13,panelH:2.28,panelProjDepth:1.974,rowSpacing:4.132,
         mountType:"triangulos",powerWp:400,maxPanels:0,azimuth:180};
var gridOffset={lat:0,lng:0};
var moveDeltaLat=0.5/111000,moveDeltaLng=0.5/80000;
var currentMode="auto";
var currentPolygon=null;
var manualPanelsList=[]; // {id, latlngs, layer}
var selectedPanel=null;
var nextId=1;

// ── Leaflet ──────────────────────────────────────────────────────────
var map=L.map("map",{
  zoomControl:true,maxZoom:24,minZoom:2,
  zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:80
}).setView([39.5,-8.0],7);

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {attribution:"Esri",maxZoom:24,maxNativeZoom:19}).addTo(map);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  {attribution:"Esri",maxZoom:24,maxNativeZoom:19,opacity:0.85}).addTo(map);

// Invalidate on resize
var resizeObs=new ResizeObserver(function(){map.invalidateSize({animate:false});});
resizeObs.observe(document.getElementById("map"));

// ── Layers ───────────────────────────────────────────────────────────
var drawnItems=new L.FeatureGroup().addTo(map);
var panelLayer=new L.FeatureGroup().addTo(map);
var manualLayer=new L.FeatureGroup().addTo(map);

var drawControl=new L.Control.Draw({
  edit:{featureGroup:drawnItems},
  draw:{
    polygon:{shapeOptions:{color:"#F5A623",fillColor:"rgba(245,166,35,0.1)",fillOpacity:0.3,weight:2}},
    polyline:false,rectangle:false,circle:false,circlemarker:false,marker:false
  }
}).addTo(map);

// ── Mode management ──────────────────────────────────────────────────
function setMode(m){
  currentMode=m;
  ["auto","manual","select"].forEach(function(k){
    var el=document.getElementById("btn-"+k);
    if(el) el.classList.toggle("active",k===m);
  });
  document.getElementById("map").className="mode-"+m;
  if(m==="select"){
    var hint=document.createElement("div");
    hint.className="sel-hint";
    hint.id="sel-hint";
    hint.textContent="Clique num painel para selecionar · Delete / Backspace para apagar";
    document.body.appendChild(hint);
    setTimeout(function(){var h=document.getElementById("sel-hint");if(h)h.remove();},3000);
  }else{
    var h=document.getElementById("sel-hint");if(h)h.remove();
    deselectAll();
  }
  if(m==="auto"&&currentPolygon) fillPanels();
}
document.addEventListener("keydown",function(e){
  if((e.key==="Delete"||e.key==="Backspace")&&selectedPanel!==null){
    e.preventDefault();deleteSelected();
  }
});

// ── Draw events ──────────────────────────────────────────────────────
map.on(L.Draw.Event.CREATED,function(e){
  drawnItems.clearLayers();panelLayer.clearLayers();currentPolygon=null;
  currentPolygon=e.layer;drawnItems.addLayer(currentPolygon);
  gridOffset={lat:0,lng:0};
  if(currentMode==="auto") fillPanels();
  else emitResults();
});
map.on(L.Draw.Event.EDITED,function(){
  panelLayer.clearLayers();currentPolygon=null;
  drawnItems.eachLayer(function(l){currentPolygon=l;});
  if(currentPolygon&&currentMode==="auto") fillPanels();
});
map.on(L.Draw.Event.DELETED,function(){
  panelLayer.clearLayers();currentPolygon=null;
  document.getElementById("info").textContent="📐 Desenhe a área do telhado";
  window.parent.postMessage(JSON.stringify({type:"roofCleared"}),"*");
});

// ── Manual click-to-place ─────────────────────────────────────────────
map.on("click",function(e){
  if(currentMode==="manual"){
    if(!currentPolygon)return;
    var ll=e.latlng;
    var poly=currentPolygon.getLatLngs()[0];
    if(!isPointInPolygon([ll.lat,ll.lng],poly.map(function(p){return[p.lat,p.lng];})))return;
    placeManualPanel(ll.lat,ll.lng);
    emitResults();
  }
});

function placeManualPanel(lat,lng){
  var az=cfg.azimuth,azPerp=(az+90)%360;
  var isCoplanar=cfg.mountType==="coplanar";
  var footprintAlong=isCoplanar?cfg.panelH:cfg.panelProjDepth;
  var c0=destPoint(lat,lng,az,-footprintAlong/2);
  var c1=destPoint(c0[0],c0[1],azPerp,-cfg.panelW/2);
  var c2=destPoint(c1[0],c1[1],azPerp,cfg.panelW);
  var c3=destPoint(c0[0],c0[1],az,footprintAlong);
  var c4=destPoint(c3[0],c3[1],azPerp,-cfg.panelW/2);
  var c5=destPoint(c4[0],c4[1],azPerp,cfg.panelW);
  var corners=[L.latLng(c1),L.latLng(c2),L.latLng(c5),L.latLng(c4)];
  var fillColor=isCoplanar?"#3B82F6":"#1E88E5";
  var id=nextId++;
  var layer=L.polygon(corners,{
    color:"#1565C0",fillColor:fillColor,fillOpacity:0.7,weight:1.5,interactive:true
  }).addTo(manualLayer);
  layer.on("click",function(ev){
    L.DomEvent.stopPropagation(ev);
    if(currentMode==="select") selectPanel(id);
  });
  manualPanelsList.push({id:id,corners:corners,layer:layer,lat:lat,lng:lng});
}

function selectPanel(id){
  deselectAll();
  selectedPanel=id;
  var item=manualPanelsList.find(function(p){return p.id===id;});
  if(item) item.layer.setStyle({color:"#F5A623",weight:2.5,fillOpacity:0.85});
}
function deselectAll(){
  selectedPanel=null;
  manualPanelsList.forEach(function(p){
    p.layer.setStyle({color:"#1565C0",weight:1.5,fillOpacity:0.7});
  });
}
function deleteSelected(){
  if(selectedPanel===null)return;
  var idx=manualPanelsList.findIndex(function(p){return p.id===selectedPanel;});
  if(idx===-1)return;
  manualLayer.removeLayer(manualPanelsList[idx].layer);
  manualPanelsList.splice(idx,1);
  selectedPanel=null;
  emitResults();
}
function clearManual(){
  manualPanelsList.forEach(function(p){manualLayer.removeLayer(p.layer);});
  manualPanelsList=[];selectedPanel=null;
  emitResults();
}

// Keyboard move selected panel
document.addEventListener("keydown",function(e){
  if(selectedPanel===null||currentMode!=="select")return;
  var step={ArrowUp:moveDeltaLat*5,ArrowDown:-moveDeltaLat*5,ArrowLeft:-moveDeltaLng*5,ArrowRight:moveDeltaLng*5};
  var dLat=0,dLng=0;
  if(e.key==="ArrowUp")dLat=moveDeltaLat*5;
  else if(e.key==="ArrowDown")dLat=-moveDeltaLat*5;
  else if(e.key==="ArrowLeft")dLng=-moveDeltaLng*5;
  else if(e.key==="ArrowRight")dLng=moveDeltaLng*5;
  else return;
  e.preventDefault();
  var item=manualPanelsList.find(function(p){return p.id===selectedPanel;});
  if(!item)return;
  item.lat+=dLat;item.lng+=dLng;
  var newCorners=item.corners.map(function(c){return L.latLng(c.lat+dLat,c.lng+dLng);});
  item.corners=newCorners;
  item.layer.setLatLngs(newCorners);
  emitResults();
});

// ── Auto-fill ─────────────────────────────────────────────────────────
function fillPanels(){
  if(!currentPolygon)return;
  panelLayer.clearLayers();
  var latlngs=currentPolygon.getLatLngs()[0];
  var bounds=currentPolygon.getBounds();
  var boundsCenter=bounds.getCenter();
  var center=L.latLng(boundsCenter.lat+gridOffset.lat,boundsCenter.lng+gridOffset.lng);
  var nw=L.latLng(bounds.getNorth(),bounds.getWest());
  var ne=L.latLng(bounds.getNorth(),bounds.getEast());
  var sw=L.latLng(bounds.getSouth(),bounds.getWest());
  var boundsW=nw.distanceTo(ne);
  var boundsH=nw.distanceTo(sw);
  var az=cfg.azimuth,azPerp=(az+90)%360;
  var isCoplanar=cfg.mountType==="coplanar";
  var footprintAlong=isCoplanar?cfg.panelH:cfg.panelProjDepth;
  var stepAlong=isCoplanar?(cfg.panelH+0.02):cfg.rowSpacing;
  var stepAcross=cfg.panelW+0.05;
  var spanAlong=boundsH*1.6,spanAcross=boundsW*1.6;
  var nAlong=Math.ceil(spanAlong/stepAlong)+2;
  var nAcross=Math.ceil(spanAcross/stepAcross)+2;
  var count=0,panels=[];
  for(var i=-nAlong;i<nAlong;i++){
    for(var j=-nAcross;j<nAcross;j++){
      var distAlong=i*stepAlong,distAcross=j*stepAcross;
      var tmp=destPoint(center.lat,center.lng,az,distAlong);
      var pc=destPoint(tmp[0],tmp[1],azPerp,distAcross);
      var c0=destPoint(pc[0],pc[1],az,-footprintAlong/2);
      var c1=destPoint(c0[0],c0[1],azPerp,-cfg.panelW/2);
      var c2=destPoint(c1[0],c1[1],azPerp,cfg.panelW);
      var c3=destPoint(c0[0],c0[1],az,footprintAlong);
      var c4=destPoint(c3[0],c3[1],azPerp,-cfg.panelW/2);
      var c5=destPoint(c4[0],c4[1],azPerp,cfg.panelW);
      var corners=[L.latLng(c1),L.latLng(c2),L.latLng(c5),L.latLng(c4)];
      var polyCoords=latlngs.map(function(ll){return[ll.lat,ll.lng];});
      if(corners.every(function(pt){return isPointInPolygon([pt.lat,pt.lng],polyCoords);})){
        if(cfg.maxPanels>0&&count>=cfg.maxPanels)continue;
        panels.push(corners);count++;
      }
    }
  }
  var fillColor=isCoplanar?"#3B82F6":"#1E88E5";
  panels.forEach(function(corners){
    L.polygon(corners,{color:isCoplanar?"#1D4ED8":"#1565C0",
      fillColor:fillColor,fillOpacity:isCoplanar?0.55:0.65,weight:1,interactive:false}).addTo(panelLayer);
  });
  emitResults(count,panels,boundsW,boundsH);
  // Map capture
  if(typeof html2canvas!=="undefined"&&panels.length>0){
    setTimeout(function(){
      html2canvas(document.getElementById("map"),{useCORS:true,allowTaint:false,scale:0.6,
        logging:false,imageTimeout:8000,backgroundColor:"#0D2B45"}).then(function(canvas){
        window.parent.postMessage(JSON.stringify({type:"mapCapture",imageDataUrl:canvas.toDataURL("image/jpeg",0.8)}),"*");
      }).catch(function(){});
    },2000);
  }
}

function emitResults(autoCount,autoPanels,boundsW,boundsH){
  if(!currentPolygon)return;
  var manualCount=manualPanelsList.length;
  var totalCount=(autoCount||0)+manualCount;
  var latlngs=currentPolygon.getLatLngs()[0];
  var roofArea=boundsW&&boundsH?Math.round(boundsW*boundsH):0;
  var az=cfg.azimuth;
  var dev=Math.min(Math.abs(az-180),360-Math.abs(az-180));
  var label=azLabel(az);
  var devText=dev<2?"Sul · ideal":label+" · "+Math.round(dev)+"° de Sul";
  var totalKwp=(totalCount*cfg.powerWp)/1000;
  var factor=orientationFactor(az);
  var adjKwp=totalKwp*factor;
  var typeLabel=cfg.mountType==="coplanar"?"▬ Coplan.":"▲ Triâng.";
  updateCompass(az);
  document.getElementById("info").textContent=
    typeLabel+" · "+totalCount+" painéis · "+totalKwp.toFixed(2)+" kWp · "+devText+
    (manualCount>0?" ("+autoCount+" auto + "+manualCount+" manual)":"");
  window.parent.postMessage(JSON.stringify({
    type:"roofMeasured",roofArea:roofArea,panelCount:totalCount,
    totalKwp:totalKwp,adjKwp:adjKwp,azimuth:az,orientationLabel:devText,
    penaltyPct:Math.round((1-factor)*100),panelW:cfg.panelW,panelH:cfg.panelH,
    powerWp:cfg.powerWp,mountType:cfg.mountType,
    roofBoundsW:Math.round(boundsW||0),roofBoundsH:Math.round(boundsH||0),
    autoCount:autoCount||0,manualCount:manualCount
  }),"*");
}

// ── Helpers ───────────────────────────────────────────────────────────
function toRad(d){return d*Math.PI/180;}
function toDeg(r){return r*180/Math.PI;}
function destPoint(lat,lng,az,dist){
  var R=6371000,la=toRad(lat),lo=toRad(lng),a=toRad(az),d=dist/R;
  var la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(a));
  var lo2=lo+Math.atan2(Math.sin(a)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2));
  return[toDeg(la2),toDeg(lo2)];
}
function isPointInPolygon(point,polygon){
  var x=point[0],y=point[1],inside=false;
  for(var i=0,j=polygon.length-1;i<polygon.length;j=i++){
    var xi=polygon[i][0],yi=polygon[i][1],xj=polygon[j][0],yj=polygon[j][1];
    if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
function azLabel(az){
  if(az>=337.5||az<22.5)return"N";if(az<67.5)return"NE";if(az<112.5)return"E";
  if(az<157.5)return"SE";if(az<202.5)return"S";if(az<247.5)return"SO";
  if(az<292.5)return"O";return"NO";
}
function orientationFactor(az){
  var dev=Math.min(Math.abs(az-180),360-Math.abs(az-180));
  var pts=[[0,1.00],[45,0.95],[90,0.80],[135,0.63],[180,0.56]];
  for(var i=0;i<pts.length-1;i++){
    if(dev<=pts[i+1][0])return pts[i][1]+(pts[i+1][1]-pts[i][1])*((dev-pts[i][0])/(pts[i+1][0]-pts[i][0]));
  }
  return 0.56;
}
function updateCompass(az){
  var dev=Math.min(Math.abs(az-180),360-Math.abs(az-180));
  document.getElementById("compassArrow").setAttribute("transform","rotate("+(az-180)+",26,26)");
  document.getElementById("compassLabel").textContent=dev<2?"Sul · ideal":azLabel(az)+" · "+Math.round(dev)+"° de Sul";
}
function updateMountBadge(){
  var el=document.getElementById("mountBadge");
  if(cfg.mountType==="coplanar"){el.textContent="▬ Telhado Coplanar";el.style.color="#60A5FA";}
  else{el.textContent="▲ Estrutura Triângulos";el.style.color="#F5A623";}
}
function toggleFullscreen(){
  if(!document.fullscreenElement){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}
  else{document.exitFullscreen&&document.exitFullscreen();}
}
document.addEventListener("fullscreenchange",function(){
  setTimeout(function(){map.invalidateSize({animate:false});},100);
});

// ── Rotation nudge ────────────────────────────────────────────────────
var nudgeDeg=5;
function nudge(delta){
  cfg.azimuth=((cfg.azimuth+delta)%360+360)%360;
  updateCompass(cfg.azimuth);
  if(currentPolygon&&currentMode==="auto")fillPanels();
}
function moveGrid(dlat,dlng){gridOffset.lat+=dlat;gridOffset.lng+=dlng;if(currentPolygon&&currentMode==="auto")fillPanels();}

// ── Rotation pad ──────────────────────────────────────────────────────
var np=document.createElement("div");np.className="nudge-pad";
np.innerHTML=[
  '<div></div>',
  '<button class="nudge-btn" onclick="nudge(-nudgeDeg)" title="Rodar ←">↺</button>',
  '<div></div>',
  '<button class="nudge-btn" onclick="nudge(-1)">◁</button>',
  '<button class="nudge-btn nudge-reset" onclick="cfg.azimuth=180;updateCompass(180);if(currentPolygon&&currentMode===\'auto\')fillPanels()">Sul</button>',
  '<button class="nudge-btn" onclick="nudge(1)">▷</button>',
  '<div></div>',
  '<button class="nudge-btn" onclick="nudge(nudgeDeg)" title="Rodar →">↻</button>',
  '<div></div>'
].join("");
document.body.appendChild(np);

var mp=document.createElement("div");mp.className="move-pad";
mp.innerHTML=[
  '<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,-moveDeltaLng)">↖</button>',
  '<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,0)">↑</button>',
  '<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,moveDeltaLng)">↗</button>',
  '<button class="nudge-btn" onclick="moveGrid(0,-moveDeltaLng)">←</button>',
  '<button class="nudge-btn nudge-reset" onclick="gridOffset={lat:0,lng:0};if(currentPolygon&&currentMode===\'auto\')fillPanels()">⊙</button>',
  '<button class="nudge-btn" onclick="moveGrid(0,moveDeltaLng)">→</button>',
  '<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,-moveDeltaLng)">↙</button>',
  '<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,0)">↓</button>',
  '<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,moveDeltaLng)">↘</button>'
].join("");
document.body.appendChild(mp);

// ── Message listener ──────────────────────────────────────────────────
window.addEventListener("message",function(e){
  try{
    var d=typeof e.data==="string"?JSON.parse(e.data):e.data;
    if(d.type!=="setConfig")return;
    if(d.panelW!==undefined)cfg.panelW=d.panelW;
    if(d.panelH!==undefined)cfg.panelH=d.panelH;
    if(d.powerWp!==undefined)cfg.powerWp=d.powerWp;
    if(d.maxPanels!==undefined)cfg.maxPanels=d.maxPanels;
    if(d.azimuth!==undefined){cfg.azimuth=d.azimuth;updateCompass(cfg.azimuth);}
    if(d.mountType!==undefined){cfg.mountType=d.mountType;updateMountBadge();}
    if(d.panelProjDepth!==undefined)cfg.panelProjDepth=d.panelProjDepth;
    if(d.rowSpacing!==undefined)cfg.rowSpacing=d.rowSpacing;
    if(currentPolygon&&currentMode==="auto")fillPanels();
  }catch(_){}
});

// Activate auto btn by default
setMode("auto");
</script>
</body>
</html>`;

/* ─────────────── TYPES ─────────────── */
type PanelMode = "auto" | "calculator" | "manual";

/* ─────────────── COMPONENT ─────────────── */
export default function TabMapa() {
  const { mapData, setMapData } = useMapa();
  const { panel, setPanel } = usePanelCtx();
  const { params: solarParams, results: solarResults } = useSolar();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  const [panelMode, setPanelMode] = useState<PanelMode>("auto");
  const [manualPanels, setManualPanels] = useState("20");
  const [sidebarWidth, setSidebarWidth] = useState(272);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const calcPanels = (parseInt(solarParams.rows) || 0) * (parseInt(solarParams.cols) || 0);

  const getMaxPanels = useCallback((): number => {
    if (panelMode === "auto") return 0;
    if (panelMode === "calculator") return calcPanels;
    return parseInt(manualPanels) || 0;
  }, [panelMode, calcPanels, manualPanels]);

  const buildConfig = useCallback(() => ({
    panelW: parseFloat(panel.panelWidth) || 0,
    panelH: parseFloat(panel.panelHeight) || 0,
    powerWp: parseFloat(panel.panelPower) || 0,
    azimuth: parseInt(panel.azimuth) || 180,
    maxPanels: getMaxPanels(),
    mountType: solarParams.mountType || "triangulos",
    panelProjDepth: solarResults.panelProjectedDepth,
    rowSpacing: solarResults.rowSpacing,
  }), [panel, solarParams.mountType, solarResults, getMaxPanels]);

  const sendToIframe = useCallback((cfg: ReturnType<typeof buildConfig>) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: "setConfig", ...cfg }), "*"
    );
  }, []);

  /* sync config to iframe on any param change */
  useEffect(() => {
    sendToIframe(buildConfig());
  }, [buildConfig, sendToIframe]);

  /* receive messages from iframe */
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data.type === "roofMeasured") {
          setMapData(prev => {
            const next = { ...(prev ?? {}), ...data };
            if (prev?.mapImageDataUrl && !data.mapImageDataUrl) next.mapImageDataUrl = prev.mapImageDataUrl;
            return next;
          });
          if (data.azimuth !== undefined) {
            setPanel(prev => {
              const az = String(data.azimuth);
              return prev.azimuth === az ? prev : { ...prev, azimuth: az };
            });
          }
        } else if (data.type === "roofCleared") {
          setMapData(null);
        } else if (data.type === "mapCapture") {
          setMapData(prev => prev ? { ...prev, mapImageDataUrl: data.imageDataUrl } : null);
        }
      } catch { /* noop */ }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [setMapData, setPanel]);

  /* Resizable divider */
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(200, Math.min(420, startW + ev.clientX - startX));
      setSidebarWidth(newW);
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "invalidateSize" }), "*");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const handlePanelChange = (key: keyof typeof panel, val: string) => {
    const updated = { ...panel, [key]: val };
    setPanel(updated);
  };

  const isCoplanar = solarParams.mountType === "coplanar";

  /* fullscreen toggle */
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex overflow-hidden bg-[#0D2B45]"
      style={{ height: "calc(100vh - 112px)" }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="flex flex-col bg-white border-r border-slate-200 shadow-xl shrink-0 overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b bg-slate-50 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0D2B45] tracking-tight">Mapa Satélite</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Desenhe o telhado no mapa.</p>
            </div>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-500 transition-colors"
              title="Ecrã inteiro"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-5">

          {/* Mount type badge */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg border px-3 py-2 shrink-0">
            <span className="text-base">{isCoplanar ? "▬" : "▲"}</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#0D2B45]">
                {isCoplanar ? "Telhado Coplanar" : "Estrutura Triângulos"}
              </div>
              {!isCoplanar && (
                <div className="text-[10px] text-muted-foreground truncate">
                  d = {solarResults.rowSpacing.toFixed(3)} m · gap = {solarResults.gap.toFixed(3)} m
                </div>
              )}
            </div>
            <span className="ml-auto text-[9px] text-muted-foreground italic shrink-0">Espaçamento</span>
          </div>

          {/* Mode: toolbar guide */}
          <div className="bg-[#EBF5FF] border border-[#1E88E5]/30 rounded-lg px-3 py-2.5 space-y-1.5">
            <div className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1">
              <Info size={11} className="text-[#1E88E5]" /> Modos do Mapa
            </div>
            {[
              { icon: <Grid2x2 size={11} />, name: "Auto", desc: "Preenche automaticamente a área" },
              { icon: <PencilLine size={11} />, name: "Manual", desc: "Clique para colocar cada painel" },
              { icon: <MousePointer2 size={11} />, name: "Seleção", desc: "Selecionar / mover / apagar" },
            ].map(m => (
              <div key={m.name} className="flex items-start gap-2">
                <span className="text-[#1E88E5] mt-0.5 shrink-0">{m.icon}</span>
                <span className="text-[10px] text-[#0D2B45]"><strong>{m.name}:</strong> {m.desc}</span>
              </div>
            ))}
          </div>

          {/* Panel dimensions */}
          <div className="space-y-3">
            <Label className="text-xs font-bold text-[#0D2B45] uppercase tracking-wider">Painel Solar</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Largura (m)</Label>
                <Input type="number" value={panel.panelWidth}
                  onChange={e => handlePanelChange("panelWidth", e.target.value)}
                  step="0.01" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Altura (m)</Label>
                <Input type="number" value={panel.panelHeight}
                  onChange={e => handlePanelChange("panelHeight", e.target.value)}
                  step="0.01" className="h-8 text-sm" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Potência (Wp)</Label>
                <Input type="number" value={panel.panelPower}
                  onChange={e => handlePanelChange("panelPower", e.target.value)}
                  className="h-8 text-sm" />
              </div>
            </div>
          </div>

          {/* Auto-fill max panels */}
          <div className="space-y-2 pt-1 border-t">
            <Label className="text-xs font-bold text-[#0D2B45] uppercase tracking-wider">Limite de Painéis (Auto)</Label>
            <div className="grid grid-cols-3 gap-0 rounded-lg border border-slate-200 overflow-hidden text-[10px] font-semibold">
              {(["auto", "calculator", "manual"] as PanelMode[]).map((mode) => (
                <button key={mode} type="button" onClick={() => setPanelMode(mode)}
                  className={cn(
                    "py-2 px-1 text-center border-r last:border-r-0 border-slate-200 transition-colors",
                    panelMode === mode ? "bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                  )}>
                  {mode === "auto" ? "Ilimitado" : mode === "calculator" ? "Da Calc." : "Manual"}
                </button>
              ))}
            </div>
            {panelMode === "calculator" && (
              <div className="bg-[#EBF5FF] border-[#1E88E5] border rounded px-2.5 py-2 text-xs">
                <div className="font-semibold text-[#0D2B45]">{calcPanels} painéis</div>
                <div className="text-[10px] text-muted-foreground">{solarParams.rows} × {solarParams.cols}</div>
              </div>
            )}
            {panelMode === "manual" && (
              <div className="space-y-1">
                <Label className="text-[10px]">Máximo</Label>
                <Input type="number" value={manualPanels}
                  onChange={e => setManualPanels(e.target.value)}
                  min="1" className="h-8 text-sm" />
              </div>
            )}
          </div>

          {/* Azimuth */}
          <div className="space-y-2 pt-1 border-t">
            <Label className="text-xs font-bold text-[#0D2B45] uppercase tracking-wider">Orientação</Label>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Azimute (0=N · 180=Sul ideal)</Label>
              <Input type="number" value={panel.azimuth}
                onChange={e => handlePanelChange("azimuth", e.target.value)}
                className="h-8 text-sm" />
            </div>
          </div>

          {/* Results */}
          {mapData && (
            <div className="pt-2 border-t space-y-2">
              <Label className="text-xs font-bold text-[#0D2B45] uppercase tracking-wider">Resultados</Label>
              <Card className="bg-[#F0F6FB] border-[#1E88E5]/20 shadow-sm">
                <CardContent className="p-3 space-y-2">
                  {[
                    { label: "Painéis", value: mapData.panelCount, bold: true, color: "text-[#0D2B45] text-lg font-bold" },
                    { label: "Potência", value: `${mapData.totalKwp?.toFixed(2)} kWp`, bold: true, color: "text-[#1E88E5] text-base font-bold" },
                    { label: "Área telhado", value: `${mapData.roofArea} m²` },
                    { label: "Tipo", value: mapData.mountType === "coplanar" ? "Coplanar" : "Triângulos" },
                    { label: "Orientação", value: mapData.orientationLabel, color: "text-[#F5A623] font-semibold text-xs" },
                    ...((mapData as any).manualCount > 0 ? [{ label: "Manual", value: `${(mapData as any).manualCount} un.` }] : []),
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-[#1E88E5]/10 pb-1.5 last:border-0 last:pb-0">
                      <span className="text-[10px] text-muted-foreground">{row.label}</span>
                      <span className={row.color ?? "font-semibold text-[#0D2B45] text-sm"}>{row.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Manual mode actions */}
          <div className="pt-1 border-t space-y-2">
            <Label className="text-xs font-bold text-[#0D2B45] uppercase tracking-wider">Painéis Manuais</Label>
            <button
              onClick={() => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "clearManual" }), "*")}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors"
            >
              <Trash2 size={12} /> Limpar Painéis Manuais
            </button>
            <button
              onClick={() => { sendToIframe(buildConfig()); }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              <RotateCcw size={12} /> Atualizar Grelha
            </button>
          </div>
        </div>
      </aside>

      {/* ── Resizable Divider ── */}
      <div
        ref={dividerRef}
        onMouseDown={onMouseDown}
        className={cn(
          "w-1.5 shrink-0 cursor-col-resize hover:bg-[#1E88E5] transition-colors",
          isDragging ? "bg-[#1E88E5]" : "bg-slate-300/50"
        )}
        title="Arrastar para redimensionar"
      />

      {/* ── Map iframe ── */}
      <div className="flex-1 relative overflow-hidden min-w-0">
        <iframe
          ref={iframeRef}
          srcDoc={MAP_HTML}
          className="absolute inset-0 w-full h-full border-none"
          title="Mapa Satélite"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
