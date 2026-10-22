"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const source = fs.readFileSync(path.join(__dirname, "../src/keyframe-tools.jsxinc"), "utf8");
// ScriptUI and PedroAE stubs: records widgets, calls, alerts, drawing and the saved preference.
function run({ host = "panel", saved, kbar, fail } = {}) {
  const c = vm.createContext({ seed: saved, kbarArg: kbar, failWith: fail, hostKind: host });
  vm.runInContext(`
var widgets=[],calls=[],alerts=[],shown=false,record=seed,drawn=[];
function Graphics(){var g=this;this.BrushType={SOLID_COLOR:1};this.PenType={SOLID_COLOR:1};
  ["newPath","rectPath","moveTo","lineTo","closePath"].forEach(function(n){g[n]=function(){for(var i=0;i<arguments.length;i++)if(!isFinite(arguments[i]))throw new Error(n+" got "+arguments[i]);drawn.push(n);};});
  this.newBrush=function(t,c){if(c.length!==4)throw new Error("bad color");return {color:c};};this.newPen=function(t,c,w){if(c.length!==4||!(w>0))throw new Error("bad pen");return {color:c,width:w};};
  this.fillPath=function(b){drawn.push("fill");};this.strokePath=function(p){drawn.push("stroke");};}
function Control(type,text){this.type=type;this.text=text;this.children=[];this.graphics=new Graphics();this.size=[72,30];widgets.push(this);this.layout={layout:function(){},resize:function(){}};}
Control.prototype.add=function(type,bounds,text){return new Control(type,text);};
function Panel(){Control.call(this,"panel","host");}Panel.prototype=Object.create(Control.prototype);
function Window(type,title){Control.call(this,"window",title);}Window.prototype=Object.create(Control.prototype);
Window.prototype.center=function(){};Window.prototype.show=function(){shown=true;};
var app={settings:{haveSetting:function(){return typeof record==="string";},getSetting:function(){return record;},saveSetting:function(s,k,v){record=v;}}};
function alert(m){alerts.push(m);}
if(kbarArg)var kbar={button:{argument:kbarArg}};
function result(name){return function(){calls.push([name].concat(Array.prototype.slice.call(arguments,1)));if(failWith)throw new Error(failWith);};}
var PedroAE={comp:function(){return {frameDuration:1/24};},run:function(name,action){try{action();}catch(e){alerts.push(name+": "+e.toString());}},
  space:result("space"),step:result("step"),keepEvery:result("keepEvery"),keysToLayer:result("keysToLayer"),trimToKeys:result("trimToKeys")};
var thisObj=hostKind==="panel" ? new Panel() : {};`, c);
  vm.runInContext(source, c);
  const find = tip => `widgets.filter(function(w){return w.helpTip && w.helpTip.indexOf(${JSON.stringify(tip)})===0;})[0]`;
  return {
    click(tip) { vm.runInContext(`${find(tip)}.onClick();`, c); return this; },
    draw(tip, state) { vm.runInContext(`drawn=[];${find(tip)}.onDraw(${JSON.stringify(state || {})});`, c); return JSON.parse(vm.runInContext("JSON.stringify(drawn)", c)); },
    resize(width) { vm.runInContext(`thisObj.size=[${width},400];thisObj.onResize();`, c); return JSON.parse(vm.runInContext(`JSON.stringify(widgets.filter(function(w){return w.type==="edittext"||w.type==="iconbutton";}).map(function(w){return w.location;}))`, c)); },
    change() { vm.runInContext(`widgets.filter(function(w){return w.type==="edittext";})[0].onChange();`, c); return this; },
    deactivate() { vm.runInContext(`widgets.filter(function(w){return w.type==="edittext";})[0].onDeactivate();`, c); return this; },
    frames(text) { vm.runInContext(`widgets.filter(function(w){return w.type==="edittext";})[0].text=${JSON.stringify(text)};`, c); return this; },
    state() { return JSON.parse(JSON.stringify(vm.runInContext(`({buttons:widgets.filter(function(w){return w.type==="iconbutton"&&w.helpTip.indexOf("N:")!==0;}).map(function(w){return w.helpTip.split(":")[0];}),fields:widgets.filter(function(w){return w.type==="edittext";}).map(function(w){return w.text;}),editing:widgets.filter(function(w){return w.type==="edittext";}).map(function(w){return w.visible;}),calls:calls,alerts:alerts,record:record,shown:shown})`, c))); }
  };
}
const tips = ["Space", "Step", "Keep", "Keys to layer in", "Keys to layer out", "Keys to playhead", "Trim in", "Trim out", "Trim both"];
test("the compact panel has an interval field and nine icon buttons in order", () => {
  const s = run().state();
  assert.deepEqual(s.buttons, tips); assert.deepEqual(s.fields, ["2"]);
});
test("each button runs its action with N: frames for Space and Step, keys for Keep", () => {
  const ui = run().frames("4");
  for (const tip of tips) ui.click(tip);
  assert.deepEqual(ui.state().calls, [["space", "4", false, false], ["step", "4", false], ["keepEvery", "4"], ["keysToLayer", "in"], ["keysToLayer", "out"], ["keysToLayer", "playhead"], ["trimToKeys", "in"], ["trimToKeys", "out"], ["trimToKeys", "both"]]);
  assert.equal(ui.state().record, "v2|4"); assert.deepEqual(ui.state().alerts, []);
});
test("a refused action alerts and keeps the panel open", () => {
  assert.match(run({ fail: "Select at least two keys" }).click("Step").state().alerts[0], /Select at least two keys/);
});
test("N is remembered; an invalid entry is not", () => {
  assert.deepEqual(run({ saved: "v2|6" }).state().fields, ["6"]);
  const bad = run({ saved: "v2|6" }).frames("abc").click("Space").state();
  assert.equal(bad.record, "v2|6"); assert.deepEqual(bad.calls[0], ["space", "abc", false, false]);
});
test("records from earlier versions keep their frame count", () => {
  assert.deepEqual(run({ saved: "v1|8|1|0|1" }).state().fields, ["8"]);
  assert.deepEqual(run({ saved: "v3|f|5" }).state().fields, ["5"]);
});
for (const record of [null, "", "v2|0", "v2|6|1", "v1|6|0|1", "v3|s|0.5", "v3|s|2", "v3|f|1.5", "v2|6\n"]) test(`invalid or seconds record ${JSON.stringify(record)} uses N = 2`, () => {
  assert.deepEqual(run({ saved: record }).state().fields, ["2"]);
});
test("the ten tiles form a column, 2 rows of 5 or a single row, never a tall grid or a row left short", () => {
  const ui = run(), shape = width => { const l = ui.resize(width); return [new Set(l.map(p => p[0])).size, new Set(l.map(p => p[1])).size]; };
  assert.deepEqual(shape(60), [1, 10]);
  assert.deepEqual(shape(120), [1, 10], "room for 2 columns still gives a column (5 rows of 2 is taller than wide)");
  assert.deepEqual(shape(230), [1, 10], "room for 4 columns: no full layout yet");
  assert.deepEqual(shape(280), [5, 2]);
  assert.deepEqual(shape(500), [5, 2], "room for 9 columns still gives 2 rows of 5");
  assert.deepEqual(shape(540), [10, 1]);
});
test("nine tiles still make the 3 x 3 square", () => {
  const ctx = vm.createContext({}); vm.runInContext("var widgets=[];function Control(){};var app={settings:{haveSetting:function(){return false;}}};var thisObj={};var PedroAE={};", ctx);
  vm.runInContext(source.replace("KeyframeTools.start(thisObj);", ""), ctx);
  const cols = w => new Set(JSON.parse(vm.runInContext(`JSON.stringify(KeyframeTools.flow(9,${w}))`, ctx)).map(p => p[0])).size;
  assert.equal(cols(120), 1); assert.equal(cols(170), 3); assert.equal(cols(400), 3); assert.equal(cols(480), 9);
});
test("N is drawn large as strokes; clicking it shows the text field until Enter or a click elsewhere", () => {
  const ui = run({ saved: "v2|12" });
  const drawn = ui.draw("N:");
  assert.equal(drawn[1], "rectPath");
  assert.equal(drawn.filter(d => d === "stroke").length, 1 + 1 + 1, "border + one stroke for 1 + one for 2");
  assert.deepEqual(ui.state().editing, [false]);
  ui.click("N:"); assert.deepEqual(ui.state().editing, [true]);
  ui.frames("5");
  ui.change(); assert.deepEqual(ui.state().editing, [false]); assert.equal(ui.state().record, "v2|5");
  assert.equal(ui.draw("N:").filter(d => d === "stroke").length, 1 + 1);
  ui.click("N:").deactivate(); assert.deepEqual(ui.state().editing, [false]);
});
test("Option-click on N rebuilds the docked panel from its file, in the same panel", () => {
  const c = vm.createContext({ seed: undefined, kbarArg: undefined, failWith: undefined, hostKind: "panel" });
  vm.runInContext(`var evaluated=[],hostDuringEval=null;
    var ScriptUI={environment:{keyboardState:{altKey:false}}};
    function File(p){this.fsName=p;this.exists=true;}
    var $={fileName:"/AE/ScriptUI Panels/Keyframe-Tools.jsx",global:{},evalFile:function(f){evaluated.push(f.fsName);hostDuringEval=$.global.KeyframeToolsReloadHost;}};`, c);
  // Reuse the standard stubs, then load the panel.
  const base = fs.readFileSync(__filename, "utf8");
  vm.runInContext(base.slice(base.indexOf("var widgets=[]"), base.indexOf("var thisObj=")).replace(/\\n/g, "\n") + "var thisObj=new Panel();", c);
  vm.runInContext(source, c);
  vm.runInContext(`thisObj.remove=function(child){thisObj.children.splice(thisObj.children.indexOf(child),1);};
    widgets.forEach(function(w){if(w!==thisObj&&w.type!=="window")thisObj.children.push(w);});`, c);
  const number = `widgets.filter(function(w){return w.helpTip&&w.helpTip.indexOf("N:")===0&&w.type==="iconbutton";})[0]`;
  vm.runInContext(`${number}.onClick();`, c);   // plain click: edits, no reload
  assert.equal(vm.runInContext("evaluated.length", c), 0);
  vm.runInContext(`ScriptUI.environment.keyboardState.altKey=true;${number}.onClick();`, c);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify([evaluated,thisObj.children.length,hostDuringEval===thisObj,$.global.KeyframeToolsReloadHost])", c)), [["/AE/ScriptUI Panels/Keyframe-Tools.jsx"], 0, true, null]);
});
test("long or odd N values still draw inside the tile", () => {
  const ui = run();
  for (const text of ["", "123456", "1.5", "-2", "abc"]) { ui.frames(text); assert.doesNotThrow(() => ui.draw("N:"), text); }
});
test("every icon draws its background and shapes in each button state", () => {
  const ui = run();
  for (const tip of tips) for (const state of [{}, { mouseOver: true }, { leftButtonPressed: true }]) {
    const drawn = ui.draw(tip, state);
    assert.equal(drawn[1], "rectPath"); assert.ok(drawn.filter(d => d === "fill" || d === "stroke").length >= 4, `${tip} drew too little`);
  }
});
test("a KBar argument runs one action directly with the saved N, without building the panel", () => {
  const s = run({ kbar: " Trim-Both ", saved: "v2|3" }).state();
  assert.deepEqual(s.calls, [["trimToKeys", "both"]]); assert.deepEqual(s.buttons, []); assert.deepEqual(s.alerts, []);
  assert.deepEqual(run({ kbar: "step", saved: "v2|3" }).state().calls, [["step", "3", false]]);
  assert.deepEqual(run({ kbar: "keep", saved: "v2|3" }).state().calls, [["keepEvery", "3"]]);
});
test("an unknown KBar argument is explained", () => {
  assert.match(run({ kbar: "round" }).state().alerts[0], /Unknown action: round/);
});
test("run as a script file it opens a floating window", () => {
  assert.equal(run({ host: "global" }).state().shown, true);
});
