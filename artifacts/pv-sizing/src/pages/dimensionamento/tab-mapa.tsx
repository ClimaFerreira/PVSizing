import { useEffect, useRef, useState } from "react";
import { useMapa } from "@/contexts/MapaContext";
import { usePanelCtx } from "@/contexts/PanelContext";
import { useSolar } from "@/contexts/SolarContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css"/>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; background: #0D2B45; }
#map { width: 100%; height: 100%; }
.info-bar {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  background: rgba(13,43,69,0.9); color: #fff; padding: 6px 14px;
  border-radius: 16px; font-family: -apple-system,sans-serif; font-size: 12px;
  z-index: 1000; pointer-events: none; white-space: nowrap; max-width: 92%;
  border: 1px solid rgba(245,166,35,0.5);
}
.mount-badge {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  background: rgba(13,43,69,0.88); color: #F5A623; padding: 4px 12px;
  border-radius: 12px; font-family: -apple-system,sans-serif; font-size: 11px;
  z-index: 1000; pointer-events: none; border: 1px solid rgba(245,166,35,0.4);
}
.leaflet-draw-toolbar a { background-color: #0D2B45 !important; }
.leaflet-draw-toolbar a:hover { background-color: #1a3d5c !important; }
.nudge-pad {
  position: absolute; bottom: 48px; left: 8px; z-index: 1001;
  display: grid; grid-template-columns: repeat(3, 30px); grid-template-rows: repeat(3, 30px); gap: 2px;
}
.nudge-btn {
  background: rgba(13,43,69,0.88); color: #F5A623; border: 1px solid rgba(245,166,35,0.5);
  border-radius: 6px; font-size: 14px; cursor: pointer; display: flex;
  align-items: center; justify-content: center; width: 30px; height: 30px;
  font-family: -apple-system, sans-serif; user-select: none; -webkit-user-select: none;
  touch-action: manipulation;
}
.nudge-btn:active { background: rgba(30,136,229,0.7); }
.nudge-reset { font-size: 11px; color: #fff; }
.move-pad {
  position: absolute; bottom: 48px; left: 110px; z-index: 1001;
  display: grid; grid-template-columns: repeat(3, 30px); grid-template-rows: repeat(3, 30px); gap: 2px;
}
#compassBox {
  position: absolute; right: 8px; bottom: 90px; z-index: 1001;
  text-align: center; pointer-events: none;
}
#compassLabel {
  background: rgba(13,43,69,0.93); color: #F5A623;
  font-size: 9px; font-family: -apple-system,sans-serif;
  border-radius: 5px; padding: 2px 7px; margin-top: 2px;
  border: 1px solid rgba(245,166,35,0.45); white-space: nowrap;
}
</style>
</head>
<body>
<div id="map"></div>
<div id="info" class="info-bar">📐 Desenhe a área do telhado</div>
<div id="mountBadge" class="mount-badge">▲ Estrutura Triângulos</div>
<div id="compassBox">
  <svg width="58" height="58" viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg">
    <circle cx="29" cy="29" r="27" fill="rgba(13,43,69,0.93)" stroke="rgba(245,166,35,0.55)" stroke-width="1.5"/>
    <line x1="29" y1="4"  x2="29" y2="9"  stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <line x1="29" y1="49" x2="29" y2="54" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <line x1="4"  y1="29" x2="9"  y2="29" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <line x1="49" y1="29" x2="54" y2="29" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <text x="29" y="17" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-size="8" font-family="-apple-system,sans-serif">N</text>
    <text x="29" y="51" text-anchor="middle" fill="#F5A623" font-size="8" font-weight="bold" font-family="-apple-system,sans-serif">S</text>
    <text x="10" y="33" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="7" font-family="-apple-system,sans-serif">O</text>
    <text x="48" y="33" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="7" font-family="-apple-system,sans-serif">E</text>
    <g id="compassArrow" transform="rotate(0,29,29)">
      <polygon points="29,8 33,28 29,24 25,28" fill="#F5A623" opacity="0.95"/>
      <polygon points="29,50 33,30 29,34 25,30" fill="rgba(255,255,255,0.35)"/>
    </g>
  </svg>
  <div id="compassLabel">Sul · ideal</div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
var cfg = { panelW:1.13, panelH:2.28, panelProjDepth:1.974, rowSpacing:4.132, mountType:"triangulos", powerWp:400, maxPanels:0, azimuth:180 };
var gridOffset = { lat:0, lng:0 };
var moveDeltaLat=0.5/111000, moveDeltaLng=0.5/80000;
function moveGrid(dlat,dlng){ gridOffset.lat+=dlat; gridOffset.lng+=dlng; if(currentPolygon) fillPanels(); }
function azLabel(az){ if(az>=337.5||az<22.5)return"N"; if(az<67.5)return"NE"; if(az<112.5)return"E"; if(az<157.5)return"SE"; if(az<202.5)return"S"; if(az<247.5)return"SO"; if(az<292.5)return"O"; return"NO"; }
function orientationFactor(az){ var dev=Math.min(Math.abs(az-180),360-Math.abs(az-180)); var pts=[[0,1.00],[45,0.95],[90,0.80],[135,0.63],[180,0.56]]; for(var i=0;i<pts.length-1;i++){ var d0=pts[i][0],f0=pts[i][1],d1=pts[i+1][0],f1=pts[i+1][1]; if(dev<=d1)return f0+(f1-f0)*((dev-d0)/(d1-d0)); } return 0.56; }
function updateCompass(az){ var dev=Math.min(Math.abs(az-180),360-Math.abs(az-180)); var label=azLabel(az); var rotDeg=az-180; document.getElementById("compassArrow").setAttribute("transform","rotate("+rotDeg+",29,29)"); var devText=dev<2?"Sul · ideal":label+" · "+Math.round(dev)+"° de Sul"; document.getElementById("compassLabel").textContent=devText; }
function updateMountBadge(){ var el=document.getElementById("mountBadge"); if(cfg.mountType==="coplanar"){el.textContent="▬ Telhado Coplanar";el.style.color="#60A5FA";}else{el.textContent="▲ Estrutura Triângulos";el.style.color="#F5A623";} }
var map=L.map("map",{zoomControl:true}).setView([39.5,-8.0],7);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{attribution:"Esri",maxZoom:22}).addTo(map);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{attribution:"Esri",maxZoom:22,opacity:0.9}).addTo(map);
var drawnItems=new L.FeatureGroup().addTo(map);
var panelLayer=new L.FeatureGroup().addTo(map);
var drawControl=new L.Control.Draw({edit:{featureGroup:drawnItems},draw:{polygon:{shapeOptions:{color:"#F5A623",fillColor:"rgba(245,166,35,0.15)",fillOpacity:0.3,weight:2}},polyline:false,rectangle:false,circle:false,circlemarker:false,marker:false}}).addTo(map);
var currentPolygon=null;
map.on(L.Draw.Event.CREATED,function(e){drawnItems.clearLayers();panelLayer.clearLayers();currentPolygon=e.layer;drawnItems.addLayer(currentPolygon);gridOffset={lat:0,lng:0};fillPanels();});
map.on(L.Draw.Event.EDITED,function(){panelLayer.clearLayers();currentPolygon=null;drawnItems.eachLayer(function(l){currentPolygon=l;});if(currentPolygon)fillPanels();});
map.on(L.Draw.Event.DELETED,function(){panelLayer.clearLayers();currentPolygon=null;document.getElementById("info").textContent="📐 Desenhe a área do telhado";window.parent.postMessage(JSON.stringify({type:"roofCleared"}),"*");});
function toRad(d){return d*Math.PI/180;} function toDeg(r){return r*180/Math.PI;}
function destPoint(lat,lng,az,dist){var R=6371000,la=toRad(lat),lo=toRad(lng),a=toRad(az),d=dist/R;var la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(a));var lo2=lo+Math.atan2(Math.sin(a)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2));return[toDeg(la2),toDeg(lo2)];}
function fillPanels(){if(!currentPolygon)return;panelLayer.clearLayers();var latlngs=currentPolygon.getLatLngs()[0];var bounds=currentPolygon.getBounds();var boundsCenter=bounds.getCenter();var center=L.latLng(boundsCenter.lat+gridOffset.lat,boundsCenter.lng+gridOffset.lng);var nw=L.latLng(bounds.getNorth(),bounds.getWest());var ne=L.latLng(bounds.getNorth(),bounds.getEast());var sw=L.latLng(bounds.getSouth(),bounds.getWest());var boundsW=nw.distanceTo(ne);var boundsH=nw.distanceTo(sw);var az=cfg.azimuth;var azPerp=(az+90)%360;var isTriangulos=cfg.mountType==="triangulos";var footprintAlong=isTriangulos?cfg.panelProjDepth:cfg.panelH;var stepAlong=isTriangulos?cfg.rowSpacing:(cfg.panelH+0.02);var stepAcross=cfg.panelW+0.05;var spanAlong=boundsH*1.5;var spanAcross=boundsW*1.5;var nAlong=Math.ceil(spanAlong/stepAlong)+2;var nAcross=Math.ceil(spanAcross/stepAcross)+2;var count=0;var panels=[];for(var i=-nAlong;i<nAlong;i++){for(var j=-nAcross;j<nAcross;j++){var distAlong=i*stepAlong;var distAcross=j*stepAcross;var tmp=destPoint(center.lat,center.lng,az,distAlong);var pc=destPoint(tmp[0],tmp[1],azPerp,distAcross);var c0=destPoint(pc[0],pc[1],az,-footprintAlong/2);var c1=destPoint(c0[0],c0[1],azPerp,-cfg.panelW/2);var c2=destPoint(c1[0],c1[1],azPerp,cfg.panelW);var c3=destPoint(c0[0],c0[1],az,footprintAlong);var c4=destPoint(c3[0],c3[1],azPerp,-cfg.panelW/2);var c5=destPoint(c4[0],c4[1],azPerp,cfg.panelW);var corners=[L.latLng(c1),L.latLng(c2),L.latLng(c5),L.latLng(c4)];var inside=corners.every(function(pt){return isPointInPolygon([pt.lat,pt.lng],latlngs.map(function(ll){return[ll.lat,ll.lng];}));});if(inside){if(cfg.maxPanels>0&&count>=cfg.maxPanels)continue;panels.push(corners);count++;}}}
var fillColor=isTriangulos?"#1E88E5":"#3B82F6";panels.forEach(function(corners){L.polygon(corners,{color:isTriangulos?"#1565C0":"#1D4ED8",fillColor:fillColor,fillOpacity:isTriangulos?0.65:0.55,weight:1,interactive:false}).addTo(panelLayer);});
var roofArea=L.GeometryUtil?L.GeometryUtil.geodesicArea(latlngs):boundsW*boundsH;var totalKwp=(count*cfg.powerWp)/1000;var penaltyPct=Math.round((1-orientationFactor(az))*100);var factor=orientationFactor(az);var adjKwp=totalKwp*factor;var label=azLabel(az);var dev=Math.min(Math.abs(az-180),360-Math.abs(az-180));var devText=dev<2?"Sul · ideal":label+" · "+Math.round(dev)+"° de Sul";var typeLabel=isTriangulos?"▲ Triâng.":"▬ Coplan.";updateCompass(az);document.getElementById("info").textContent=typeLabel+" · "+count+" painéis · "+totalKwp.toFixed(2)+" kWp · "+devText;
var panelSvg=capturePanelSvg(panels,latlngs);
window.parent.postMessage(JSON.stringify({type:"roofMeasured",roofArea:Math.round(roofArea),panelCount:count,capacity:count,totalKwp:totalKwp,adjKwp:adjKwp,azimuth:az,orientationLabel:devText,penaltyPct:penaltyPct,panelW:cfg.panelW,panelH:cfg.panelH,powerWp:cfg.powerWp,mountType:cfg.mountType,roofBoundsW:Math.round(boundsW),roofBoundsH:Math.round(boundsH),panelSvg:panelSvg}),"*");
if(typeof html2canvas!=="undefined"&&panels.length>0){setTimeout(function(){html2canvas(document.getElementById("map"),{useCORS:true,allowTaint:false,scale:0.65,logging:false,imageTimeout:8000,backgroundColor:"#0D2B45"}).then(function(canvas){var dataUrl=canvas.toDataURL("image/jpeg",0.82);window.parent.postMessage(JSON.stringify({type:"mapCapture",imageDataUrl:dataUrl}),"*");}).catch(function(){});},2000);}
}
function isPointInPolygon(point,polygon){var x=point[0],y=point[1],inside=false;for(var i=0,j=polygon.length-1;i<polygon.length;j=i++){var xi=polygon[i][0],yi=polygon[i][1],xj=polygon[j][0],yj=polygon[j][1];if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
function capturePanelSvg(panels,roofLatlngs){if(panels.length===0)return"";var allLats=[],allLngs=[];panels.forEach(function(corners){corners.forEach(function(c){allLats.push(c.lat);allLngs.push(c.lng);});});roofLatlngs.forEach(function(c){allLats.push(c.lat);allLngs.push(c.lng);});var minLat=Math.min.apply(null,allLats),maxLat=Math.max.apply(null,allLats);var minLng=Math.min.apply(null,allLngs),maxLng=Math.max.apply(null,allLngs);var midLat=(minLat+maxLat)/2;var metersPerDegLat=111320;var metersPerDegLng=111320*Math.cos(midLat*Math.PI/180);var W=400,H=400;var spanLat=(maxLat-minLat)||0.0001,spanLng=(maxLng-minLng)||0.0001;var spanMeterLat=spanLat*metersPerDegLat,spanMeterLng=spanLng*metersPerDegLng;var scale=Math.min((W-20)/spanMeterLng,(H-20)/spanMeterLat);function toSvg(lat,lng){var mx=(lng-minLng)*metersPerDegLng,my=(maxLat-lat)*metersPerDegLat;return[10+mx*scale,10+my*scale];}var roofPts=roofLatlngs.map(function(c){var p=toSvg(c.lat,c.lng);return p[0]+","+p[1];}).join(" ");var fillColor=cfg.mountType==="coplanar"?"#3B82F6":"#1E88E5";var panelRects=panels.map(function(corners){var pts=corners.map(function(c){var p=toSvg(c.lat,c.lng);return p[0]+","+p[1];}).join(" ");return'<polygon points="'+pts+'" fill="'+fillColor+'" stroke="#0D2B45" stroke-width="0.8" fill-opacity="0.75"/>';}).join("");var dev=Math.min(Math.abs(cfg.azimuth-180),360-Math.abs(cfg.azimuth-180));var compassLabel=dev<2?"Sul · ideal":azLabel(cfg.azimuth)+" · "+Math.round(dev)+"° de Sul";var typeLabel=cfg.mountType==="coplanar"?"Coplanar":"Triângulos";return'<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+'<rect width="'+W+'" height="'+H+'" fill="#F0F6FB" rx="6"/>'+'<polygon points="'+roofPts+'" fill="rgba(245,166,35,0.08)" stroke="#F5A623" stroke-width="1.5" stroke-dasharray="5,3"/>'+panelRects+'<text x="'+(W/2)+'" y="16" text-anchor="middle" font-size="10" fill="#0D2B45" font-family="Arial">'+typeLabel+' · '+compassLabel+'</text>'+'</svg>';}
var nudgeDeg=5;
function nudge(delta){cfg.azimuth=((cfg.azimuth+delta)%360+360)%360;updateCompass(cfg.azimuth);if(currentPolygon)fillPanels();}
window.addEventListener("message",function(e){try{var d=typeof e.data==="string"?JSON.parse(e.data):e.data;if(d.type==="setConfig"){if(d.panelW!==undefined)cfg.panelW=d.panelW;if(d.panelH!==undefined)cfg.panelH=d.panelH;if(d.powerWp!==undefined)cfg.powerWp=d.powerWp;if(d.maxPanels!==undefined)cfg.maxPanels=d.maxPanels;if(d.azimuth!==undefined){cfg.azimuth=d.azimuth;updateCompass(cfg.azimuth);}if(d.mountType!==undefined){cfg.mountType=d.mountType;updateMountBadge();}if(d.panelProjDepth!==undefined)cfg.panelProjDepth=d.panelProjDepth;if(d.rowSpacing!==undefined)cfg.rowSpacing=d.rowSpacing;if(currentPolygon)fillPanels();}}catch(_){}});
var nudgePad=document.createElement("div");nudgePad.className="nudge-pad";nudgePad.innerHTML=['<div></div>','<button class="nudge-btn" onclick="nudge(-nudgeDeg)">↺</button>','<div></div>','<button class="nudge-btn" onclick="nudge(-1)">◁</button>','<button class="nudge-btn nudge-reset" onclick="cfg.azimuth=180;updateCompass(180);if(currentPolygon)fillPanels()">Sul</button>','<button class="nudge-btn" onclick="nudge(1)">▷</button>','<div></div>','<button class="nudge-btn" onclick="nudge(nudgeDeg)">↻</button>','<div></div>'].join("");document.body.appendChild(nudgePad);
var movePad=document.createElement("div");movePad.className="move-pad";movePad.innerHTML=['<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,-moveDeltaLng)" title="NO">↖</button>','<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,0)" title="N">↑</button>','<button class="nudge-btn" onclick="moveGrid(moveDeltaLat,moveDeltaLng)" title="NE">↗</button>','<button class="nudge-btn" onclick="moveGrid(0,-moveDeltaLng)" title="O">←</button>','<button class="nudge-btn nudge-reset" onclick="gridOffset={lat:0,lng:0};if(currentPolygon)fillPanels()" title="Centrar">⊙</button>','<button class="nudge-btn" onclick="moveGrid(0,moveDeltaLng)" title="E">→</button>','<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,-moveDeltaLng)" title="SO">↙</button>','<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,0)" title="S">↓</button>','<button class="nudge-btn" onclick="moveGrid(-moveDeltaLat,moveDeltaLng)" title="SE">↘</button>'].join("");document.body.appendChild(movePad);
updateMountBadge();
</script>
</body>
</html>`;

type PanelMode = "auto" | "calculator" | "manual";

export default function TabMapa() {
  const { mapData, setMapData } = useMapa();
  const { panel, setPanel } = usePanelCtx();
  const { params: solarParams, results: solarResults } = useSolar();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [panelMode, setPanelMode] = useState<PanelMode>("auto");
  const [manualPanels, setManualPanels] = useState("20");

  const calcPanels = (parseInt(solarParams.rows) || 0) * (parseInt(solarParams.cols) || 0);

  const getMaxPanels = (): number => {
    if (panelMode === "auto") return 0;
    if (panelMode === "calculator") return calcPanels;
    return parseInt(manualPanels) || 0;
  };

  const buildConfig = () => ({
    panelW: parseFloat(panel.panelWidth) || 0,
    panelH: parseFloat(panel.panelHeight) || 0,
    powerWp: parseFloat(panel.panelPower) || 0,
    azimuth: parseInt(panel.azimuth) || 180,
    maxPanels: getMaxPanels(),
    mountType: solarParams.mountType || "triangulos",
    panelProjDepth: solarResults.panelProjectedDepth,
    rowSpacing: solarResults.rowSpacing,
  });

  const sendToIframe = (cfg: ReturnType<typeof buildConfig>) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ type: "setConfig", ...cfg }), "*");
    }
  };

  useEffect(() => {
    sendToIframe(buildConfig());
  }, [
    panel.panelWidth, panel.panelHeight, panel.panelPower, panel.azimuth,
    solarParams.mountType, solarResults.panelProjectedDepth, solarResults.rowSpacing,
    solarParams.rows, solarParams.cols, panelMode, manualPanels,
  ]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data.type === "roofMeasured") {
          setMapData(prev => {
            const next = { ...(prev || {}), ...data };
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
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setMapData, setPanel]);

  const handlePanelChange = (key: keyof typeof panel, val: string) => {
    const updated = { ...panel, [key]: val };
    setPanel(updated);
    const cfgKey = key === "panelWidth" ? "panelW" : key === "panelHeight" ? "panelH" : key === "panelPower" ? "powerWp" : "azimuth";
    sendToIframe({ ...buildConfig(), [cfgKey]: parseFloat(val) || 0 });
  };

  const isCoplanar = solarParams.mountType === "coplanar";

  return (
    <div className="flex gap-0 -mx-4 md:-mx-8" style={{ height: "calc(100vh - 130px)" }}>
      {/* Sidebar */}
      <div className="w-72 bg-white border-r flex flex-col z-10 shadow-lg shrink-0 overflow-y-auto">
        <div className="p-5 border-b bg-slate-50">
          <h2 className="text-lg font-bold text-[#0D2B45] tracking-tight">Mapeamento</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Desenhe a área do telhado no mapa.</p>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Mount type (read-only, set in Espaçamento) */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg border px-3 py-2">
            <span className="text-lg">{isCoplanar ? "▬" : "▲"}</span>
            <div>
              <div className="text-xs font-semibold text-[#0D2B45]">
                {isCoplanar ? "Telhado Coplanar" : "Estrutura Triângulos"}
              </div>
              {!isCoplanar && (
                <div className="text-xs text-muted-foreground">
                  d = {solarResults.rowSpacing.toFixed(3)} m · gap = {solarResults.gap.toFixed(3)} m
                </div>
              )}
            </div>
            <span className="ml-auto text-[10px] text-muted-foreground italic">Espaçamento</span>
          </div>

          {/* Panel dimensions */}
          <div className="space-y-3">
            <Label className="text-[#0D2B45] font-semibold text-sm">Painel Solar</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Largura (m)</Label>
                <Input type="number" value={panel.panelWidth} onChange={e => handlePanelChange("panelWidth", e.target.value)} step="0.01" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Altura (m)</Label>
                <Input type="number" value={panel.panelHeight} onChange={e => handlePanelChange("panelHeight", e.target.value)} step="0.01" className="h-8 text-sm" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Potência (Wp)</Label>
                <Input type="number" value={panel.panelPower} onChange={e => handlePanelChange("panelPower", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          {/* Panel count mode */}
          <div className="space-y-3 pt-1 border-t">
            <Label className="text-[#0D2B45] font-semibold text-sm">Nº de Painéis</Label>
            <div className="grid grid-cols-3 gap-0 rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(["auto", "calculator", "manual"] as PanelMode[]).map((mode) => (
                <button key={mode} type="button" onClick={() => setPanelMode(mode)}
                  className={`py-2 px-1 text-center border-r last:border-r-0 border-slate-200 transition-colors ${panelMode === mode ? "bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {mode === "auto" ? "Auto" : mode === "calculator" ? "Calculadora" : "Manual"}
                </button>
              ))}
            </div>
            {panelMode === "auto" && <p className="text-xs text-muted-foreground bg-slate-50 rounded px-2 py-1.5 border">Preenche automaticamente a área desenhada.</p>}
            {panelMode === "calculator" && (
              <div className="bg-[#EBF5FF] border-[#1E88E5] border rounded px-3 py-2 text-xs">
                <div className="font-semibold text-[#0D2B45]">Da aba Espaçamento:</div>
                <div className="text-[#1E88E5] font-bold text-base mt-0.5">{calcPanels} painéis</div>
                <div className="text-muted-foreground">{solarParams.rows} fileiras × {solarParams.cols} colunas</div>
              </div>
            )}
            {panelMode === "manual" && (
              <div className="space-y-1">
                <Label className="text-xs">Limite máximo</Label>
                <Input type="number" value={manualPanels} onChange={e => setManualPanels(e.target.value)} min="1" className="h-8 text-sm" />
              </div>
            )}
          </div>

          {/* Azimuth */}
          <div className="space-y-2 pt-1 border-t">
            <Label className="text-[#0D2B45] font-semibold text-sm">Orientação</Label>
            <div className="space-y-1">
              <Label className="text-xs">Azimute (0=N, 180=S)</Label>
              <Input type="number" value={panel.azimuth} onChange={e => handlePanelChange("azimuth", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Results */}
          {mapData && (
            <div className="pt-4 border-t space-y-3 animate-in fade-in">
              <Label className="text-[#0D2B45] font-semibold text-sm">Resultados</Label>
              <Card className="bg-[#F0F6FB] border-[#1E88E5]/20 shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-center border-b border-[#1E88E5]/10 pb-2">
                    <span className="text-xs text-muted-foreground">Nº Painéis</span>
                    <span className="font-bold text-[#0D2B45] text-lg">{mapData.panelCount}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#1E88E5]/10 pb-2">
                    <span className="text-xs text-muted-foreground">Área Telhado</span>
                    <span className="font-semibold text-[#0D2B45]">{mapData.roofArea} m²</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#1E88E5]/10 pb-2">
                    <span className="text-xs text-muted-foreground">Potência</span>
                    <span className="font-bold text-[#1E88E5] text-lg">{mapData.totalKwp?.toFixed(2)} kWp</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#1E88E5]/10 pb-2">
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <span className="font-semibold text-[#0D2B45] text-sm">{mapData.mountType === "coplanar" ? "Coplanar" : "Triângulos"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Orientação</span>
                    <span className="font-semibold text-[#F5A623] text-sm">{mapData.orientationLabel}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Map iframe */}
      <div className="flex-1 relative bg-[#E2E8F0]">
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
