import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('xupisco', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (c: Record<string, unknown>) => ipcRenderer.invoke('config:set', c),
  getVersion: () => ipcRenderer.invoke('app:version'),
  toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
  getProfiles: () => ipcRenderer.invoke('profiles:get'),
  saveProfiles: (profiles: unknown[]) => ipcRenderer.invoke('profiles:save', profiles),
  generateAuthKey: () => ipcRenderer.invoke('auth:generate-key'),
  restartApp: () => ipcRenderer.send('app:restart'),
});

// ===== STATE =====
let gameDoc: Document | null = null;
let favorites: string[] = [];
let searchValue = '';
let countryFilter = '';
let showingFavs = false;
let roomTableObserver: MutationObserver | null = null;
let fpsOn = false;
let fpsCount = 0;
let fpsLast = performance.now();
let fpsEl: HTMLElement | null = null;
let currentView: 'none' | 'roomlist' | 'inroom' | 'other' = 'none';
let themeStyleEl: HTMLStyleElement | null = null;
let parentThemeEl: HTMLStyleElement | null = null;
let currentTheme = 'dark';
let currentProfileId = 'default';
let cachedShortcuts: [string, string][] = [];
let ballColor: string | null = null;
let fieldColor: string | null = null;
let pingOverride: number | null = null;

// ===== THEME TOKENS =====
interface ThemeTokens {
  bg: string; bgElevated: string; bgPanel: string;
  text: string; textMuted: string; border: string;
  primary: string; primaryHover: string;
  danger: string; dangerHover: string; warning: string;
  inputBg: string; inputText: string;
  focusRing: string; shadow: string;
  scrollTrack: string; scrollThumb: string;
}

const DARK: ThemeTokens = {
  bg:'#0a0a0a', bgElevated:'#141414', bgPanel:'#1a1a1a',
  text:'#ffffff', textMuted:'#888888', border:'#2a2a2a',
  primary:'#a3e635', primaryHover:'#84cc16',
  danger:'#b91c1c', dangerHover:'#991b1b', warning:'#fbbf24',
  inputBg:'#0f0f0f', inputText:'#ffffff',
  focusRing:'#a3e635', shadow:'rgba(0,0,0,0.5)',
  scrollTrack:'#0a0a0a', scrollThumb:'#2a2a2a',
};

const LIGHT: ThemeTokens = {
  bg:'#f0f0f0', bgElevated:'#ffffff', bgPanel:'#e8e8e8',
  text:'#1a1a1a', textMuted:'#666666', border:'#d4d4d4',
  primary:'#16a34a', primaryHover:'#15803d',
  danger:'#dc2626', dangerHover:'#b91c1c', warning:'#d97706',
  inputBg:'#ffffff', inputText:'#1a1a1a',
  focusRing:'#16a34a', shadow:'rgba(0,0,0,0.12)',
  scrollTrack:'#eeeeee', scrollThumb:'#cccccc',
};

const MORADO: ThemeTokens = {
  bg:'#0c0014', bgElevated:'#160026', bgPanel:'#1e0033',
  text:'#e8deff', textMuted:'#9b7ec8', border:'#2d1a4e',
  primary:'#a855f7', primaryHover:'#9333ea',
  danger:'#e11d48', dangerHover:'#be123c', warning:'#f59e0b',
  inputBg:'#120020', inputText:'#e8deff',
  focusRing:'#a855f7', shadow:'rgba(80,20,140,0.4)',
  scrollTrack:'#0c0014', scrollThumb:'#2d1a4e',
};

const BLACK: ThemeTokens = {
  bg:'#000000', bgElevated:'#0e0e0e', bgPanel:'#141414',
  text:'#d4d4d4', textMuted:'#666666', border:'#222222',
  primary:'#a0a0a0', primaryHover:'#cccccc',
  danger:'#b91c1c', dangerHover:'#991b1b', warning:'#d97706',
  inputBg:'#0a0a0a', inputText:'#d4d4d4',
  focusRing:'#a0a0a0', shadow:'rgba(0,0,0,0.6)',
  scrollTrack:'#000000', scrollThumb:'#222222',
};

const BLUE: ThemeTokens = {
  bg:'#020a18', bgElevated:'#081830', bgPanel:'#0c2040',
  text:'#e0f0ff', textMuted:'#6b9ec0', border:'#0f3060',
  primary:'#38bdf8', primaryHover:'#0ea5e9',
  danger:'#ef4444', dangerHover:'#dc2626', warning:'#fbbf24',
  inputBg:'#041220', inputText:'#e0f0ff',
  focusRing:'#38bdf8', shadow:'rgba(10,50,120,0.5)',
  scrollTrack:'#020a18', scrollThumb:'#0f3060',
};

const OG: ThemeTokens = {
  bg:'#2c3540', bgElevated:'#3d4f5f', bgPanel:'#354555',
  text:'#ffffff', textMuted:'#aabbcc', border:'#4a5f70',
  primary:'#6fc53a', primaryHover:'#5ba52e',
  danger:'#b91c1c', dangerHover:'#991b1b', warning:'#fbbf24',
  inputBg:'#2c3540', inputText:'#ffffff',
  focusRing:'#6fc53a', shadow:'rgba(0,0,0,0.3)',
  scrollTrack:'#2c3540', scrollThumb:'#4a5f70',
};

const THEMES: Record<string, ThemeTokens> = { og: OG, dark: DARK, light: LIGHT, morado: MORADO, black: BLACK, blue: BLUE };
function getTokens(theme: string): ThemeTokens { return THEMES[theme] || DARK; }

function buildTokenCSS(t: ThemeTokens): string {
  return `:root{`
    +`--app-bg:${t.bg};--app-bg-elevated:${t.bgElevated};--app-bg-panel:${t.bgPanel};`
    +`--app-text:${t.text};--app-text-muted:${t.textMuted};--app-border:${t.border};`
    +`--app-primary:${t.primary};--app-primary-hover:${t.primaryHover};`
    +`--app-danger:${t.danger};--app-danger-hover:${t.dangerHover};--app-warning:${t.warning};`
    +`--app-input-bg:${t.inputBg};--app-input-text:${t.inputText};`
    +`--app-focus-ring:${t.focusRing};--app-shadow:${t.shadow};`
    +`--app-scrollbar-track:${t.scrollTrack};--app-scrollbar-thumb:${t.scrollThumb};`
  +`}`;
}

// ===== GAME CSS (references CSS vars — theme-independent) =====
// SAFE elements only. NEVER sets background on game overlays.
const GAME_CSS = `
body{background:var(--app-bg)!important;color:var(--app-text)!important;
  background-image:radial-gradient(circle,color-mix(in srgb,var(--app-primary) 5%,transparent) 1px,transparent 1px)!important;
  background-size:45px 45px!important;}

h1,h2,h3,h4,h5,h6{color:var(--app-primary)!important;}
label,p,span,a,li,td,th,small,em,strong,b,i{color:var(--app-text)!important;}
a{color:var(--app-primary)!important;}
::placeholder{color:var(--app-text-muted)!important;}
button *{color:inherit!important;}
[class*="admin"],[class*="admin"] span{color:var(--app-primary)!important;}

input,select,textarea{background:var(--app-input-bg)!important;color:var(--app-input-text)!important;border:1px solid var(--app-border)!important;border-radius:3px!important;}
input:focus,select:focus,textarea:focus{border-color:var(--app-focus-ring)!important;outline:none!important;}
select option{background:var(--app-input-bg)!important;color:var(--app-input-text)!important;}

button:not([data-hook="leave"]),input[type=button],input[type=submit]{
  background:var(--app-bg-elevated)!important;color:var(--app-primary)!important;border:1px solid var(--app-primary)!important;}
button:not([data-hook="leave"]):hover,input[type=button]:hover,input[type=submit]:hover{
  background:var(--app-primary)!important;color:var(--app-bg)!important;}

.dialog{background-color:var(--app-bg-panel)!important;border:1px solid var(--app-primary)!important;box-shadow:0 0 20px var(--app-shadow)!important;}
.settings-view{background-color:var(--app-bg-panel)!important;}

table{border-collapse:collapse!important;}
table tr{background:transparent!important;}
table tr:hover{background:color-mix(in srgb,var(--app-primary) 7%,transparent)!important;}
table tr.selected{background:color-mix(in srgb,var(--app-primary) 16%,transparent)!important;}
table tr.xup-is-fav{background:color-mix(in srgb,var(--app-primary) 5%,transparent)!important;border-left:2px solid var(--app-primary)!important;}
table tr.xup-is-fav [data-hook="name"]{color:var(--app-primary)!important;}

[class*="player-list-item"]{background:transparent!important;border:none!important;border-radius:0!important;margin:0!important;padding:2px 4px!important;}

[class*="team-red"] span:first-child,[class*="red"] > span:first-child{color:#ef4444!important;}
[class*="team-blue"] span:first-child,[class*="blue"] > span:first-child{color:#3b82f6!important;}

button[data-hook="leave"]{background:var(--app-bg-elevated)!important;color:var(--app-danger)!important;border:1px solid var(--app-danger)!important;}
button[data-hook="leave"]:hover{background:var(--app-danger)!important;color:#fff!important;}

button[disabled],button.disabled{opacity:0.4!important;cursor:not-allowed!important;}

.tabs button{background:var(--app-bg)!important;color:var(--app-text-muted)!important;border:1px solid var(--app-border)!important;}
.tabs button:hover,.tabs button.selected{background:var(--app-bg-elevated)!important;color:var(--app-primary)!important;border-color:var(--app-primary)!important;}

::-webkit-scrollbar{width:6px;background:var(--app-scrollbar-track);}
::-webkit-scrollbar-thumb{background:var(--app-scrollbar-thumb);border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:var(--app-primary);}

canvas{border-radius:4px!important;}

.inputrow{border-bottom:1px solid var(--app-border)!important;padding:6px 0!important;}
.inputrow > :first-child{color:var(--app-text)!important;font-weight:700!important;}
hr{border-color:var(--app-border)!important;background:var(--app-border)!important;}

`;

/* === TRANSPARENCY CSS (separate from GAME_CSS so it works in OG theme too) ===
   Chat: rgba only, NO blur — keeps text readable without blurring the canvas.
   Room menu: Glass UI with subtle blur ONLY on .top-section header bar.
   .buttons gets rgba only. Never blurs .gameplay-section or canvas. */
