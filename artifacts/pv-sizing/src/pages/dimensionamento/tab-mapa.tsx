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
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────
   MAP HTML  — fully self-contained, renders inside a srcDoc iframe
   Critical fixes:
   - #map uses position:absolute inset:0 so it always fills the iframe
   - Multiple invalidateSize() calls on init (100/400/1200 ms)
   - Handles postMessage: invalidateSize | flyTo | setConfig | clearManual
   - OSM tiles as base (always loads) + Esri satellite toggle
   ─────────────────────────────────────────────────────────────────────────*/
const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
html{width:100%;height:100%;}
body{width:100%;height:100%;overflow:hidden;background:#0D2B45;position:relative;}
#map{position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;min-height:400px;z-index:1;}
#toolbar{
  position:absolute;top:8px;left:50%;transform:translateX(-50%);
  display:flex;gap:3px;z-index:1001;background:rgba(13,43,69,0.94);
  border:1px solid rgba(245,166,35,0.4);border-radius:10px;padding:3px;
  box-shadow:0 4px 16px rgba(0,0,0,0.4);
}
.tb-btn{
  display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;
  border:none;cursor:pointer;font-size:11px;font-family:-apple-system,sans-serif;
  font-weight:600;color:#94A3B8;background:transparent;transition:all .15s;white-space:nowrap;
}
.tb-btn:hover{background:rgba(255,255,255,0.1);color:#fff;}
.tb-btn.active{background:rgba(30,136,229,0.85);color:#fff;}
.tb-btn.sat-on{background:rgba(245,166,35,0.25);color:#F5A623;}
.tb-btn.danger:hover{background:rgba(239,68,68,0.3);color:#FCA5A5;}
.tb-sep{width:1px;background:rgba(255,255,255,0.12);margin:3px 1px;}
.info-bar{
  position:absolute;bottom:6px;left:50%;transform:translateX(-50%);
  background:rgba(13,43,69,0.92);color:#fff;padding:5px 14px;
  border-radius:14px;font-family:-apple-system,sans-serif;font-size:11px;
  z-index:1000;pointer-events:none;white-space:nowrap;max-width:92%;
  border:1px solid rgba(245,166,35,0.35);text-overflow:ellipsis;overflow:hidden;
}
.mount-badge{
  position:absolute;bottom:36px;left:50%;transform:translateX(-50%);
  background:rgba(13,43,69,0.88);color:#F5A623;padding:3px 10px;
  border-radius:10px;font-family:-apple-system,sans-serif;font-size:10px;
  z-index:1000;pointer-events:none;border:1px solid rgba(245,166,35,0.3);
}
.nudge-pad,.move-pad{
  position:absolute;z-index:1001;
  display:grid;grid-template-columns:repeat(3,30px);grid-template-rows:repeat(3,30px);gap:2px;
}
.nudge-pad{bottom:66px;left:8px;}
.move-pad{bottom:66px;left:108px;}
.nudge-btn{
  background:rgba(13,43,69,0.88);color:#F5A623;border:1px solid rgba(245,166,35,0.5);
  border-radius:6px;font-size:13px;cursor:pointer;display:flex;align-items:center;
  justify-content:center;width:30px;height:30px;
  font-family:-apple-system,sans-serif;user-select:none;touch-action:manipulation;
}
.nudge-btn:active,.nudge-btn:hover{background:rgba(30,136,229,0.7);}
.nudge-reset{font-size:10px;color:#fff;}
#compassBox{position:absolute;right:8px;bottom:110px;z-index:1001;text-align:center;pointer-events:none;}
#compassLabel{
  background:rgba(13,43,69,0.93);color:#F5A623;font-size:9px;
  font-family:-apple-system,sans-serif;border-radius:5px;padding:2px 7px;
  margin-top:2px;border:1px solid rgba(245,166,35,0.45);white-space:nowrap;
}
.sel-hint{
  position:absolute;top:48px;left:50%;transform:translateX(-50%);
  background:rgba(245,166,35,0.15);border:1px solid rgba(245,166,35,0.5);
  color:#F5A623;padding:6px 14px;border-radius:8px;font-size:11px;
  font-family:-apple-system,sans-serif;z-index:1001;pointer-events:none;
}
.loc-badge{
  position:absolute;top:48px;right:8px;
  background:rgba(13,43,69,0.9);border:1px solid rgba(30,136,229,0.5);
  color:#60A5FA;padding:4px 10px;border-radius:8px;font-size:10px;
  font-family:-apple-system,sans-serif;z-index:1001;pointer-events:none;max-width:180px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
</style>
</head>
<body>
<div id="map"></div>
<div id="toolbar">
  <button class="tb-btn" id="btn-auto" onclick="setMode('auto')" title="Auto-preencher área">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    Auto
  </button>
  <button class="tb-btn" id="btn-manual" onclick="setMode('manual')" title="Clique para colocar painel">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
    Manual
  </button>
  <button class="tb-btn" id="btn-select" onclick="setMode('select')" title="Selecionar/apagar painéis">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4l6 18 3-7 7-3L4 4z"/></svg>
    Seleção
  </button>
  <div class="tb-sep"></div>
  <button class="tb-btn danger" onclick="clearManual()" title="Apagar painéis manuais">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
    Limpar
  </button>
  <div class="tb-sep"></div>
  <button class="tb-btn" id="btn-sat" onclick="toggleSat()" title="Alternar satélite/mapa">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    Satélite
  </button>
</div>
<div id="info" class="info-bar">📐 Desenhe a área do telhado com a ferramenta de polígono</div>
<div id="mountBadge" class="mount-badge">▲ Triângulos</div>
<div id="compassBox">
  <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <circle cx="25" cy="25" r="23" fill="rgba(13,43,69,0.93)" stroke="rgba(245,166,35,0.55)" stroke-width="1.5"/>
    <text x="25" y="12" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="7" font-family="-apple-system">N</text>
    <text x="25" y="44" text-anchor="middle" fill="#F5A623" font-size="7" font-weight="bold" font-family="-apple-system">S</text>
    <text x="8" y="29" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="6.5" font-family="-apple-system">O</text>
    <text x="42" y="29" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="6.5" font-family="-apple-system">E</text>
    <g id="compassArrow" transform="rotate(0,25,25)">
      <polygon points="25,5 28,22 25,19 22,22" fill="#F5A623" opacity="0.95"/>
      <polygon points="25,45 28,28 25,31 22,28" fill="rgba(255,255,255,0.3)"/>
    </g>
  </svg>
  <div id="compassLabel">Sul · ideal</div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
// ── State ─────────────────────────────────────────────────────────────────
var cfg={panelW:1.13,panelH:2.28,panelProjDepth:1.974,rowSpacing:4.132,
         mountType:"triangulos",powerWp:400,maxPanels:0,azimuth:180};
var gridOffset={lat:0,lng:0};
var moveDeltaLat=0.4/111000,moveDeltaLng=0.4/80000;
var currentMode="auto";
var currentPolygon=null;
var manualList=[];
var selectedId=null;
var nextId=1;
var satOn=false;
var locationName="";

// ── Leaflet init ──────────────────────────────────────────────────────────
var map=L.map("map",{
  zoomControl:true,maxZoom:24,minZoom:2,
  zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:80,
  preferCanvas:true
}).setView([39.5,-8.0],7);

// OSM base layer (always reliable)
var osmLayer=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  attribution:"© OpenStreetMap",maxZoom:24,maxNativeZoom:19,
  subdomains:["a","b","c"]
});

// Esri satellite overlay
var esriSatLayer=L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {attribution:"Esri",maxZoom:24,maxNativeZoom:19}
);
var esriLabels=L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  {attribution:"Esri",maxZoom:24,maxNativeZoom:19,opacity:0.85}
);

// Start with OSM (always loads), satellite as opt-in
osmLayer.addTo(map);

function toggleSat(){
  satOn=!satOn;
  var btn=document.getElementById("btn-sat");
  if(satOn){
    osmLayer.remove();
    esriSatLayer.addTo(map);
    esriLabels.addTo(map);
    if(btn)btn.classList.add("sat-on");
  }else{
    esriSatLayer.remove();
    esriLabels.remove();
    osmLayer.addTo(map);
    if(btn)btn.classList.remove("sat-on");
  }
}

// ── Critical: invalidateSize ASAP and after delays ────────────────────────
function doInvalidate(){map.invalidateSize({animate:false});}
doInvalidate();
setTimeout(doInvalidate,100);
setTimeout(doInvalidate,400);
setTimeout(doInvalidate,1200);

// ResizeObserver ensures tiles load after container resize
var ro=new ResizeObserver(function(){doInvalidate();});
ro.observe(document.getElementById("map"));

// ── Drawn layers ──────────────────────────────────────────────────────────
var drawnItems=new L.FeatureGroup().addTo(map);
var panelLayer=new L.FeatureGroup().addTo(map);
var manualLayer=new L.FeatureGroup().addTo(map);

var drawCtrl=new L.Control.Draw({
  edit:{featureGroup:drawnItems},
  draw:{
    polygon:{shapeOptions:{color:"#F5A623",fillColor:"rgba(245,166,35,0.1)",fillOpacity:0.3,weight:2}},
    polyline:false,rectangle:false,circle:false,circlemarker:false,marker:false
  }
}).addTo(map);

// ── Draw events ───────────────────────────────────────────────────────────
map.on(L.Draw.Event.CREATED,function(e){
  drawnItems.clearLayers();panelLayer.clearLayers();currentPolygon=null;
  currentPolygon=e.layer;drawnItems.addLayer(currentPolygon);
  gridOffset={lat:0,lng:0};
  if(currentMode==="auto")fillPanels();else emitResults(0,[],0,0);
});
map.on(L.Draw.Event.EDITED,function(){
  panelLayer.clearLayers();currentPolygon=null;
  drawnItems.eachLayer(function(l){currentPolygon=l;});
  if(currentPolygon&&currentMode==="auto")fillPanels();
});
map.on(L.Draw.Event.DELETED,function(){
  panelLayer.clearLayers();currentPolygon=null;
  document.getElementById("info").textContent="📐 Desenhe a área do telhado";
  window.parent.postMessage(JSON.stringify({type:"roofCleared"}),"*");
});

// ── Mode ──────────────────────────────────────────────────────────────────
function setMode(m){
  currentMode=m;
  ["auto","manual","select"].forEach(function(k){
    var el=document.getElementById("btn-"+k);
    if(el)el.classList.toggle("active",k===m);
  });
  if(m!=="select")deselectAll();
  if(m==="select"){
    var h=document.createElement("div");
    h.className="sel-hint";h.id="sel-hint";
    h.textContent="Clique no painel para selecionar · ← → ↑ ↓ mover · Delete apagar";
    document.body.appendChild(h);
    setTimeout(function(){var x=document.getElementById("sel-hint");if(x)x.remove();},3500);
  }
  if(m==="auto"&&currentPolygon)fillPanels();
}

// ── Keyboard ──────────────────────────────────────────────────────────────
document.addEventListener("keydown",function(e){
  if((e.key==="Delete"||e.key==="Backspace")&&selectedId!==null&&currentMode==="select"){
    e.preventDefault();deleteSelected();return;
  }
  if(selectedId!==null&&currentMode==="select"){
    var dLat=0,dLng=0;
    if(e.key==="ArrowUp")dLat=moveDeltaLat*4;
    else if(e.key==="ArrowDown")dLat=-moveDeltaLat*4;
    else if(e.key==="ArrowLeft")dLng=-moveDeltaLng*4;
    else if(e.key==="ArrowRight")dLng=moveDeltaLng*4;
    else return;
    e.preventDefault();
    var item=manualList.find(function(p){return p.id===selectedId;});
    if(!item)return;
    item.lat+=dLat;item.lng+=dLng;
    item.corners=item.corners.map(function(c){return L.latLng(c.lat+dLat,c.lng+dLng);});
    item.layer.setLatLngs(item.corners);
    emitResults();
  }
});

// ── Manual placement ──────────────────────────────────────────────────────
map.on("click",function(e){
  if(currentMode!=="manual"||!currentPolygon)return;
  var ll=e.latlng;
  var poly=currentPolygon.getLatLngs()[0];
  if(!isPointInPolygon([ll.lat,ll.lng],poly.map(function(p){return[p.lat,p.lng];})))return;
  placeManualPanel(ll.lat,ll.lng);
  emitResults();
});

function placeManualPanel(lat,lng){
  var az=cfg.azimuth,azPerp=(az+90)%360;
  var isCoplanar=cfg.mountType==="coplanar";
  var fwd=isCoplanar?cfg.panelH:cfg.panelProjDepth;
  var c0=destPoint(lat,lng,az,-fwd/2);
  var c1=destPoint(c0[0],c0[1],azPerp,-cfg.panelW/2);
  var c2=destPoint(c1[0],c1[1],azPerp,cfg.panelW);
  var c3=destPoint(c0[0],c0[1],az,fwd);
  var c4=destPoint(c3[0],c3[1],azPerp,-cfg.panelW/2);
  var c5=destPoint(c4[0],c4[1],azPerp,cfg.panelW);
  var corners=[L.latLng(c1),L.latLng(c2),L.latLng(c5),L.latLng(c4)];
  var fill=isCoplanar?"#3B82F6":"#1E88E5";
  var id=nextId++;
  var layer=L.polygon(corners,{color:"#1565C0",fillColor:fill,fillOpacity:0.75,weight:1.5,interactive:true});
  layer.addTo(manualLayer);
  layer.on("click",function(ev){L.DomEvent.stopPropagation(ev);if(currentMode==="select")selectPanel(id);});
  manualList.push({id:id,corners:corners,layer:layer,lat:lat,lng:lng});
}

function selectPanel(id){
  deselectAll();selectedId=id;
  var it=manualList.find(function(p){return p.id===id;});
  if(it)it.layer.setStyle({color:"#F5A623",weight:2.5,fillOpacity:0.9});
}
function deselectAll(){
  selectedId=null;
  manualList.forEach(function(p){p.layer.setStyle({color:"#1565C0",weight:1.5,fillOpacity:0.75});});
}
function deleteSelected(){
  if(selectedId===null)return;
  var idx=manualList.findIndex(function(p){return p.id===selectedId;});
  if(idx===-1)return;
  manualLayer.removeLayer(manualList[idx].layer);
  manualList.splice(idx,1);selectedId=null;emitResults();
}
function clearManual(){
  manualList.forEach(function(p){manualLayer.removeLayer(p.layer);});
  manualList=[];selectedId=null;emitResults();
}

// ── Auto-fill ─────────────────────────────────────────────────────────────
function fillPanels(){
  if(!currentPolygon)return;
  panelLayer.clearLayers();
  var latlngs=currentPolygon.getLatLngs()[0];
  var bounds=currentPolygon.getBounds();
  var bc=bounds.getCenter();
  var center=L.latLng(bc.lat+gridOffset.lat,bc.lng+gridOffset.lng);
  var nw=L.latLng(bounds.getNorth(),bounds.getWest());
  var ne=L.latLng(bounds.getNorth(),bounds.getEast());
  var sw=L.latLng(bounds.getSouth(),bounds.getWest());
  var bW=nw.distanceTo(ne),bH=nw.distanceTo(sw);
  var az=cfg.azimuth,azPerp=(az+90)%360;
  var isCoplanar=cfg.mountType==="coplanar";
  var fwd=isCoplanar?cfg.panelH:cfg.panelProjDepth;
  var stepAlong=isCoplanar?(cfg.panelH+0.02):cfg.rowSpacing;
  var stepAcross=cfg.panelW+0.05;
  var nA=Math.ceil(bH*1.6/stepAlong)+2;
  var nB=Math.ceil(bW*1.6/stepAcross)+2;
  var count=0,panels=[];
  var polyCoords=latlngs.map(function(ll){return[ll.lat,ll.lng];});
  for(var i=-nA;i<nA;i++){
    for(var j=-nB;j<nB;j++){
      var tmp=destPoint(center.lat,center.lng,az,i*stepAlong);
      var pc=destPoint(tmp[0],tmp[1],azPerp,j*stepAcross);
      var c0=destPoint(pc[0],pc[1],az,-fwd/2);
      var c1=destPoint(c0[0],c0[1],azPerp,-cfg.panelW/2);
      var c2=destPoint(c1[0],c1[1],azPerp,cfg.panelW);
      var c3=destPoint(c0[0],c0[1],az,fwd);
      var c4=destPoint(c3[0],c3[1],azPerp,-cfg.panelW/2);
      var c5=destPoint(c4[0],c4[1],azPerp,cfg.panelW);
      var corners=[L.latLng(c1),L.latLng(c2),L.latLng(c5),L.latLng(c4)];
      if(corners.every(function(pt){return isPointInPolygon([pt.lat,pt.lng],polyCoords);})){
        if(cfg.maxPanels>0&&count>=cfg.maxPanels)continue;
        panels.push(corners);count++;
      }
    }
  }
  var fill=isCoplanar?"#3B82F6":"#1E88E5";
  var stroke=isCoplanar?"#1D4ED8":"#1565C0";
  panels.forEach(function(c){
    L.polygon(c,{color:stroke,fillColor:fill,fillOpacity:isCoplanar?0.55:0.65,weight:1,interactive:false}).addTo(panelLayer);
  });
  emitResults(count,panels,bW,bH);
  // Screenshot capture
  if(typeof html2canvas!=="undefined"&&panels.length>0){
    setTimeout(function(){
      html2canvas(document.getElementById("map"),{useCORS:true,allowTaint:false,scale:0.6,
        logging:false,imageTimeout:8000,backgroundColor:"#0D2B45"}).then(function(c){
        window.parent.postMessage(JSON.stringify({type:"mapCapture",imageDataUrl:c.toDataURL("image/jpeg",0.8)}),"*");
      }).catch(function(){});
    },2500);
  }
}

function emitResults(autoCount,panels,bW,bH){
  if(!currentPolygon)return;
  var manualCount=manualList.length;
  var total=(autoCount||0)+manualCount;
  var az=cfg.azimuth;
  var dev=Math.min(Math.abs(az-180),360-Math.abs(az-180));
  var devText=dev<2?"Sul · ideal":azLabel(az)+" · "+Math.round(dev)+"° de Sul";
  var tkwp=(total*cfg.powerWp)/1000;
  var factor=orientationFactor(az);
  var typeLabel=cfg.mountType==="coplanar"?"▬ Coplan.":"▲ Triâng.";
  updateCompass(az);
  var infoText=typeLabel+" · "+total+" painéis · "+tkwp.toFixed(2)+" kWp · "+devText;
  if(manualCount>0)infoText+=" ("+autoCount+" auto + "+manualCount+" manual)";
  document.getElementById("info").textContent=infoText;
  window.parent.postMessage(JSON.stringify({
    type:"roofMeasured",
    roofArea:Math.round((bW||0)*(bH||0)),
    panelCount:total,totalKwp:tkwp,adjKwp:tkwp*factor,
    azimuth:az,orientationLabel:devText,
    penaltyPct:Math.round((1-factor)*100),
    panelW:cfg.panelW,panelH:cfg.panelH,powerWp:cfg.powerWp,
    mountType:cfg.mountType,
    roofBoundsW:Math.round(bW||0),roofBoundsH:Math.round(bH||0),
    autoCount:autoCount||0,manualCount:manualCount
  }),"*");
}

// ── Helpers ───────────────────────────────────────────────────────────────
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
  var d=Math.min(Math.abs(az-180),360-Math.abs(az-180));
  var p=[[0,1.00],[45,0.95],[90,0.80],[135,0.63],[180,0.56]];
  for(var i=0;i<p.length-1;i++){if(d<=p[i+1][0])return p[i][1]+(p[i+1][1]-p[i][1])*((d-p[i][0])/(p[i+1][0]-p[i][0]));}
  return 0.56;
}
function updateCompass(az){
  var d=Math.min(Math.abs(az-180),360-Math.abs(az-180));
  document.getElementById("compassArrow").setAttribute("transform","rotate("+(az-180)+",25,25)");
  document.getElementById("compassLabel").textContent=d<2?"Sul · ideal":azLabel(az)+" · "+Math.round(d)+"° de Sul";
}
function updateMountBadge(){
  var el=document.getElementById("mountBadge");
  if(cfg.mountType==="coplanar"){el.textContent="▬ Coplanar";el.style.color="#60A5FA";}
  else{el.textContent="▲ Triângulos";el.style.color="#F5A623";}
}

