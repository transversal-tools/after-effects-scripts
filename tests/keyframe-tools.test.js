"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const root = path.join(__dirname, "..");
function evaluate(code) {
  const c = vm.createContext({});
  for (const file of ["tests/ae-mock.js", "src/core.jsxinc"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), c);
  vm.runInContext(`function trimLayer(name,inPoint,outPoint,times,markers){
    var props=[],layer={name:name,locked:false,inPoint:inPoint,outPoint:outPoint};
    if(times.length)props.push(makeProperty(times,times,[]));
    props.push({matchName:"ADBE Marker",propertyType:1,numKeys:markers?markers.length:0,keyTime:function(i){return markers[i-1];}});
    layer.numProperties=props.length;layer.property=function(i){return props[i-1];};return layer;}
  function trimComp(layers){return {selectedLayers:layers,duration:10,frameDuration:1/24};}`, c);
  return JSON.parse(JSON.stringify(vm.runInContext(code, c)));
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("keys to layer in keep their spacing and leave unselected keys alone", () => {
  const r = evaluate(`var p=makeProperty([0,1,3],[0,10,30],[2,3]);p.propertyGroup().inPoint=2;var n=PedroAE.keysToLayer(fixture([p]),"in");[n,p.keys.map(function(k){return [k.time,k.value,k.selected];}),app.groups];`);
  assert.deepEqual(r, [2, [[0, 0, false], [2, 10, true], [4, 30, true]], 0]);
});
test("keys to layer out put the latest key on the last visible frame", () => {
  const r = evaluate(`var p=makeProperty([1,2],[10,20],[1,2]);p.propertyGroup().outPoint=5;PedroAE.keysToLayer(fixture([p]),"out");p.keys.map(function(k){return k.time;});`);
  near(r[1], 5 - 1 / 24); near(r[0], 4 - 1 / 24);
});
test("properties on the same layer move by one shared offset", () => {
  const r = evaluate(`var a=makeProperty([1,2],[1,2],[1,2]),b=makeProperty([1.5],[5],[1]);b.propertyGroup=a.propertyGroup;a.propertyGroup().inPoint=2;PedroAE.keysToLayer(fixture([a,b]),"in");[a.keys.map(function(k){return k.time;}),b.keys.map(function(k){return k.time;})];`);
  assert.deepEqual(r, [[2, 3], [2.5]]);
});
test("a moved key landing on an unselected key cancels everything", () => {
  const r = evaluate(`var p=makeProperty([1,2,3],[1,2,3],[1]);p.propertyGroup().inPoint=2;var e="";try{PedroAE.keysToLayer(fixture([p]),"in");}catch(x){e=x.message;}[e.indexOf("land on another key")>=0,p.keys.map(function(k){return k.time;}),app.groups];`);
  assert.deepEqual(r, [true, [1, 2, 3], 0]);
});
test("keys already at the in point are reported, not rewritten", () => {
  assert.throws(() => evaluate(`var p=makeProperty([2,3],[1,2],[1,2]);p.propertyGroup().inPoint=2;PedroAE.keysToLayer(fixture([p]),"in");`), /already start/);
});
test("keys to playhead align each layer's first selected key on the playhead, keeping spacing", () => {
  // Two layers whose selected keys start at different times; playhead at 3 s.
  const r = evaluate(`var a=makeProperty([0,1,2],[0,10,20],[2,3]),b=makeProperty([4,4.5],[1,2],[1,2]);var c=fixture([a,b]);c.time=3;
    var n=PedroAE.keysToLayer(c,"playhead");[n,a.keys.map(function(k){return [k.time,k.value,k.selected];}),b.keys.map(function(k){return k.time;}),app.groups];`);
  assert.deepEqual(r, [4, [[0, 0, false], [3, 10, true], [4, 20, true]], [3, 3.5], 0]);
});
test("keys to playhead: properties on one layer share the offset; already aligned keys are reported", () => {
  const r = evaluate(`var a=makeProperty([1,2],[1,2],[1,2]),b=makeProperty([1.5],[5],[1]);b.propertyGroup=a.propertyGroup;var c=fixture([a,b]);c.time=0.5;PedroAE.keysToLayer(c,"playhead");[a.keys.map(function(k){return k.time;}),b.keys.map(function(k){return k.time;})];`);
  assert.deepEqual(r, [[0.5, 1.5], [1]]);
  assert.throws(() => evaluate(`var p=makeProperty([2,3],[1,2],[1,2]);var c=fixture([p]);c.time=2;PedroAE.keysToLayer(c,"playhead");`), /already start at the playhead/);
  const blocked = evaluate(`var p=makeProperty([1,3],[1,2],[2]);var c=fixture([p]);c.time=1;var e="";try{PedroAE.keysToLayer(c,"playhead");}catch(x){e=x.message;}[e.indexOf("land on another key")>=0,p.keys.map(function(k){return k.time;})];`);
  assert.deepEqual(blocked, [true, [1, 3]]);
});
test("trim both starts on the first key, ends after the last key's frame and ignores markers", () => {
  const r = evaluate(`var l=trimLayer("A",0,10,[1,3],[9]);var res=PedroAE.trimToKeys(trimComp([l]),"both");[res,l.inPoint,l.outPoint];`);
  assert.deepEqual(r[0], { layers: 1, noKeys: 0 }); near(r[1], 1); near(r[2], 3 + 1 / 24);
});
test("trim in and trim out change only their own end", () => {
  const r = evaluate(`var a=trimLayer("A",0,10,[1,3]),b=trimLayer("B",0,10,[1,3]);PedroAE.trimToKeys(trimComp([a]),"in");PedroAE.trimToKeys(trimComp([b]),"out");[a.inPoint,a.outPoint,b.inPoint,b.outPoint];`);
  near(r[0], 1); near(r[1], 10); near(r[2], 0); near(r[3], 3 + 1 / 24);
});
test("trim can move a layer whose keys sit after its current out point", () => {
  const r = evaluate(`var l=trimLayer("A",0,1,[2,4]),order=[];var inP=l.inPoint,outP=l.outPoint;Object.defineProperty(l,"inPoint",{get:function(){return inP;},set:function(v){if(v>=outP)throw new Error("in after out");inP=v;}});Object.defineProperty(l,"outPoint",{get:function(){return outP;},set:function(v){if(v<=inP)throw new Error("out before in");outP=v;}});PedroAE.trimToKeys(trimComp([l]),"both");[l.inPoint,l.outPoint];`);
  near(r[0], 2); near(r[1], 4 + 1 / 24);
});
test("layers without keys or already trimmed are reported", () => {
  assert.throws(() => evaluate(`PedroAE.trimToKeys(trimComp([trimLayer("A",0,10,[],[2])]),"both");`), /no keyframes/);
  assert.throws(() => evaluate(`PedroAE.trimToKeys(trimComp([trimLayer("A",1,2,[1,2-1/24])]),"both");`), /already match/);
});
test("footage that can't extend restores every layer already trimmed", () => {
  const r = evaluate(`var a=trimLayer("A",0,10,[1,3]),b=trimLayer("Clip",2,4,[1,5]),outB=b.outPoint;Object.defineProperty(b,"outPoint",{get:function(){return outB;},set:function(v){outB=Math.min(v,4.5);}});var e="";try{PedroAE.trimToKeys(trimComp([a,b]),"both");}catch(x){e=x.message;}[e.indexOf("beyond its footage")>=0,a.inPoint,a.outPoint,b.inPoint,b.outPoint,app.groups];`);
  assert.deepEqual(r, [true, 0, 10, 2, 4, 0]);
});

// Keep every Nth key: counted among the selected keys of each property.
const frameKeys = n => `[${Array.from({ length: n }, (_, i) => i + "/24").join(",")}]`;
test("keep every 2nd key keeps every other selected key", () => {
  const r = evaluate(`var p=makeProperty(${frameKeys(9)},[0,1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8,9]);var n=PedroAE.keepEvery(fixture([p]),2);[n,p.keys.map(function(k){return k.value;}),app.groups];`);
  assert.deepEqual(r, [4, [0, 2, 4, 6, 8], 0]);
});
test("the last selected key always stays", () => {
  assert.deepEqual(evaluate(`var p=makeProperty(${frameKeys(9)},[0,1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8,9]);PedroAE.keepEvery(fixture([p]),3);p.keys.map(function(k){return k.value;});`), [0, 3, 6, 8]);
});
test("counting uses only selected keys; unselected keys are never removed", () => {
  assert.deepEqual(evaluate(`var p=makeProperty(${frameKeys(7)},[0,1,2,3,4,5,6],[2,3,4,6,7]);PedroAE.keepEvery(fixture([p]),2);p.keys.map(function(k){return k.value;});`), [0, 1, 3, 4, 6]);
});
test("irregular spacing is counted by keys, not by time", () => {
  assert.deepEqual(evaluate(`var p=makeProperty([0,1/24,2/24,10/24,11/24,20/24],[0,1,2,10,11,20],[1,2,3,4,5,6]);PedroAE.keepEvery(fixture([p]),2);p.keys.map(function(k){return k.value;});`), [0, 2, 11, 20]);
});
for (const bad of ["1", "0", "1.5", "abc"]) test(`keep refuses ${JSON.stringify(bad)} keys`, () => {
  assert.throws(() => evaluate(`var p=makeProperty([0,1,2],[0,1,2],[1,2,3]);PedroAE.keepEvery(fixture([p]),${JSON.stringify(bad)});`), /2 or more/);
});
test("two selected keys leave nothing to remove and change nothing", () => {
  const r = evaluate(`var p=makeProperty([0,1],[0,1],[1,2]);var e="";try{PedroAE.keepEvery(fixture([p]),2);}catch(x){e=x.message;}[e.indexOf("Nothing to remove")>=0,p.keys.length,app.groups];`);
  assert.deepEqual(r, [true, 2, 0]);
});