const TRANSPARENCY_CSS = `
/* Chat: panel + children go transparent, text stays readable */
html[data-hbx-transparent-chat="true"] .bottom-section,
html[data-hbx-transparent-chat="true"] .bottom-section *:not(button):not(input):not(select):not(textarea){
  background-color:transparent!important;}

/* Room menu: everything transparent, nothing added — just removes backgrounds.
   Buttons/inputs excluded so they keep their outlines.
   .gameplay-section (canvas) is a sibling, never matched. */
html[data-hbx-transparent-room-menu="true"] .top-section,
html[data-hbx-transparent-room-menu="true"] .top-section *:not(button):not(input):not(select):not(textarea),
html[data-hbx-transparent-room-menu="true"] .buttons,
html[data-hbx-transparent-room-menu="true"] .buttons *:not(button):not(input):not(select):not(textarea){
  background-color:transparent!important;}

/* Scoreboard: .bar is the card containing scoreboard + timer.
   Only .bar background is removed. Children (.teamicon, .score,
   .game-timer-view, .digit) keep their own styles untouched. */
html[data-hbx-transparent-scoreboard="true"] .bar{
  background-color:transparent!important;box-shadow:none!important;border-color:transparent!important;}
`;

// ===== XUP CUSTOM ELEMENTS CSS =====
const XUP_CSS = `
.xup-search-bar{background:var(--app-bg-elevated)!important;border:1px solid var(--app-border)!important;border-radius:6px!important;}
.xup-search-bar input[type=text]{background:var(--app-input-bg)!important;color:var(--app-input-text)!important;border:1px solid var(--app-border)!important;}
.xup-search-bar input[type=text]:focus{border-color:var(--app-focus-ring)!important;}
.xup-search-bar input[type=text]::placeholder{color:var(--app-text-muted)!important;}
.xup-country-menu{background:var(--app-bg-elevated)!important;border:1px solid var(--app-primary)!important;box-shadow:0 4px 12px var(--app-shadow)!important;}
.xup-country-opt{color:var(--app-text)!important;}
.xup-country-opt:hover{background:color-mix(in srgb,var(--app-primary) 10%,transparent)!important;color:var(--app-primary)!important;}
.xup-country-opt.active{color:var(--app-primary)!important;}
.xup-country-btn{background:var(--app-bg-elevated)!important;border:1px solid var(--app-primary)!important;color:var(--app-primary)!important;}
.xup-action-btns{background:transparent!important;border:none!important;}
.xup-action-btn{background:var(--app-bg-elevated)!important;color:var(--app-primary)!important;border:1px solid var(--app-primary)!important;}
.xup-action-btn:hover{background:var(--app-primary)!important;color:var(--app-bg)!important;}
.xup-action-btn.xup-fav-active{background:var(--app-primary)!important;color:var(--app-bg)!important;border-color:var(--app-primary)!important;}
.xup-fps{background:var(--app-bg)!important;color:var(--app-primary)!important;border:1px solid var(--app-primary)!important;box-shadow:0 0 8px var(--app-shadow)!important;}
.xup-separator{border-top:2px solid var(--app-primary)!important;margin-top:12px!important;padding-top:10px!important;border-bottom:none!important;}
.xup-separator-label{color:var(--app-primary)!important;font-weight:700!important;font-size:13px!important;}
.xup-note{color:var(--app-text-muted)!important;font-weight:normal!important;font-size:10px!important;}
.xup-chk{accent-color:var(--app-primary)!important;}
.xup-version{color:var(--app-text-muted)!important;font-size:11px!important;font-weight:normal!important;}
.xup-restart{color:var(--app-warning)!important;}
.xup-credit{text-align:center;font-size:11px;color:var(--app-text-muted)!important;padding:6px 0 2px;font-style:italic;letter-spacing:0.5px;}
.xup-color-row{display:flex;gap:6px;align-items:center;}
.xup-swatch{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid transparent;box-sizing:border-box;flex-shrink:0;transition:border-color .15s,box-shadow .15s;}
.xup-swatch:hover{border-color:var(--app-text-muted);}
.xup-swatch.active{border-color:var(--app-primary)!important;box-shadow:0 0 6px color-mix(in srgb,var(--app-primary) 50%,transparent);}
.xup-swatch-none{background:var(--app-bg-elevated);position:relative;overflow:hidden;}
.xup-swatch-none::after{content:'';position:absolute;top:50%;left:-2px;right:-2px;height:2px;background:var(--app-danger);transform:rotate(-45deg);}
.xup-color-input{width:24px;height:24px;padding:0;border:2px solid var(--app-border);border-radius:50%;cursor:pointer;background:transparent;-webkit-appearance:none;overflow:hidden;flex-shrink:0;}
.xup-color-input::-webkit-color-swatch-wrapper{padding:0;}
.xup-color-input::-webkit-color-swatch{border:none;border-radius:50%;}
`;

// ===== CANVAS COLOR OVERRIDE SCRIPT =====
// Injected into game iframe's page context to intercept Canvas2D rendering.
// Replaces ball disc fills and field background fills with user-chosen colors.
const CANVAS_OVERRIDE_SCRIPT = `(function(){
if(window.__hbxCP)return;window.__hbxCP=true;
var cfg={ballColor:null,fieldColor:null};
function readCfg(){
  try{var r=document.documentElement.getAttribute('data-hbx-colors');
  cfg=r?JSON.parse(r):{ballColor:null,fieldColor:null};}catch(e){}}
readCfg();
new MutationObserver(function(m){
  for(var i=0;i<m.length;i++)if(m[i].attributeName==='data-hbx-colors'){readCfg();break;}
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-hbx-colors']});
var P=CanvasRenderingContext2D.prototype;
var oFR=P.fillRect,oF=P.fill,oA=P.arc,oBP=P.beginPath;
var gc=null,hfa=false,bd=false;
function isGC(c){if(!c||!c.canvas)return false;
  if(c.canvas.width>100&&c.canvas.height>100){gc=c.canvas;return true;}return false;}
function isPat(v){return v!==null&&typeof v==='object';}
var _raf=window.requestAnimationFrame;
window.requestAnimationFrame=function(cb){return _raf.call(window,function(ts){bd=false;return cb(ts);});};
P.fillRect=function(x,y,w,h){try{if(cfg.fieldColor&&isGC(this)){
  if(x<=0&&y<=0&&w>=this.canvas.width&&h>=this.canvas.height){
    var sv=this.fillStyle;this.fillStyle=cfg.fieldColor;
    oFR.call(this,x,y,w,h);this.fillStyle=sv;return;}
  if(isPat(this.fillStyle)){var sv=this.fillStyle;this.fillStyle=cfg.fieldColor;
    oFR.call(this,x,y,w,h);this.fillStyle=sv;return;}
}}catch(e){}return oFR.call(this,x,y,w,h);};
P.beginPath=function(){hfa=false;return oBP.call(this);};
P.arc=function(){try{if(arguments.length>=5&&Math.abs(arguments[4]-arguments[3])>6)hfa=true;}catch(e){}return oA.apply(this,arguments);};
P.fill=function(){try{if(isGC(this)){
  if(cfg.fieldColor&&!hfa&&isPat(this.fillStyle)){var sv=this.fillStyle;this.fillStyle=cfg.fieldColor;
    var r=oF.apply(this,arguments);this.fillStyle=sv;hfa=false;return r;}
  if(cfg.ballColor&&hfa&&!bd&&typeof this.fillStyle==='string'){var sv=this.fillStyle;this.fillStyle=cfg.ballColor;
    var r=oF.apply(this,arguments);this.fillStyle=sv;hfa=false;bd=true;return r;}
}}catch(e){}hfa=false;return oF.apply(this,arguments);};
})();`;

// Intercepts RTCDataChannel to spoof the ping value reported to the host.
// Protocol: client ping msg = type 2 on channel "uu" (unreliable/unordered).
// Layout: [0]=uint8(2), [1-8]=float64(timestamp), [9+]=varint(reported ping).
// The host trusts this self-reported varint and broadcasts it to all players.
const PING_OVERRIDE_SCRIPT = `(function(){
if(window.__hbxPing)return;window.__hbxPing=true;
var pingVal=null;
function readPing(){
  try{var v=document.documentElement.getAttribute('data-hbx-ping');
  pingVal=v?JSON.parse(v):null;}catch(e){pingVal=null;}}
readPing();
new MutationObserver(function(m){
  for(var i=0;i<m.length;i++)if(m[i].attributeName==='data-hbx-ping'){readPing();break;}
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-hbx-ping']});

function encodeVarint(n){
  var bytes=[];
  do{var b=n&0x7F;n>>>=7;if(n>0)b|=0x80;bytes.push(b);}while(n>0);
  return bytes;
}
function varintLen(u,off){
  var i=off;while(i<u.length&&(u[i]&0x80)!==0)i++;return i-off+1;
}

var oSend=RTCDataChannel.prototype.send;
RTCDataChannel.prototype.send=function(data){
  if(pingVal!==null&&this.label==='uu'&&data instanceof ArrayBuffer&&data.byteLength>=10){
    var u=new Uint8Array(data);
    if(u[0]===2){
      var origVarLen=varintLen(u,9);
      var newBytes=encodeVarint(pingVal);
      if(newBytes.length===origVarLen){
        for(var i=0;i<newBytes.length;i++)u[9+i]=newBytes[i];
      }else{
        var buf=new ArrayBuffer(9+newBytes.length);
        var nw=new Uint8Array(buf);
        for(var i=0;i<9;i++)nw[i]=u[i];
        for(var i=0;i<newBytes.length;i++)nw[9+i]=newBytes[i];
        return oSend.call(this,buf);
      }
    }
  }
  return oSend.apply(this,arguments);
};
})();`;