// ── Azimuth nudge pad ─────────────────────────────────────────────────────
var nudgeDeg=5;
function nudge(d){cfg.azimuth=((cfg.azimuth+d)%360+360)%360;updateCompass(cfg.azimuth);if(currentPolygon&&currentMode==="auto")fillPanels();}
function moveGrid(dlat,dlng){gridOffset.lat+=dlat;gridOffset.lng+=dlng;if(currentPolygon&&currentMode==="auto")fillPanels();}
var np=document.createElement("div");np.className="nudge-pad";
np.innerHTML=['<div></div>',
  '<button class="nudge-btn" onclick="nudge(-nudgeDeg)">↺</button>','<div></div>',
  '<button class="nudge-btn" onclick="nudge(-1)">◁</button>',
  '<button class="nudge-btn nudge-reset" onclick="cfg.azimuth=180;updateCompass(180);if(currentPolygon&&currentMode===\'auto\')fillPanels()">Sul</button>',
  '<button class="nudge-btn" onclick="nudge(1)">▷</button>',
  '<div></div>','<button class="nudge-btn" onclick="nudge(nudgeDeg)">↻</button>','<div></div>'
].join("");document.body.appendChild(np);

var mp=document.createElement("div");mp.className="move-pad";
mp.innerHTML=['<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,-moveDeltaLng)">↖</button>',
  '<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,0)">↑</button>',
  '<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,moveDeltaLng)">↗</button>',
  '<button class="nudge-btn" onclick="moveGrid(0,-moveDeltaLng)">←</button>',
  '<button class="nudge-btn nudge-reset" onclick="gridOffset={lat:0,lng:0};if(currentPolygon&&currentMode===\'auto\')fillPanels()">⊙</button>',
  '<button class="nudge-btn" onclick="moveGrid(0,moveDeltaLng)">→</button>',
  '<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,-moveDeltaLng)">↙</button>',
  '<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,0)">↓</button>',
  '<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,moveDeltaLng)">↘</button>'
].join("");document.body.appendChild(mp);