// ===== PROFILE CSS =====
const PROFILE_CSS = `
.xup-profile-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;}
.xup-profile-modal{position:relative;background:var(--app-bg-panel);border:1px solid var(--app-primary);border-radius:10px;padding:20px;max-width:480px;width:90%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 24px var(--app-shadow);color:var(--app-text);overflow:hidden;}
.xup-profile-modal h2{margin:0 0 8px;font-size:18px;color:var(--app-primary);}
.xup-profile-modal hr{border:none;border-top:2px solid var(--app-primary);margin:0 0 12px;}
.xup-profile-list{overflow-y:auto;flex:1;min-height:60px;margin-bottom:12px;}
.xup-profile-card{border:1px solid var(--app-border);border-radius:6px;padding:10px;margin-bottom:8px;position:relative;}
.xup-profile-card-name{font-weight:700;font-size:15px;color:var(--app-text);margin-bottom:4px;}
.xup-profile-field{font-size:11px;color:var(--app-text-muted);line-height:1.6;}
.xup-profile-field b{color:var(--app-text);font-weight:600;}
.xup-profile-badge{position:absolute;top:8px;right:8px;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;display:none;}
.xup-profile-badge.delete{background:var(--app-danger);color:#fff;}
.xup-profile-badge.save{background:var(--app-primary);color:var(--app-bg);}
.xup-profile-card-btns{display:flex;gap:5px;margin-top:6px;}
.xup-profile-card-btns button{padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--app-border);background:var(--app-bg-elevated);color:var(--app-text);}
.xup-profile-card-btns button:hover{border-color:var(--app-primary);color:var(--app-primary);}
.xup-profile-card-btns button.sel{background:var(--app-primary)!important;color:var(--app-bg)!important;border-color:var(--app-primary)!important;}
.xup-profile-modal-btns{display:flex;gap:8px;justify-content:center;}
.xup-profile-modal-btns button{padding:6px 16px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid var(--app-primary);background:var(--app-bg-elevated);color:var(--app-primary);}
.xup-profile-modal-btns button:hover{background:var(--app-primary);color:var(--app-bg);}
.xup-profile-close{position:absolute;top:8px;right:12px;background:none!important;border:none!important;color:var(--app-text-muted)!important;font-size:20px;cursor:pointer;font-weight:700;padding:0!important;}
.xup-profile-close:hover{color:var(--app-text)!important;}
.xup-profile-input-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.xup-profile-input-row label{flex:0 0 90px;font-weight:600;font-size:12px;color:var(--app-text);}
.xup-profile-input-row input{flex:1;padding:5px 8px;background:var(--app-input-bg);border:1px solid var(--app-border);border-radius:4px;color:var(--app-input-text);font-size:12px;outline:none;}
.xup-profile-input-row input:focus{border-color:var(--app-focus-ring);}
.xup-profile-toggle-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.xup-profile-toggle-row span{flex:0 0 90px;font-weight:600;font-size:12px;color:var(--app-text);}
.xup-profile-toggle-group{display:flex;gap:5px;}
.xup-profile-toggle-btn{padding:4px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--app-border);background:var(--app-bg-elevated);color:var(--app-text-muted);}
.xup-profile-toggle-btn.active{background:var(--app-primary);color:var(--app-bg);border-color:var(--app-primary);}
.xup-profile-toggle-btn:hover{border-color:var(--app-primary);}
.xup-profile-info{font-size:11px;color:var(--app-text-muted);margin-bottom:10px;line-height:1.5;}
`;

// ===== COUNTRY DATA =====
const CNAMES: Record<string,string> = {
  AR:'Argentina',BR:'Brasil',CL:'Chile',CO:'Colombia',MX:'México',PE:'Perú',
  UY:'Uruguay',VE:'Venezuela',EC:'Ecuador',PY:'Paraguay',BO:'Bolivia',
  US:'EE.UU.',CA:'Canadá',GB:'Reino Unido',ES:'España',FR:'Francia',
  DE:'Alemania',IT:'Italia',PT:'Portugal',NL:'Países Bajos',PL:'Polonia',
  RU:'Rusia',TR:'Turquía',SE:'Suecia',NO:'Noruega',DK:'Dinamarca',
  FI:'Finlandia',AT:'Austria',CH:'Suiza',GR:'Grecia',RO:'Rumania',
  HU:'Hungría',CZ:'Chequia',BG:'Bulgaria',HR:'Croacia',RS:'Serbia',
  UA:'Ucrania',IE:'Irlanda',JP:'Japón',KR:'Corea',CN:'China',
  IN:'India',AU:'Australia',NZ:'N. Zelanda',ZA:'Sudáfrica',EG:'Egipto',
  MA:'Marruecos',TN:'Túnez',DZ:'Argelia',SA:'Arabia S.',IL:'Israel',
  BE:'Bélgica',SK:'Eslovaquia',AE:'EAU',
};

const GEO_PRESETS: Record<string, { lat: number; lon: number }> = {
  AR:{lat:-34.6,lon:-58.4},BR:{lat:-23.5,lon:-46.6},CL:{lat:-33.4,lon:-70.6},
  CO:{lat:4.7,lon:-74.1},MX:{lat:19.4,lon:-99.1},PE:{lat:-12.0,lon:-77.0},
  UY:{lat:-34.9,lon:-56.2},VE:{lat:10.5,lon:-66.9},EC:{lat:-0.2,lon:-78.5},
  PY:{lat:-25.3,lon:-57.6},BO:{lat:-16.5,lon:-68.2},
  US:{lat:40.7,lon:-74.0},CA:{lat:43.7,lon:-79.4},GB:{lat:51.5,lon:-0.1},
  ES:{lat:40.4,lon:-3.7},FR:{lat:48.9,lon:2.3},DE:{lat:52.5,lon:13.4},
  IT:{lat:41.9,lon:12.5},PT:{lat:38.7,lon:-9.1},TR:{lat:41.0,lon:29.0},
  RU:{lat:55.8,lon:37.6},PL:{lat:52.2,lon:21.0},
};

// ===== PARENT PAGE =====
const PARENT_STRUCTURAL_CSS = `
.header{display:none!important;}
.rightbar{display:none!important;}
body{margin:0!important;padding:0!important;overflow:hidden!important;background:#0a0a0a!important;}
iframe.gameframe{position:fixed!important;top:0!important;left:0!important;width:100%!important;height:100vh!important;border:none!important;}
`;

const PARENT_COLOR_CSS = `
body{background:var(--app-bg)!important;}
.xup-link-toggle{position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:100000;padding:5px 16px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid var(--app-primary);background:var(--app-bg-elevated);color:var(--app-primary);font-family:sans-serif;backdrop-filter:blur(4px);}
.xup-link-toggle:hover{background:var(--app-primary);color:var(--app-bg);}
.xup-link-dropdown{position:fixed;top:34px;left:50%;transform:translateX(-50%);z-index:100000;background:var(--app-bg-elevated);border:1px solid var(--app-primary);border-radius:8px;padding:10px;display:none;box-shadow:0 4px 16px var(--app-shadow);width:400px;max-width:calc(100vw - 24px);backdrop-filter:blur(4px);}
.xup-link-dropdown.open{display:flex;gap:6px;align-items:center;}
.xup-link-dropdown input{flex:1;padding:6px 10px;background:var(--app-input-bg);border:1px solid var(--app-border);border-radius:4px;color:var(--app-input-text);font-size:13px;outline:none;font-family:sans-serif;}
.xup-link-dropdown input:focus{border-color:var(--app-focus-ring);}
.xup-link-dropdown input::placeholder{color:var(--app-text-muted);}
.xup-link-dropdown button{padding:6px 14px;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid var(--app-primary);background:var(--app-bg-elevated);color:var(--app-primary);white-space:nowrap;font-family:sans-serif;}
.xup-link-dropdown button:hover{background:var(--app-primary);color:var(--app-bg);}
.xup-link-dropdown button:disabled{opacity:.3;cursor:not-allowed;}
`;

// ===== UI CSS (layout only) =====
const UI_CSS = `
.xup-search-bar{display:flex!important;visibility:visible!important;opacity:1!important;gap:6px;align-items:center;padding:8px 10px;margin:0 0 6px;box-sizing:border-box;min-height:36px;position:relative;z-index:100;overflow:visible;width:100%;}
.xup-search-bar input[type=text]{flex:1;min-width:0;padding:6px 10px;border-radius:4px;font-size:13px;outline:none;font-family:inherit;box-sizing:border-box;height:30px;}
.xup-country-wrap{flex-shrink:0;}
.xup-search-bar input[type=text]:focus{outline:none;}
.xup-search-bar input[type=text]::placeholder{opacity:.5;}
.xup-country-btn{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:4px;font-size:12px;cursor:pointer;white-space:nowrap;}
.xup-country-menu{display:none;position:absolute;top:100%;left:0;border-radius:6px;max-height:250px;overflow-y:auto;z-index:9999;min-width:190px;margin-top:2px;}
.xup-country-menu.open{display:block;}
.xup-country-opt{display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap;}
.xup-action-btns{display:flex;gap:4px;margin-top:6px;width:100%;box-sizing:border-box;}
.xup-action-btn{padding:4px 0;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;flex:1;min-width:0;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.xup-action-btn:hover{opacity:.9;}
.xup-action-btn.active span{font-weight:900;}
.xup-fps{position:fixed;bottom:8px;right:10px;font-size:12px;font-weight:700;padding:4px 10px;border-radius:5px;z-index:9999;pointer-events:none;font-variant-numeric:tabular-nums;}
.xup-restart{font-size:11px;margin-top:4px;display:none;text-align:center;}
.xup-restart.show{display:block;}
`;

// ===== HELPERS =====
function loadFavorites(): void {
  try { favorites = JSON.parse(localStorage.getItem('fav_rooms') || '[]'); }
  catch { favorites = []; }
}

function injectCanvasOverrides(): void {
  if (!gameDoc || gameDoc.querySelector('#hbx-canvas-override')) return;
  const s = gameDoc.createElement('script');
  s.id = 'hbx-canvas-override';
  s.textContent = CANVAS_OVERRIDE_SCRIPT;
  gameDoc.head.appendChild(s);
}

function injectPingOverride(): void {
  if (!gameDoc || gameDoc.querySelector('#hbx-ping-override')) return;
  const s = gameDoc.createElement('script');
  s.id = 'hbx-ping-override';
  s.textContent = PING_OVERRIDE_SCRIPT;
  gameDoc.head.appendChild(s);
}

function pushPingOverride(): void {
  if (!gameDoc) return;
  gameDoc.documentElement.setAttribute('data-hbx-ping',
    pingOverride !== null ? JSON.stringify(pingOverride) : 'null');
}

function pushCanvasColors(): void {
  if (!gameDoc) return;
  gameDoc.documentElement.setAttribute('data-hbx-colors',
    JSON.stringify({ ballColor, fieldColor }));
}

// ===== PARENT PAGE =====
function cleanParentPage(): void {
  const s = document.createElement('style');
  s.textContent = PARENT_STRUCTURAL_CSS;
  document.head.appendChild(s);
}

function applyParentTheme(t: ThemeTokens): void {
  if (parentThemeEl) parentThemeEl.remove();
  parentThemeEl = document.createElement('style');
  parentThemeEl.id = 'xup-parent-theme';
  parentThemeEl.textContent = buildTokenCSS(t) + PARENT_COLOR_CSS;
  document.head.appendChild(parentThemeEl);
}

function injectLinkBar(): void {
  if (document.querySelector('.xup-link-toggle')) return;
  const toggle = document.createElement('button');
  toggle.className = 'xup-link-toggle';
  toggle.textContent = 'Ingresar Link';
  const dropdown = document.createElement('div');
  dropdown.className = 'xup-link-dropdown';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Pegar link de sala Haxball...';
  const goBtn = document.createElement('button');
  goBtn.textContent = 'Ir';
  goBtn.disabled = true;
  function isValid(url: string): boolean {
    try { const u = new URL(url.trim()); return (u.hostname === 'www.haxball.com' || u.hostname === 'haxball.com') && u.pathname.startsWith('/play'); }
    catch { return false; }
  }
  input.addEventListener('input', () => { goBtn.disabled = !isValid(input.value); });
  goBtn.addEventListener('click', () => { if (isValid(input.value)) window.location.href = input.value.trim(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !goBtn.disabled) goBtn.click(); });
  toggle.addEventListener('click', () => {
    const open = !dropdown.classList.contains('open');
    dropdown.classList.toggle('open', open);
    toggle.textContent = open ? 'Ocultar' : 'Ingresar Link';
    if (open) setTimeout(() => input.focus(), 50);
  });
  dropdown.appendChild(input);
  dropdown.appendChild(goBtn);
  document.body.appendChild(toggle);
  document.body.appendChild(dropdown);
}

// ===== FIND GAME DOC =====
function findGameDoc(): void {
  const poll = setInterval(() => {
    const iframe = document.querySelector('iframe.gameframe') as HTMLIFrameElement | null;
    if (iframe) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc?.body) { clearInterval(poll); gameDoc = doc; boot(); return; }
      } catch {}
    }
    if (document.querySelector('[data-hook="list"]') || document.querySelector('[data-hook="nick"]')) {
      clearInterval(poll); gameDoc = document; boot();
    }
  }, 400);
}

async function boot(): Promise<void> {
  if (!gameDoc) return;

  const cfg = await ipcRenderer.invoke('config:get');
  const profiles = cfg.profiles || [];
  currentProfileId = localStorage.getItem('current_profile') || 'default';
  localStorage.setItem('current_profile', currentProfileId);

  if (!sessionStorage.getItem('profileInitialized')) {
    sessionStorage.setItem('profileInitialized', 'true');
    const prof = profiles.find((p: any) => p.id === currentProfileId) || profiles[0];
    if (prof) {
      if (prof.autosave) {
        await exportCurrentProfile();
        PROFILE_KEYS.forEach(key => {
          if (localStorage.getItem(key) === null && prof[key] !== null && prof[key] !== undefined) {
            localStorage.setItem(key, (key === 'geo_override' || key === 'fav_rooms') ? JSON.stringify(prof[key]) : prof[key]);
          }
        });
      } else {
        loadProfileToLocalStorage(prof);
      }
    }
    location.reload();
    return;
  }

  const s = gameDoc.createElement('style');
  s.textContent = UI_CSS + PROFILE_CSS;
  s.id = 'xup-ui-css';
  gameDoc.head.appendChild(s);

  currentTheme = cfg.theme && cfg.theme in THEMES ? cfg.theme : 'dark';
  applyTheme(currentTheme);
  applyTransparency(!!cfg.transparentChat, !!cfg.transparentRoomMenu, !!cfg.transparentScoreboard);
  cachedShortcuts = cfg.shortcuts || [];

  injectCanvasOverrides();
  ballColor = cfg.ballColor || null;
  fieldColor = cfg.fieldColor || null;
  pushCanvasColors();

  injectPingOverride();
  pingOverride = cfg.pingOverride ?? null;
  pushPingOverride();

  let viewCheckTimer: ReturnType<typeof setTimeout> | null = null;
  const obs = new MutationObserver(() => {
    if (viewCheckTimer) return;
    viewCheckTimer = setTimeout(() => {
      viewCheckTimer = null;
      detectView();
      tryInjectSettings();
      tryInjectCredit();
    }, 300);
  });
  obs.observe(gameDoc.body, { childList: true, subtree: true });
  detectView();
}

// ===== THEME =====
function applyTheme(name: string): void {
  const t = getTokens(name);
  currentTheme = name;

  document.documentElement.setAttribute('data-theme', name);
  applyParentTheme(t);

  if (!gameDoc) return;
  gameDoc.documentElement.setAttribute('data-theme', name);
  if (themeStyleEl) themeStyleEl.remove();
  themeStyleEl = gameDoc.createElement('style');
  themeStyleEl.id = 'xup-theme';
  themeStyleEl.textContent = buildTokenCSS(t) + (name === 'og' ? '' : GAME_CSS) + TRANSPARENCY_CSS + XUP_CSS;
  gameDoc.head.appendChild(themeStyleEl);
}

function applyTransparency(chat: boolean, roomMenu: boolean, scoreboard: boolean): void {
  if (!gameDoc) return;
  gameDoc.documentElement.setAttribute('data-hbx-transparent-chat', String(chat));
  gameDoc.documentElement.setAttribute('data-hbx-transparent-room-menu', String(roomMenu));
  gameDoc.documentElement.setAttribute('data-hbx-transparent-scoreboard', String(scoreboard));
}

// ===== CREDIT =====
function tryInjectCredit(): void {
  if (!gameDoc) return;
  if (gameDoc.querySelector('.xup-credit')) return;
  const nickDialog = gameDoc.querySelector('.dialog:has(.label-input)') as HTMLElement | null;
  if (!nickDialog) return;
  const heading = nickDialog.querySelector('h1');
  if (!heading) return;
  const credit = gameDoc.createElement('div');
  credit.className = 'xup-credit';
  credit.textContent = 'Hecho por Lucho/Visionario';
  heading.after(credit);
}

// ===== VIEW DETECTION =====
function detectView(): void {
  if (!gameDoc) return;
  const listEl = gameDoc.querySelector('.roomlist-view [data-hook="list"]') as HTMLElement | null;
  const topSection = gameDoc.querySelector('.top-section');
  let newView: typeof currentView;
  if (topSection) newView = 'inroom';
  else if (listEl) newView = 'roomlist';
  else newView = 'other';

  const uiMissing = currentView === 'roomlist' && newView === 'roomlist' && !gameDoc.querySelector('.xup-search-bar');
  if (newView === currentView && !uiMissing) return;
  cleanup();
  currentView = newView;
  if (currentView === 'roomlist' && listEl) { loadFavorites(); injectRoomUI(listEl); }
  if (currentView === 'inroom') setupChatShortcuts();
  if (currentView === 'roomlist') ipcRenderer.send('discord:update-rpc', 'En la lista de salas');
  else if (currentView === 'inroom') ipcRenderer.send('discord:update-rpc', 'Jugando en una sala');
  manageFpsCounter();
}

function cleanup(): void {
  if (!gameDoc) return;
  gameDoc.querySelectorAll('.xup-search-bar,.xup-action-btns,.xup-country-menu').forEach(el => el.remove());
  if (roomTableObserver) { roomTableObserver.disconnect(); roomTableObserver = null; }
  searchValue = ''; countryFilter = ''; showingFavs = false;
}

// ===== ROOM LIST UI =====
function injectRoomUI(table: HTMLElement): void {
  if (!gameDoc) return;
  const parent = table.parentElement!;

  const bar = gameDoc.createElement('div');
  bar.className = 'xup-search-bar';
  const search = gameDoc.createElement('input');
  search.type = 'text';
  search.placeholder = 'Buscar sala...';
  search.addEventListener('input', () => { searchValue = search.value.toLowerCase().trim(); filterRooms(table); });

  const countryWrap = gameDoc.createElement('div');
  countryWrap.className = 'xup-country-wrap';
  const countryBtn = gameDoc.createElement('button');
  countryBtn.className = 'xup-country-btn';
  countryBtn.innerHTML = 'Todos';
  const countryMenu = gameDoc.createElement('div');
  countryMenu.className = 'xup-country-menu';
  countryBtn.addEventListener('click', (e) => { e.stopPropagation(); countryMenu.classList.toggle('open'); });
  gameDoc.addEventListener('click', () => countryMenu.classList.remove('open'));
  countryMenu.addEventListener('click', (e) => e.stopPropagation());
  countryWrap.appendChild(countryBtn);
  countryWrap.appendChild(countryMenu);

  bar.appendChild(search);
  bar.appendChild(countryWrap);
  parent.insertBefore(bar, table);

  const btnRow = gameDoc.createElement('div');
  btnRow.className = 'xup-action-btns';

  const favAddBtn = gameDoc.createElement('button');
  favAddBtn.className = 'xup-action-btn';
  favAddBtn.textContent = '★ Favorito';
  favAddBtn.addEventListener('click', () => {
    const sel = table.querySelector('tr.selected [data-hook="name"]');
    if (!sel) return;
    const name = sel.textContent || '';
    const idx = favorites.indexOf(name);
    if (idx === -1) favorites.push(name);
    else favorites.splice(idx, 1);
    localStorage.setItem('fav_rooms', JSON.stringify(favorites));
    favAddBtn.textContent = favorites.includes(name) ? '★ En Favs' : '★ Favorito';
    filterRooms(table);
  });

  const favShowBtn = gameDoc.createElement('button');
  favShowBtn.className = 'xup-action-btn';
  favShowBtn.textContent = 'Fav. Rooms';
  favShowBtn.addEventListener('click', () => {
    showingFavs = !showingFavs;
    favShowBtn.classList.toggle('xup-fav-active', showingFavs);
    filterRooms(table);
  });

  const profileBtn = gameDoc.createElement('button');
  profileBtn.className = 'xup-action-btn';
  profileBtn.textContent = 'Perfiles';
  profileBtn.addEventListener('click', () => openProfileManager());

  btnRow.appendChild(favAddBtn);
  btnRow.appendChild(favShowBtn);
  btnRow.appendChild(profileBtn);
  parent.insertBefore(btnRow, table);

  table.addEventListener('click', () => {
    setTimeout(() => {
      const sel = table.querySelector('tr.selected [data-hook="name"]');
      if (sel) favAddBtn.textContent = favorites.includes(sel.textContent || '') ? '★ En Favs' : '★ Favorito';
    }, 50);
  });

  roomTableObserver = new MutationObserver(() => { buildCountryMenu(table, countryMenu, countryBtn); filterRooms(table); });
  roomTableObserver.observe(table, { childList: true });
  buildCountryMenu(table, countryMenu, countryBtn);
}

function buildCountryMenu(table: HTMLElement, menu: HTMLElement, trigger: HTMLElement): void {
  if (!gameDoc) return;
  const codes = new Set<string>();
  table.querySelectorAll('[data-hook="flag"]').forEach(el => {
    const cls = Array.from(el.classList).find(c => c.startsWith('f-'));
    if (cls) codes.add(cls.substring(2));
  });
  const sorted = [...codes].sort((a, b) => (CNAMES[a.toUpperCase()]||a).localeCompare(CNAMES[b.toUpperCase()]||b));
  menu.innerHTML = '';
  const allOpt = gameDoc.createElement('div');
  allOpt.className = 'xup-country-opt' + (!countryFilter ? ' active' : '');
  allOpt.textContent = 'Todos';
  allOpt.addEventListener('click', () => {
    countryFilter = '';
    trigger.innerHTML = 'Todos';
    menu.classList.remove('open');
    filterRooms(table);
  });
  menu.appendChild(allOpt);
  for (const code of sorted) {
    const opt = gameDoc.createElement('div');
    opt.className = 'xup-country-opt' + (countryFilter === code ? ' active' : '');
    const flag = gameDoc.createElement('span');
    flag.className = `flagico f-${code}`;
    opt.appendChild(flag);
    opt.appendChild(gameDoc.createTextNode(' ' + (CNAMES[code.toUpperCase()] || code.toUpperCase())));
    opt.addEventListener('click', () => {
      countryFilter = code;
      trigger.innerHTML = '';
      const tf = gameDoc!.createElement('span');
      tf.className = `flagico f-${code}`;
      trigger.appendChild(tf);
      trigger.appendChild(gameDoc!.createTextNode(' ' + (CNAMES[code.toUpperCase()] || code.toUpperCase())));
      menu.classList.remove('open');
      filterRooms(table);
    });
    menu.appendChild(opt);
  }
}