// ── Message handler ───────────────────────────────────────────────────────
window.addEventListener("message",function(e){
  try{
    var d=typeof e.data==="string"?JSON.parse(e.data):e.data;
    switch(d.type){
      case"setConfig":
        if(d.panelW!==undefined)cfg.panelW=d.panelW;
        if(d.panelH!==undefined)cfg.panelH=d.panelH;
        if(d.powerWp!==undefined)cfg.powerWp=d.powerWp;
        if(d.maxPanels!==undefined)cfg.maxPanels=d.maxPanels;
        if(d.azimuth!==undefined){cfg.azimuth=d.azimuth;updateCompass(cfg.azimuth);}
        if(d.mountType!==undefined){cfg.mountType=d.mountType;updateMountBadge();}
        if(d.panelProjDepth!==undefined)cfg.panelProjDepth=d.panelProjDepth;
        if(d.rowSpacing!==undefined)cfg.rowSpacing=d.rowSpacing;
        if(currentPolygon&&currentMode==="auto")fillPanels();
        break;
      case"invalidateSize":
        doInvalidate();
        setTimeout(doInvalidate,150);
        setTimeout(doInvalidate,500);
        break;
      case"flyTo":
        if(d.lat!==undefined&&d.lng!==undefined){
          map.flyTo([d.lat,d.lng],d.zoom||17,{animate:true,duration:1.2});
          if(d.name){
            var lb=document.getElementById("loc-badge")||document.createElement("div");
            lb.id="loc-badge";lb.className="loc-badge";lb.textContent="📍 "+d.name;
            if(!document.getElementById("loc-badge"))document.body.appendChild(lb);
            setTimeout(function(){var x=document.getElementById("loc-badge");if(x)x.remove();},4000);
          }
        }
        break;
      case"clearManual":
        clearManual();
        break;
    }
  }catch(_){}
});