function filterRooms(table: HTMLElement): void {
  table.querySelectorAll('tr').forEach(row => {
    const nameEl = row.querySelector('[data-hook="name"]');
    if (!nameEl) return;
    const name = (nameEl.textContent || '').toLowerCase();
    const flagEl = row.querySelector('[data-hook="flag"]');
    const flagCls = flagEl ? Array.from(flagEl.classList).find(c => c.startsWith('f-')) : null;
    const country = flagCls ? flagCls.substring(2) : '';
    const rName = nameEl.textContent || '';
    const isFav = favorites.includes(rName);
    let show = true;
    if (searchValue && !name.includes(searchValue)) show = false;
    if (countryFilter && country !== countryFilter) show = false;
    if (showingFavs && !isFav) show = false;
    (row as HTMLElement).style.display = show ? '' : 'none';
    row.classList.toggle('xup-is-fav', isFav);
  });
}

// ===== SETTINGS INJECTION =====
function tryInjectSettings(): void {
  if (!gameDoc) return;
  const dialog = gameDoc.querySelector('.settings-view');
  if (!dialog || dialog.querySelector('.xup-injected')) return;

  const tabs = dialog.querySelectorAll('.tabs button');
  let videoTab: Element | null = null;
  tabs.forEach(tab => {
    if ((tab as HTMLElement).textContent?.trim().toLowerCase() === 'video') videoTab = tab;
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      setTimeout(() => {
        const section = dialog.querySelector('.section');
        if (!section) return;
        if ((tab as HTMLElement).textContent?.trim().toLowerCase() === 'video' && !section.querySelector('.xup-injected')) {
          addXupiscoRows(section);
        }
      }, 50);
    });
  });

  const section = dialog.querySelector('.section');
  if (section) {
    const activeTab = dialog.querySelector('.tabs button.selected') as HTMLElement | null;
    if (activeTab?.textContent?.trim().toLowerCase() === 'video') {
      addXupiscoRows(section);
    } else if (videoTab) {
      (videoTab as HTMLElement).click();
      setTimeout(() => {
        const sec = dialog.querySelector('.section');
        if (sec && !sec.querySelector('.xup-injected')) addXupiscoRows(sec);
      }, 100);
    }
  }
}

function addXupiscoRows(section: Element): void {
  if (!gameDoc) return;

  const marker = gameDoc.createElement('div');
  marker.className = 'xup-injected';
  marker.style.display = 'none';
  section.appendChild(marker);

  const sep = gameDoc.createElement('div');
  sep.className = 'inputrow xup-separator';
  const sepLabel = gameDoc.createElement('span');
  sepLabel.className = 'xup-separator-label';
  sepLabel.textContent = '⚡ Xupisco Hax';
  sep.appendChild(sepLabel);
  section.appendChild(sep);

  function makeRow(label: string, control: HTMLElement, note?: string): void {
    const row = gameDoc!.createElement('div');
    row.className = 'inputrow';
    const lbl = gameDoc!.createElement('span');
    lbl.textContent = label;
    if (note) {
      const sm = gameDoc!.createElement('small');
      sm.className = 'xup-note';
      sm.textContent = ' ' + note;
      lbl.appendChild(sm);
    }
    row.appendChild(lbl);
    row.appendChild(control);
    section.appendChild(row);
  }

  function makeChk(key: string, onChange?: (v: boolean) => void): HTMLInputElement {
    const chk = gameDoc!.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'xup-chk';
    chk.style.cssText = 'width:18px;height:18px;cursor:pointer;';
    ipcRenderer.invoke('config:get').then((c: any) => { chk.checked = c[key]; });
    chk.addEventListener('change', () => {
      const o: Record<string,unknown> = {};
      o[key] = chk.checked;
      ipcRenderer.invoke('config:set', o);
      if (onChange) onChange(chk.checked);
    });
    return chk;
  }

  const sel = gameDoc.createElement('select');
  sel.className = 'xup-chk';
  sel.style.cssText = 'padding:4px 8px;font-size:12px;cursor:pointer;';
  const THEME_LABELS: Record<string,string> = { og:'HaxBall OG', dark:'Dark', light:'Light', morado:'Morado', black:'Black', blue:'Blue' };
  Object.keys(THEMES).forEach(name => {
    const opt = gameDoc!.createElement('option');
    opt.value = name;
    opt.textContent = THEME_LABELS[name] || name;
    if (name === currentTheme) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    ipcRenderer.invoke('config:set', { theme: sel.value });
    applyTheme(sel.value);
  });
  makeRow('Tema', sel);

  makeRow('FPS ilimitados', makeChk('unlimitedFps'), '(reiniciar)');
  makeRow('Mostrar FPS', makeChk('showLocalMetrics', (v) => { fpsOn = v; manageFpsCounter(); }));
  makeRow('Siempre visible', makeChk('alwaysOnTop'));

  const pingWrap = gameDoc.createElement('div');
  pingWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const pingChk = gameDoc.createElement('input') as HTMLInputElement;
  pingChk.type = 'checkbox';
  pingChk.className = 'xup-chk';
  pingChk.style.cssText = 'width:18px;height:18px;cursor:pointer;';
  pingChk.checked = pingOverride !== null;
  const pingInput = gameDoc.createElement('input') as HTMLInputElement;
  pingInput.type = 'number';
  pingInput.min = '-999999999';
  pingInput.max = '999999999';
  pingInput.style.cssText = 'width:100px;padding:3px 6px;font-size:12px;';
  pingInput.value = pingOverride !== null ? String(pingOverride) : '20';
  pingInput.disabled = pingOverride === null;
  function applyPingOverride(): void {
    const val = pingChk.checked ? Math.max(-999999999, Math.min(999999999, parseInt(pingInput.value) || 0)) : null;
    pingOverride = val;
    ipcRenderer.invoke('config:set', { pingOverride: val });
    pushPingOverride();
    pingInput.disabled = !pingChk.checked;
  }
  pingChk.addEventListener('change', applyPingOverride);
  pingInput.addEventListener('change', applyPingOverride);
  pingWrap.appendChild(pingChk);
  pingWrap.appendChild(pingInput);
  makeRow('Override ping', pingWrap);
  function getTranspState(): [boolean,boolean,boolean] {
    const h = gameDoc?.documentElement;
    return [h?.getAttribute('data-hbx-transparent-chat')==='true',h?.getAttribute('data-hbx-transparent-room-menu')==='true',h?.getAttribute('data-hbx-transparent-scoreboard')==='true'];
  }
  makeRow('Chat transparente', makeChk('transparentChat', (v) => { const s=getTranspState(); applyTransparency(v,s[1],s[2]); }));
  makeRow('Menú sala transparente', makeChk('transparentRoomMenu', (v) => { const s=getTranspState(); applyTransparency(s[0],v,s[2]); }));
  makeRow('Scoreboard transparente', makeChk('transparentScoreboard', (v) => { const s=getTranspState(); applyTransparency(s[0],s[1],v); }));

  // -- Visual Customization --
  const vizSep = gameDoc!.createElement('div');
  vizSep.className = 'inputrow xup-separator';
  const vizLabel = gameDoc!.createElement('span');
  vizLabel.className = 'xup-separator-label';
  vizLabel.textContent = 'Visual';
  vizSep.appendChild(vizLabel);
  section.appendChild(vizSep);

  function makeColorRow(key: 'ballColor' | 'fieldColor'): HTMLElement {
    const wrap = gameDoc!.createElement('div');
    wrap.className = 'xup-color-row';
    let currentVal: string | null = key === 'ballColor' ? ballColor : fieldColor;

    function applyColor(val: string | null): void {
      if (key === 'ballColor') ballColor = val; else fieldColor = val;
      currentVal = val;
      const o: Record<string, unknown> = {};
      o[key] = val;
      ipcRenderer.invoke('config:set', o);
      pushCanvasColors();
      noSwatch.classList.toggle('active', val === null);
    }

    const noSwatch = gameDoc!.createElement('div');
    noSwatch.className = 'xup-swatch xup-swatch-none' + (currentVal === null ? ' active' : '');
    noSwatch.title = 'Default';
    noSwatch.addEventListener('click', () => { applyColor(null); colorInput.value = key === 'ballColor' ? '#ffffff' : '#3d6b35'; });
    wrap.appendChild(noSwatch);

    const colorInput = gameDoc!.createElement('input') as HTMLInputElement;
    colorInput.type = 'color';
    colorInput.className = 'xup-color-input';
    colorInput.value = currentVal || (key === 'ballColor' ? '#ffffff' : '#3d6b35');
    colorInput.title = 'Elegir color';
    colorInput.addEventListener('input', () => applyColor(colorInput.value));
    wrap.appendChild(colorInput);

    return wrap;
  }

  makeRow('Color pelota', makeColorRow('ballColor'));
  makeRow('Color cancha', makeColorRow('fieldColor'));

  // -- Discord RPC --
  const sepDiscord = gameDoc!.createElement('div');
  sepDiscord.className = 'inputrow xup-separator';
  const sepDiscordLbl = gameDoc!.createElement('span');
  sepDiscordLbl.className = 'xup-separator-label';
  sepDiscordLbl.textContent = 'Discord RPC';
  sepDiscord.appendChild(sepDiscordLbl);
  section.appendChild(sepDiscord);

  makeRow('Activar RPC', makeChk('discordRpc'), '(reiniciar)');

  const cidRow = gameDoc!.createElement('div');
  cidRow.className = 'inputrow';
  const cidLbl = gameDoc!.createElement('span');
  cidLbl.textContent = 'Client ID';
  const cidNote = gameDoc!.createElement('small');
  cidNote.className = 'xup-note';
  cidNote.textContent = ' (reiniciar)';
  cidLbl.appendChild(cidNote);
  const cidInput = gameDoc!.createElement('input');
  cidInput.type = 'text';
  cidInput.placeholder = 'Discord App Client ID';
  cidInput.style.cssText = 'width:180px;font-size:11px;padding:3px 6px;';
  ipcRenderer.invoke('config:get').then((c: any) => { cidInput.value = c.discordRpcClientId || ''; });
  cidInput.addEventListener('change', () => {
    ipcRenderer.invoke('config:set', { discordRpcClientId: cidInput.value.trim() });
  });
  cidRow.appendChild(cidLbl);
  cidRow.appendChild(cidInput);
  section.appendChild(cidRow);

  // -- Atajos de Chat --
  const sepShort = gameDoc!.createElement('div');
  sepShort.className = 'inputrow xup-separator';
  const sepShortLbl = gameDoc!.createElement('span');
  sepShortLbl.className = 'xup-separator-label';
  sepShortLbl.textContent = 'Atajos de Chat';
  sepShort.appendChild(sepShortLbl);
  section.appendChild(sepShort);

  const shortRow = gameDoc!.createElement('div');
  shortRow.className = 'inputrow';
  shortRow.style.cssText = 'display:flex;gap:6px;border-bottom:none;';
  const viewShBtn = gameDoc!.createElement('button');
  viewShBtn.textContent = 'Ver Atajos';
  viewShBtn.addEventListener('click', () => openShortcutsList());
  const addShBtn = gameDoc!.createElement('button');
  addShBtn.textContent = 'Crear Atajo';
  addShBtn.addEventListener('click', () => openShortcutCreator());
  shortRow.appendChild(viewShBtn);
  shortRow.appendChild(addShBtn);
  section.appendChild(shortRow);

  // -- Ubicación --
  const sepGeo = gameDoc!.createElement('div');
  sepGeo.className = 'inputrow xup-separator';
  const sepGeoLbl = gameDoc!.createElement('span');
  sepGeoLbl.className = 'xup-separator-label';
  sepGeoLbl.textContent = 'Ubicación';
  sepGeo.appendChild(sepGeoLbl);
  section.appendChild(sepGeo);

  const geoRow = gameDoc!.createElement('div');
  geoRow.className = 'inputrow';
  const geoLbl = gameDoc!.createElement('span');
  geoLbl.textContent = 'Override país';
  const geoSel = gameDoc!.createElement('select');
  geoSel.style.cssText = 'padding:3px 6px;font-size:12px;cursor:pointer;';
  const geoNone = gameDoc!.createElement('option');
  geoNone.value = '';
  geoNone.textContent = 'Desactivado';
  geoSel.appendChild(geoNone);
  Object.keys(GEO_PRESETS).sort((a, b) => (CNAMES[a]||a).localeCompare(CNAMES[b]||b)).forEach(code => {
    const opt = gameDoc!.createElement('option');
    opt.value = code;
    opt.textContent = CNAMES[code] || code;
    geoSel.appendChild(opt);
  });
  try {
    const g = JSON.parse(localStorage.getItem('geo_override') || 'null');
    if (g) geoSel.value = g.code?.toUpperCase() || '';
  } catch {}
  geoSel.addEventListener('change', () => {
    if (!geoSel.value) { localStorage.removeItem('geo_override'); return; }
    const p = GEO_PRESETS[geoSel.value];
    if (p) localStorage.setItem('geo_override', JSON.stringify({ lat: p.lat, lon: p.lon, code: geoSel.value.toLowerCase() }));
  });
  geoRow.appendChild(geoLbl);
  geoRow.appendChild(geoSel);
  section.appendChild(geoRow);

  // -- Auth --
  const sepAuth = gameDoc!.createElement('div');
  sepAuth.className = 'inputrow xup-separator';
  const sepAuthLbl = gameDoc!.createElement('span');
  sepAuthLbl.className = 'xup-separator-label';
  sepAuthLbl.textContent = 'Autenticación';
  sepAuth.appendChild(sepAuthLbl);
  section.appendChild(sepAuth);

  const authBtnRow = gameDoc!.createElement('div');
  authBtnRow.className = 'inputrow';
  authBtnRow.style.cssText = 'display:flex;gap:6px;border-bottom:none;';
  const vAuthBtn = gameDoc!.createElement('button');
  vAuthBtn.textContent = 'Ver Auth';
  vAuthBtn.addEventListener('click', () => openAuthView());
  const cAuthBtn = gameDoc!.createElement('button');
  cAuthBtn.textContent = 'Cambiar';
  cAuthBtn.addEventListener('click', () => openAuthImport());
  const rAuthBtn = gameDoc!.createElement('button');
  rAuthBtn.textContent = 'Resetear';
  rAuthBtn.style.cssText = 'border-color:var(--app-danger)!important;color:var(--app-danger)!important;';
  rAuthBtn.addEventListener('click', () => confirmResetAuth());
  authBtnRow.appendChild(vAuthBtn);
  authBtnRow.appendChild(cAuthBtn);
  authBtnRow.appendChild(rAuthBtn);
  section.appendChild(authBtnRow);

  // -- Backup --
  const sepBk = gameDoc!.createElement('div');
  sepBk.className = 'inputrow xup-separator';
  const sepBkLbl = gameDoc!.createElement('span');
  sepBkLbl.className = 'xup-separator-label';
  sepBkLbl.textContent = 'Backup';
  sepBk.appendChild(sepBkLbl);
  section.appendChild(sepBk);

  const bkRow = gameDoc!.createElement('div');
  bkRow.className = 'inputrow';
  bkRow.style.cssText = 'display:flex;gap:6px;border-bottom:none;';
  const expBtn = gameDoc!.createElement('button');
  expBtn.textContent = 'Exportar';
  expBtn.addEventListener('click', async () => {
    const r = await ipcRenderer.invoke('backup:export');
    expBtn.textContent = r.success ? 'Exportado!' : 'Error';
    setTimeout(() => { expBtn.textContent = 'Exportar'; }, 2000);
  });
  const impBtn = gameDoc!.createElement('button');
  impBtn.textContent = 'Importar';
  impBtn.addEventListener('click', async () => {
    const r = await ipcRenderer.invoke('backup:import');
    if (r.success) {
      impBtn.textContent = 'Reiniciando...';
      sessionStorage.removeItem('profileInitialized');
      localStorage.setItem('current_profile', 'default');
      setTimeout(() => ipcRenderer.send('app:restart'), 1500);
    } else {
      impBtn.textContent = 'Archivo inválido';
      setTimeout(() => { impBtn.textContent = 'Importar'; }, 2000);
    }
  });
  bkRow.appendChild(expBtn);
  bkRow.appendChild(impBtn);
  section.appendChild(bkRow);

  ipcRenderer.invoke('app:version').then((v: string) => {
    const row = gameDoc!.createElement('div');
    row.className = 'inputrow';
    const lbl = gameDoc!.createElement('span');
    lbl.className = 'xup-version';
    lbl.textContent = 'Versión';
    const val = gameDoc!.createElement('span');
    val.className = 'xup-version';
    val.textContent = `v${v}`;
    row.appendChild(lbl);
    row.appendChild(val);
    section.appendChild(row);
  });
}

// ===== FPS COUNTER =====
function manageFpsCounter(): void {
  if (!gameDoc) return;
  ipcRenderer.invoke('config:get').then((c: any) => {
    fpsOn = c.showLocalMetrics;
    if (fpsOn && !fpsEl) {
      fpsEl = gameDoc!.createElement('div');
      fpsEl.className = 'xup-fps';
      gameDoc!.body.appendChild(fpsEl);
      requestAnimationFrame(fpsLoop);
    }
    if (!fpsOn && fpsEl) { fpsEl.remove(); fpsEl = null; }
  });
}

function fpsLoop(): void {
  if (!fpsOn || !fpsEl) return;
  fpsCount++;
  const now = performance.now();
  if (now - fpsLast >= 1000) { fpsEl.textContent = `${fpsCount} FPS`; fpsCount = 0; fpsLast = now; }
  requestAnimationFrame(fpsLoop);
}

// ===== CHAT SHORTCUTS =====
function setupChatShortcuts(): void {
  if (!gameDoc || gameDoc.querySelector('[data-xup-shortcuts]')) return;
  const marker = gameDoc.createElement('div');
  marker.setAttribute('data-xup-shortcuts', 'true');
  marker.style.display = 'none';
  gameDoc.body.appendChild(marker);

  gameDoc.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches || !target.matches('[data-hook="input"]')) return;
    const input = target as HTMLInputElement;
    if (!input.value) return;
    for (const [trigger, replacement] of cachedShortcuts) {
      if (input.value === trigger || input.value.startsWith(trigger + ' ')) {
        input.value = replacement + input.value.substring(trigger.length).trimStart();
        break;
      }
    }
  }, true);
}

// ===== DIALOG HELPER =====
function createDialog(titleText: string): { overlay: HTMLElement; modal: HTMLElement; close: () => void } {
  gameDoc!.querySelectorAll('.xup-profile-overlay').forEach(el => el.remove());
  const overlay = gameDoc!.createElement('div');
  overlay.className = 'xup-profile-overlay';
  const modal = gameDoc!.createElement('div');
  modal.className = 'xup-profile-modal';
  const closeBtn = gameDoc!.createElement('button');
  closeBtn.className = 'xup-profile-close';
  closeBtn.innerHTML = '&times;';
  const title = gameDoc!.createElement('h2');
  title.textContent = titleText;
  const hr = gameDoc!.createElement('hr');
  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  modal.appendChild(closeBtn);
  modal.appendChild(title);
  modal.appendChild(hr);
  overlay.appendChild(modal);
  return { overlay, modal, close };
}

// ===== SHORTCUTS DIALOGS =====
async function openShortcutsList(): Promise<void> {
  if (!gameDoc) return;
  const cfg = await ipcRenderer.invoke('config:get');
  const shortcuts: [string, string][] = cfg.shortcuts || [];
  const { overlay, modal, close } = createDialog('Atajos de Chat');

  if (shortcuts.length === 0) {
    const empty = gameDoc.createElement('div');
    empty.className = 'xup-profile-info';
    empty.textContent = 'No hay atajos configurados.';
    modal.appendChild(empty);
  } else {
    const list = gameDoc.createElement('div');
    list.className = 'xup-profile-list';
    shortcuts.forEach(([trigger, replacement], i) => {
      const row = gameDoc!.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--app-border);';
      const text = gameDoc!.createElement('span');
      text.style.cssText = 'font-size:12px;color:var(--app-text);';
      text.innerHTML = `<b>${trigger}</b> &rarr; ${replacement}`;
      const delBtn = gameDoc!.createElement('button');
      delBtn.textContent = 'X';
      delBtn.style.cssText = 'padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid var(--app-danger);color:var(--app-danger);background:transparent;border-radius:3px;';
      delBtn.addEventListener('click', async () => {
        shortcuts.splice(i, 1);
        await ipcRenderer.invoke('config:set', { shortcuts });
        cachedShortcuts = shortcuts;
        close();
        openShortcutsList();
      });
      row.appendChild(text);
      row.appendChild(delBtn);
      list.appendChild(row);
    });
    modal.appendChild(list);
  }

  gameDoc.body.appendChild(overlay);
}