// Activate auto by default
setMode("auto");
// Final invalidateSize after all scripts load
window.addEventListener("load",function(){doInvalidate();setTimeout(doInvalidate,300);});
</script>
</body>
</html>`;

/* ─────────────── COMPONENT ─────────────── */
type PanelMode = "auto" | "calculator" | "manual";

interface TabMapaProps {
  isActive?: boolean;
}

export default function TabMapa({ isActive = false }: TabMapaProps) {
  const { mapData, setMapData } = useMapa();
  const { panel, setPanel } = usePanelCtx();
  const { params: solarParams, results: solarResults } = useSolar();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [panelMode, setPanelMode] = useState<PanelMode>("auto");
  const [manualPanels, setManualPanels] = useState("20");
  const [sidebarWidth, setSidebarWidth] = useState(272);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prevLatRef = useRef<string>("");
  const prevLngRef = useRef<string>("");

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

  const post = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
  }, []);

  /* ── When tab becomes active: invalidate + fly to current location ── */
  useEffect(() => {
    if (!isActive) return;
    // Invalidate immediately and after short delays
    post({ type: "invalidateSize" });
    const t1 = setTimeout(() => post({ type: "invalidateSize" }), 200);
    const t2 = setTimeout(() => post({ type: "invalidateSize" }), 600);
    // Sync config
    post({ type: "setConfig", ...buildConfig() });
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isActive, post, buildConfig]);

  /* ── Fly to location when lat/lng changes ── */
  useEffect(() => {
    if (!isActive) return;
    const lat = solarParams.latitude;
    const lng = solarParams.longitude;
    if (!lat || !lng) return;
    if (lat === prevLatRef.current && lng === prevLngRef.current) return;
    prevLatRef.current = lat;
    prevLngRef.current = lng;
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    post({
      type: "flyTo",
      lat: latN,
      lng: lngN,
      zoom: 18,
      name: solarParams.locationName || `${lat}, ${lng}`,
    });
  }, [isActive, solarParams.latitude, solarParams.longitude, solarParams.locationName, post]);

  /* ── Sync all config on param changes ── */
  useEffect(() => {
    post({ type: "setConfig", ...buildConfig() });
  }, [buildConfig, post]);

  /* ── Receive iframe messages ── */
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

  /* ── Resizable divider ── */
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => setSidebarWidth(Math.max(200, Math.min(420, startW + ev.clientX - startX)));
    const onUp = () => {
      setIsDragging(false);
      post({ type: "invalidateSize" });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth, post]);

  const handlePanelChange = (key: keyof typeof panel, val: string) =>
    setPanel(prev => ({ ...prev, [key]: val }));

  /* ── Fullscreen ── */
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    document.fullscreenElement ? document.exitFullscreen?.() : el.requestFullscreen?.();
  };
  useEffect(() => {
    const h = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => post({ type: "invalidateSize" }), 150);
    };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [post]);

  const isCoplanar = solarParams.mountType === "coplanar";

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
        <div className="px-4 py-3 border-b bg-slate-50 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#0D2B45] tracking-tight">Mapa Satélite</h2>
            {solarParams.locationName && (
              <p className="text-[10px] text-[#1E88E5] flex items-center gap-1 mt-0.5">
                <Navigation size={9} /> {solarParams.locationName}
              </p>
            )}
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
            title="Ecrã inteiro"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

          {/* Location sync indicator */}
          {solarParams.latitude && solarParams.longitude && (
            <div
              className="flex items-center gap-2 bg-[#EBF5FF] border border-[#1E88E5]/30 rounded-lg px-3 py-2 cursor-pointer hover:bg-[#DBEAFE] transition-colors"
              onClick={() => post({
                type: "flyTo",
                lat: parseFloat(solarParams.latitude),
                lng: parseFloat(solarParams.longitude),
                zoom: 18,
                name: solarParams.locationName,
              })}
              title="Centrar mapa nesta localização"
            >
              <Navigation size={13} className="text-[#1E88E5] shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-[#0D2B45] truncate">
                  {solarParams.locationName || "Localização do projeto"}
                </div>
                <div className="text-[10px] text-muted-foreground">{solarParams.latitude}°, {solarParams.longitude}°</div>
              </div>
            </div>
          )}

          {/* Mount type badge */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg border px-3 py-2">
            <span>{isCoplanar ? "▬" : "▲"}</span>
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

          {/* Modes guide */}
          <div className="bg-[#F8FAFC] border rounded-lg px-3 py-2.5 space-y-1.5">
            <div className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1 mb-1">
              <Info size={10} className="text-[#1E88E5]" /> Modos no mapa
            </div>
            {[
              { icon: <Grid2x2 size={10} />, name: "Auto", desc: "Preenche a área" },
              { icon: <PencilLine size={10} />, name: "Manual", desc: "Clique para colocar" },
              { icon: <MousePointer2 size={10} />, name: "Seleção", desc: "Mover / apagar painéis" },
            ].map(m => (
              <div key={m.name} className="flex items-start gap-1.5">
                <span className="text-[#1E88E5] mt-0.5 shrink-0">{m.icon}</span>
                <span className="text-[10px] text-[#0D2B45]"><strong>{m.name}:</strong> {m.desc}</span>
              </div>
            ))}
          </div>

          {/* Panel params */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Painel</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Largura (m)</Label>
                <Input type="number" value={panel.panelWidth}
                  onChange={e => handlePanelChange("panelWidth", e.target.value)}
                  step="0.01" className="h-8 text-sm mt-0.5" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Altura (m)</Label>
                <Input type="number" value={panel.panelHeight}
                  onChange={e => handlePanelChange("panelHeight", e.target.value)}
                  step="0.01" className="h-8 text-sm mt-0.5" />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] text-muted-foreground">Potência (Wp)</Label>
                <Input type="number" value={panel.panelPower}
                  onChange={e => handlePanelChange("panelPower", e.target.value)}
                  className="h-8 text-sm mt-0.5" />
              </div>
            </div>
          </div>

          {/* Auto-fill limit */}
          <div className="space-y-1.5 border-t pt-3">
            <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Limite Auto</Label>
            <div className="grid grid-cols-3 gap-0 rounded-lg border border-slate-200 overflow-hidden text-[10px] font-semibold">
              {(["auto", "calculator", "manual"] as PanelMode[]).map(mode => (
                <button key={mode} type="button" onClick={() => setPanelMode(mode)}
                  className={cn(
                    "py-2 text-center border-r last:border-r-0 border-slate-200 transition-colors",
                    panelMode === mode ? "bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                  )}>
                  {mode === "auto" ? "∞" : mode === "calculator" ? "Calc." : "Manual"}
                </button>
              ))}
            </div>
            {panelMode === "calculator" && (
              <div className="text-xs bg-[#EBF5FF] border-[#1E88E5] border rounded px-2 py-1.5">
                <span className="font-bold text-[#1E88E5]">{calcPanels}</span>
                <span className="text-muted-foreground ml-1">({solarParams.rows}×{solarParams.cols})</span>
              </div>
            )}
            {panelMode === "manual" && (
              <Input type="number" value={manualPanels}
                onChange={e => setManualPanels(e.target.value)}
                min="1" className="h-8 text-sm" />
            )}
          </div>

          {/* Azimuth */}
          <div className="space-y-1.5 border-t pt-3">
            <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Azimute (Sul = 180°)</Label>
            <Input type="number" value={panel.azimuth}
              onChange={e => handlePanelChange("azimuth", e.target.value)}
              className="h-8 text-sm" />
          </div>

          {/* Results */}
          {mapData && (
            <div className="border-t pt-3 space-y-2">
              <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Resultados</Label>
              <Card className="bg-[#F0F6FB] border-[#1E88E5]/20">
                <CardContent className="p-3 space-y-1.5">
                  {[
                    { label: "Painéis", value: mapData.panelCount, cls: "text-lg font-bold text-[#0D2B45]" },
                    { label: "Potência", value: `${mapData.totalKwp?.toFixed(2)} kWp`, cls: "text-base font-bold text-[#1E88E5]" },
                    { label: "Área", value: `${mapData.roofArea} m²`, cls: "text-sm font-semibold text-[#0D2B45]" },
                    { label: "Tipo", value: mapData.mountType === "coplanar" ? "Coplanar" : "Triângulos", cls: "text-sm font-semibold text-[#0D2B45]" },
                    { label: "Orient.", value: mapData.orientationLabel, cls: "text-xs font-semibold text-[#F5A623]" },
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">{row.label}</span>
                      <span className={row.cls}>{String(row.value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Actions */}
          <div className="border-t pt-3 space-y-2">
            <button
              onClick={() => post({ type: "clearManual" })}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors"
            >
              <Trash2 size={11} /> Limpar Painéis Manuais
            </button>
            <button
              onClick={() => post({ type: "invalidateSize" })}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              <RotateCcw size={11} /> Recarregar Mapa
            </button>
          </div>
        </div>
      </aside>

      {/* ── Resizable divider ── */}
      <div
        onMouseDown={onMouseDown}
        className={cn(
          "w-1.5 shrink-0 cursor-col-resize hover:bg-[#1E88E5] transition-colors",
          isDragging ? "bg-[#1E88E5]" : "bg-slate-300/40"
        )}
      />

      {/* ── Map iframe ── */}
      <div className="flex-1 relative overflow-hidden min-w-0 bg-[#0D2B45]">
        <iframe
          ref={iframeRef}
          srcDoc={MAP_HTML}
          className="absolute inset-0 w-full h-full border-none"
          title="Mapa Satélite"
          sandbox="allow-scripts allow-same-origin"
          style={{ display: "block" }}
        />
      </div>
    </div>
  );
}