async function openShortcutCreator(): Promise<void> {
  if (!gameDoc) return;
  const cfg = await ipcRenderer.invoke('config:get');
  const shortcuts: [string, string][] = cfg.shortcuts || [];
  const { overlay, modal, close } = createDialog('Nuevo Atajo');

  const triggerRow = gameDoc.createElement('div');
  triggerRow.className = 'xup-profile-input-row';
  const triggerLbl = gameDoc.createElement('label');
  triggerLbl.textContent = 'Atajo:';
  const triggerInput = gameDoc.createElement('input');
  triggerInput.type = 'text';
  triggerInput.placeholder = 'Ej: /e';
  triggerInput.maxLength = 20;
  triggerRow.appendChild(triggerLbl);
  triggerRow.appendChild(triggerInput);
  modal.appendChild(triggerRow);

  const replRow = gameDoc.createElement('div');
  replRow.className = 'xup-profile-input-row';
  const replLbl = gameDoc.createElement('label');
  replLbl.textContent = 'Reemplazo:';
  const replInput = gameDoc.createElement('input');
  replInput.type = 'text';
  replInput.placeholder = 'Ej: /extrapolation ';
  replInput.maxLength = 100;
  replRow.appendChild(replLbl);
  replRow.appendChild(replInput);
  modal.appendChild(replRow);

  const btns = gameDoc.createElement('div');
  btns.className = 'xup-profile-modal-btns';
  btns.style.marginTop = '12px';
  const createBtn = gameDoc.createElement('button');
  createBtn.textContent = 'Crear';
  createBtn.style.opacity = '0.4';
  createBtn.style.cursor = 'not-allowed';
  let canCreate = false;
  function check() {
    canCreate = triggerInput.value.trim().length > 0 && replInput.value.length > 0;
    createBtn.style.opacity = canCreate ? '1' : '0.4';
    createBtn.style.cursor = canCreate ? 'pointer' : 'not-allowed';
  }
  triggerInput.addEventListener('input', check);
  replInput.addEventListener('input', check);
  createBtn.addEventListener('click', async () => {
    if (!canCreate) return;
    shortcuts.push([triggerInput.value.trim(), replInput.value]);
    await ipcRenderer.invoke('config:set', { shortcuts });
    cachedShortcuts = shortcuts;
    close();
  });
  btns.appendChild(createBtn);
  modal.appendChild(btns);
  gameDoc.body.appendChild(overlay);
}

// ===== AUTH MANAGEMENT =====
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function openAuthView(): void {
  if (!gameDoc) return;
  const authKey = localStorage.getItem('player_auth_key');
  if (!authKey) return;
  const publicAuth = authKey.split('.')[1] || '';
  const { overlay, modal } = createDialog('Tu Auth');

  function makeAuthRow(label: string, value: string): void {
    const row = gameDoc!.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--app-border);';
    const info = gameDoc!.createElement('div');
    info.style.cssText = 'font-size:12px;overflow:hidden;flex:1;';
    info.innerHTML = `<b>${label}:</b><br><span style="font-size:10px;word-break:break-all;color:var(--app-text-muted);">${value}</span>`;
    const copyBtn = gameDoc!.createElement('button');
    copyBtn.textContent = 'Copiar';
    copyBtn.style.cssText = 'flex-shrink:0;margin-left:8px;padding:3px 10px;font-size:11px;cursor:pointer;border:1px solid var(--app-primary);color:var(--app-primary);background:transparent;border-radius:3px;';
    copyBtn.addEventListener('click', async () => {
      await copyToClipboard(value);
      copyBtn.textContent = 'Copiado!';
      setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 1500);
    });
    row.appendChild(info);
    row.appendChild(copyBtn);
    modal.appendChild(row);
  }

  makeAuthRow('Auth pública', publicAuth);
  makeAuthRow('Clave privada', authKey);
  gameDoc.body.appendChild(overlay);
}

function openAuthImport(): void {
  if (!gameDoc) return;
  const { overlay, modal, close } = createDialog('Cambiar Auth');

  const info = gameDoc.createElement('div');
  info.className = 'xup-profile-info';
  info.textContent = 'Pegá tu clave de auth completa (formato: idkey.xxx.yyy.zzz).';
  modal.appendChild(info);

  const inputRow = gameDoc.createElement('div');
  inputRow.className = 'xup-profile-input-row';
  const lbl = gameDoc.createElement('label');
  lbl.textContent = 'Auth key:';
  const input = gameDoc.createElement('input');
  input.type = 'text';
  input.placeholder = 'idkey.xxxxxxxx.yyyyyyyy.zzzzzzzz';
  inputRow.appendChild(lbl);
  inputRow.appendChild(input);
  modal.appendChild(inputRow);

  const btns = gameDoc.createElement('div');
  btns.className = 'xup-profile-modal-btns';
  btns.style.marginTop = '12px';
  const importBtn = gameDoc.createElement('button');
  importBtn.textContent = 'Importar';
  importBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val.startsWith('idkey.') || val.split('.').length !== 4) {
      input.style.borderColor = 'var(--app-danger)';
      return;
    }
    localStorage.setItem('player_auth_key', val);
    close();
  });
  btns.appendChild(importBtn);
  modal.appendChild(btns);
  gameDoc.body.appendChild(overlay);
}

function confirmResetAuth(): void {
  if (!gameDoc) return;
  const { overlay, modal, close } = createDialog('Resetear Auth');

  const info = gameDoc.createElement('div');
  info.className = 'xup-profile-info';
  info.innerHTML = 'Se generará una <b>nueva identidad</b>. Perderás el acceso a cuentas de salas vinculadas a tu auth actual.';
  modal.appendChild(info);

  const btns = gameDoc.createElement('div');
  btns.className = 'xup-profile-modal-btns';
  btns.style.marginTop = '12px';
  const cancelBtn = gameDoc.createElement('button');
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', close);
  const confirmBtn = gameDoc.createElement('button');
  confirmBtn.textContent = 'Confirmar';
  confirmBtn.style.cssText = 'border-color:var(--app-danger)!important;color:var(--app-danger)!important;';
  confirmBtn.addEventListener('click', async () => {
    const newKey = await ipcRenderer.invoke('auth:generate-key');
    localStorage.setItem('player_auth_key', newKey);
    close();
  });
  btns.appendChild(cancelBtn);
  btns.appendChild(confirmBtn);
  modal.appendChild(btns);
  gameDoc.body.appendChild(overlay);
}

// ===== PROFILE MANAGEMENT =====
const PROFILE_KEYS = ['avatar', 'extrapolation', 'fav_rooms', 'geo_override', 'player_auth_key', 'player_name'];

function loadProfileToLocalStorage(profile: any): void {
  localStorage.setItem('current_profile', profile.id);
  PROFILE_KEYS.forEach(key => {
    const val = profile[key];
    if (val === null || val === undefined) {
      localStorage.removeItem(key);
    } else if (key === 'geo_override' || key === 'fav_rooms') {
      localStorage.setItem(key, JSON.stringify(val));
    } else {
      localStorage.setItem(key, val);
    }
  });
}

async function exportCurrentProfile(): Promise<void> {
  const cfg = await ipcRenderer.invoke('config:get');
  const profiles = cfg.profiles || [];
  const currentId = localStorage.getItem('current_profile') || 'default';
  const idx = profiles.findIndex((p: any) => p.id === currentId);
  if (idx === -1) return;

  PROFILE_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (val === null) return;
    if (key === 'geo_override' || key === 'fav_rooms') {
      try { profiles[idx][key] = JSON.parse(val); } catch { /* skip */ }
    } else {
      profiles[idx][key] = val;
    }
  });

  await ipcRenderer.invoke('profiles:save', profiles);
}

async function switchProfile(newProfileId: string): Promise<void> {
  const cfg = await ipcRenderer.invoke('config:get');
  const profiles = cfg.profiles || [];
  const profile = profiles.find((p: any) => p.id === newProfileId) || profiles[0];
  if (profile) loadProfileToLocalStorage(profile);
  sessionStorage.removeItem('profileInitialized');
  ipcRenderer.send('app:restart');
}

async function openProfileManager(): Promise<void> {
  if (!gameDoc) return;
  gameDoc.querySelectorAll('.xup-profile-overlay').forEach(el => el.remove());

  const cfg = await ipcRenderer.invoke('config:get');
  const profiles: any[] = cfg.profiles || [];
  const currentProfId = localStorage.getItem('current_profile') || 'default';
  let selectedId = currentProfId;
  const removalSet = new Set<string>();
  const saveSet = new Set<string>();

  const overlay = gameDoc.createElement('div');
  overlay.className = 'xup-profile-overlay';

  const modal = gameDoc.createElement('div');
  modal.className = 'xup-profile-modal';

  const closeBtn = gameDoc.createElement('button');
  closeBtn.className = 'xup-profile-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', close);
  modal.appendChild(closeBtn);

  const title = gameDoc.createElement('h2');
  title.textContent = 'Gestionar Perfiles';
  modal.appendChild(title);

  const hr = gameDoc.createElement('hr');
  modal.appendChild(hr);

  const createBtn = gameDoc.createElement('button');
  createBtn.className = 'xup-action-btn';
  createBtn.style.cssText = 'margin-bottom:12px;width:100%;';
  createBtn.textContent = '+ Crear Perfil';
  createBtn.addEventListener('click', () => { close(); openProfileCreator(); });
  modal.appendChild(createBtn);

  const list = gameDoc.createElement('div');
  list.className = 'xup-profile-list';

  const selectBtns = new Map<string, HTMLButtonElement>();

  profiles.forEach((profile: any) => {
    const card = gameDoc!.createElement('div');
    card.className = 'xup-profile-card';

    const nameEl = gameDoc!.createElement('div');
    nameEl.className = 'xup-profile-card-name';
    nameEl.textContent = profile.name;
    card.appendChild(nameEl);

    const isCurrent = currentProfId === profile.id;
    const nick = isCurrent ? (localStorage.getItem('player_name') || '(sin nick)') : (profile.player_name || '(sin nick)');
    const avatar = isCurrent ? (localStorage.getItem('avatar') || '-') : (profile.avatar || '-');
    const extrap = isCurrent ? (localStorage.getItem('extrapolation') || '0') : (profile.extrapolation || '0');
    const authKey = isCurrent ? localStorage.getItem('player_auth_key') : profile.player_auth_key;
    const authShort = authKey ? authKey.split('.')[1]?.substring(0, 12) + '...' : '-';
    const favCount = isCurrent
      ? (JSON.parse(localStorage.getItem('fav_rooms') || '[]')).length
      : (profile.fav_rooms || []).length;

    const fields = gameDoc!.createElement('div');
    fields.className = 'xup-profile-field';
    fields.innerHTML = `<b>Nick:</b> ${nick} &middot; <b>Avatar:</b> ${avatar} &middot; <b>Extrap:</b> ${extrap}<br>`
      + `<b>Auth:</b> ${authShort} &middot; <b>Salas fav:</b> ${favCount}<br>`
      + `<b>Autosave:</b> ${profile.autosave ? 'Sí' : 'No'}`;
    card.appendChild(fields);

    const deleteBadge = gameDoc!.createElement('div');
    deleteBadge.className = 'xup-profile-badge delete';
    deleteBadge.textContent = 'Se eliminará';
    card.appendChild(deleteBadge);

    const saveBadge = gameDoc!.createElement('div');
    saveBadge.className = 'xup-profile-badge save';
    saveBadge.textContent = 'Se guardará';
    card.appendChild(saveBadge);

    const cardBtnRow = gameDoc!.createElement('div');
    cardBtnRow.className = 'xup-profile-card-btns';

    const selectBtn = gameDoc!.createElement('button');
    selectBtn.textContent = selectedId === profile.id ? 'Seleccionado' : 'Seleccionar';
    if (selectedId === profile.id) selectBtn.classList.add('sel');
    selectBtn.addEventListener('click', () => {
      selectedId = profile.id;
      selectBtns.forEach((btn, pid) => {
        if (pid === profile.id) { btn.textContent = 'Seleccionado'; btn.classList.add('sel'); }
        else { btn.textContent = 'Seleccionar'; btn.classList.remove('sel'); }
      });
    });
    cardBtnRow.appendChild(selectBtn);
    selectBtns.set(profile.id, selectBtn);

    if (isCurrent) {
      const saveBtn = gameDoc!.createElement('button');
      saveBtn.textContent = 'Guardar';
      saveBtn.addEventListener('click', () => {
        if (saveSet.has(profile.id)) {
          saveSet.delete(profile.id);
          saveBtn.textContent = 'Guardar';
          saveBadge.style.display = 'none';
        } else {
          saveSet.add(profile.id);
          saveBtn.textContent = 'Deshacer';
          saveBadge.style.display = 'block';
        }
      });
      cardBtnRow.appendChild(saveBtn);
    }

    if (profile.id !== 'default') {
      const delBtn = gameDoc!.createElement('button');
      delBtn.textContent = 'Eliminar';
      delBtn.addEventListener('click', () => {
        if (removalSet.has(profile.id)) {
          removalSet.delete(profile.id);
          delBtn.textContent = 'Eliminar';
          deleteBadge.style.display = 'none';
        } else {
          removalSet.add(profile.id);
          delBtn.textContent = 'Deshacer';
          deleteBadge.style.display = 'block';
        }
      });
      cardBtnRow.appendChild(delBtn);
    }

    card.appendChild(cardBtnRow);
    list.appendChild(card);
  });

  modal.appendChild(list);

  const modalBtns = gameDoc.createElement('div');
  modalBtns.className = 'xup-profile-modal-btns';

  const applyBtn = gameDoc.createElement('button');
  applyBtn.textContent = 'Aplicar Cambios';
  applyBtn.addEventListener('click', async () => {
    if (saveSet.size > 0) {
      await exportCurrentProfile();
    }

    if (removalSet.size > 0) {
      const updated = profiles.filter((p: any) => !removalSet.has(p.id));
      await ipcRenderer.invoke('profiles:save', updated);
    }

    if (removalSet.has(selectedId)) {
      selectedId = 'default';
    }

    close();

    if (selectedId !== currentProfId) {
      await switchProfile(selectedId);
    }
  });
  modalBtns.appendChild(applyBtn);
  modal.appendChild(modalBtns);

  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  gameDoc.body.appendChild(overlay);

  function close(): void { overlay.remove(); }
}

async function openProfileCreator(): Promise<void> {
  if (!gameDoc) return;
  gameDoc.querySelectorAll('.xup-profile-overlay').forEach(el => el.remove());

  const cfg = await ipcRenderer.invoke('config:get');
  const profiles: any[] = cfg.profiles || [];
  let autosave = true;
  let useCurrentAuth = false;

  const overlay = gameDoc.createElement('div');
  overlay.className = 'xup-profile-overlay';

  const modal = gameDoc.createElement('div');
  modal.className = 'xup-profile-modal';

  const closeBtn = gameDoc.createElement('button');
  closeBtn.className = 'xup-profile-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', close);
  modal.appendChild(closeBtn);

  const title = gameDoc.createElement('h2');
  title.textContent = 'Nuevo Perfil';
  modal.appendChild(title);

  const hr = gameDoc.createElement('hr');
  modal.appendChild(hr);

  const info = gameDoc.createElement('div');
  info.className = 'xup-profile-info';
  info.innerHTML = 'Cada perfil tiene su propio nick, avatar, auth, extrapolación y salas favoritas.<br>'
    + '<b>Autosave Sí:</b> los cambios se guardan al cerrar.<br>'
    + '<b>Autosave No:</b> los cambios no se guardan automáticamente.';
  modal.appendChild(info);

  const nameRow = gameDoc.createElement('div');
  nameRow.className = 'xup-profile-input-row';
  const nameLabel = gameDoc.createElement('label');
  nameLabel.textContent = 'Nombre:';
  const nameInput = gameDoc.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Nombre del perfil';
  nameInput.maxLength = 25;
  nameRow.appendChild(nameLabel);
  nameRow.appendChild(nameInput);
  modal.appendChild(nameRow);

  const nickRow = gameDoc.createElement('div');
  nickRow.className = 'xup-profile-input-row';
  const nickLabel = gameDoc.createElement('label');
  nickLabel.textContent = 'Nick:';
  const nickInput = gameDoc.createElement('input');
  nickInput.type = 'text';
  nickInput.placeholder = 'Nick del jugador';
  nickInput.maxLength = 25;
  nickRow.appendChild(nickLabel);
  nickRow.appendChild(nickInput);
  modal.appendChild(nickRow);

  const autosaveRow = gameDoc.createElement('div');
  autosaveRow.className = 'xup-profile-toggle-row';
  const autosaveLabel = gameDoc.createElement('span');
  autosaveLabel.textContent = 'Autosave:';
  const autosaveGroup = gameDoc.createElement('div');
  autosaveGroup.className = 'xup-profile-toggle-group';
  const autosaveOn = gameDoc.createElement('button');
  autosaveOn.className = 'xup-profile-toggle-btn active';
  autosaveOn.textContent = 'Sí';
  const autosaveOff = gameDoc.createElement('button');
  autosaveOff.className = 'xup-profile-toggle-btn';
  autosaveOff.textContent = 'No';
  autosaveOn.addEventListener('click', () => { autosave = true; autosaveOn.classList.add('active'); autosaveOff.classList.remove('active'); });
  autosaveOff.addEventListener('click', () => { autosave = false; autosaveOff.classList.add('active'); autosaveOn.classList.remove('active'); });
  autosaveGroup.appendChild(autosaveOn);
  autosaveGroup.appendChild(autosaveOff);
  autosaveRow.appendChild(autosaveLabel);
  autosaveRow.appendChild(autosaveGroup);
  modal.appendChild(autosaveRow);

  const authRow = gameDoc.createElement('div');
  authRow.className = 'xup-profile-toggle-row';
  const authLabel = gameDoc.createElement('span');
  authLabel.textContent = 'Identidad:';
  const authGroup = gameDoc.createElement('div');
  authGroup.className = 'xup-profile-toggle-group';
  const authNew = gameDoc.createElement('button');
  authNew.className = 'xup-profile-toggle-btn active';
  authNew.textContent = 'Nueva';
  const authCurrent = gameDoc.createElement('button');
  authCurrent.className = 'xup-profile-toggle-btn';
  authCurrent.textContent = 'Actual';
  authNew.addEventListener('click', () => { useCurrentAuth = false; authNew.classList.add('active'); authCurrent.classList.remove('active'); });
  authCurrent.addEventListener('click', () => { useCurrentAuth = true; authCurrent.classList.add('active'); authNew.classList.remove('active'); });
  authGroup.appendChild(authNew);
  authGroup.appendChild(authCurrent);
  authRow.appendChild(authLabel);
  authRow.appendChild(authGroup);
  modal.appendChild(authRow);

  const modalBtns = gameDoc.createElement('div');
  modalBtns.className = 'xup-profile-modal-btns';
  modalBtns.style.marginTop = '12px';

  const createProfileBtn = gameDoc.createElement('button');
  createProfileBtn.textContent = 'Crear Perfil';
  createProfileBtn.style.opacity = '0.4';
  createProfileBtn.style.cursor = 'not-allowed';
  let canCreate = false;

  function checkInputs(): void {
    const name = nameInput.value.trim();
    const nick = nickInput.value.trim();
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const exists = profiles.some((p: any) => p.id === id);
    canCreate = name.length > 0 && nick.length > 0 && !exists;
    createProfileBtn.style.opacity = canCreate ? '1' : '0.4';
    createProfileBtn.style.cursor = canCreate ? 'pointer' : 'not-allowed';
    nameInput.style.color = exists && name.length > 0 ? 'var(--app-danger)' : 'var(--app-input-text)';
  }

  nameInput.addEventListener('input', checkInputs);
  nickInput.addEventListener('input', checkInputs);

  createProfileBtn.addEventListener('click', async () => {
    if (!canCreate) return;
    const name = nameInput.value.trim();
    const nick = nickInput.value.trim();
    const id = name.toLowerCase().replace(/\s+/g, '-');

    let authKey: string | null;
    if (useCurrentAuth) {
      authKey = localStorage.getItem('player_auth_key');
    } else {
      authKey = await ipcRenderer.invoke('auth:generate-key');
    }

    const newProfile = {
      id, name, autosave,
      avatar: null, extrapolation: null, fav_rooms: [],
      geo_override: null, player_auth_key: authKey, player_name: nick,
    };

    const defIdx = profiles.findIndex((p: any) => p.id === 'default');
    if (defIdx !== -1 && profiles[defIdx].player_name === null) {
      profiles[defIdx].player_name = localStorage.getItem('player_name');
    }

    profiles.push(newProfile);
    await ipcRenderer.invoke('profiles:save', profiles);
    close();
    await switchProfile(id);
  });

  modalBtns.appendChild(createProfileBtn);
  modal.appendChild(modalBtns);

  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  gameDoc.body.appendChild(overlay);

  function close(): void { overlay.remove(); }
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  cleanParentPage();
  applyParentTheme(DARK);
  injectLinkBar();
  loadFavorites();
  findGameDoc();
  ipcRenderer.invoke('config:get').then((cfg: any) => {
    const saved = cfg.theme && cfg.theme in THEMES ? cfg.theme : 'dark';
    if (saved !== 'dark') {
      currentTheme = saved;
      applyParentTheme(getTokens(saved));
    }
  });
});
