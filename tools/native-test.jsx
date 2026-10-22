// Native integration suite. Creates/removes only its own temporary comps.
// Does NOT save, close or replace the user's project. Run only with permission.
(function () {
    #include "../src/core.jsxinc"
    var lines = [], created = [], ownedSources = [], oldActive = app.project.activeItem;
    var oldSelection = app.project.selection, passed = 0, failed = 0;
    // Nulls make After Effects add a root "Solids" folder; new folders left empty are removed at the end.
    var rootBefore = {}; for (var r = 1; r <= app.project.rootFolder.numItems; r++) rootBefore[app.project.rootFolder.item(r).id] = true;
    function assert(condition, message) { if (!condition) throw new Error(message || "Assertion failed"); }
    function near(a,b) { return Math.abs(a-b)<0.00001; }
    function test(name, action) {
        try { action(); passed++; lines.push("PASS " + name); }
        catch (error) { failed++; lines.push("FAIL " + name + ": " + error.toString() + " @ line " + error.line); }
    }
    function fresh() {
        var c = app.project.items.addComp("__PedroScripts_TEST_" + new Date().getTime() + "_" + created.length,640,480,1,8,24);
        created.push(c);
        return c;
    }
    function prop(layer, name) { return layer.property("ADBE Transform Group").property(name); }
    function animated(p, times, values) {
        for (var i=0;i<times.length;i++) p.setValueAtTime(times[i],values[i]);
        for (i=1;i<=p.numKeys;i++) {
            var type=p.isInterpolationTypeValid(KeyframeInterpolationType.LINEAR) ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.HOLD;
            p.setInterpolationTypeAtKey(i,type,type);
            p.setTemporalAutoBezierAtKey(i,false); p.setTemporalContinuousAtKey(i,false);
        }
    }
    function choose(p, keys) {
        p.selected=true;
        for (var i=1;i<=p.numKeys;i++) p.setSelectedAtKey(i,false);
        for (i=0;i<keys.length;i++) p.setSelectedAtKey(keys[i],true);
    }
    app.beginUndoGroup("Pedro Scripts Integration Tests");
    try {
        test("spacing selected keys / unselected retention / labels", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Rotate Z");
            animated(p,[1,2,3,4],[10,20,30,40]); p.setLabelAtKey(3,7); choose(p,[1,3]);
            PedroAE.space(c,12,false,false);
            assert(near(p.keyTime(2),1.5) && p.keyValue(2)===30,"selected key did not move");
            assert(near(p.keyTime(3),2) && p.keyValue(3)===20,"unselected key changed");
            assert(p.keyLabel(2)===7,"label lost");
        });
        test("spacing collision / no mutation", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Rotate Z");
            animated(p,[1,2,3],[10,20,30]); choose(p,[1,3]); var caught=false;
            try { PedroAE.space(c,24,false,false); } catch(error) { caught=error.toString().indexOf("overwrite")>=0; }
            assert(caught && p.numKeys===3 && near(p.keyTime(3),3),"collision was not rejected");
        });
        test("step 3 selected intervals / preserve intermediate keys", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Rotate Z");
            animated(p,[0,0.5,1,2],[0,99,100,200]); choose(p,[1,3,4]);
            var count=PedroAE.step(c,6,false);
            assert(count===5 && p.numKeys===9,"incorrect inserted key count: " + count);
            assert(p.keyValue(p.nearestKeyIndex(0.5))===99,"existing key overwritten");
            assert(near(p.keyTime(p.numKeys),2),"last selected interval lost");
        });
        test("step keeps a hand-curved Position path (no handle loops)", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Position");
            animated(p,[0,1],[[100,300],[500,300]]);
            var dims=p.keyValue(1).length;
            function vec(x,y){var v=[x,y];while(v.length<dims)v.push(0);return v;}
            p.setSpatialAutoBezierAtKey(1,false);p.setSpatialAutoBezierAtKey(2,false);p.setSpatialContinuousAtKey(1,false);p.setSpatialContinuousAtKey(2,false);
            p.setSpatialTangentsAtKey(1,vec(0,0),vec(0,-300));p.setSpatialTangentsAtKey(2,vec(0,-300),vec(0,0));
            var curve=[], i, t;
            for (i=0;i<=2000;i++) curve.push(p.valueAtTime(i/2000,true));
            function offCurve(v){var best=Infinity;for(var j=0;j<curve.length;j++){var dx=v[0]-curve[j][0],dy=v[1]-curve[j][1];best=Math.min(best,Math.sqrt(dx*dx+dy*dy));}return best;}
            choose(p,[1,2]); PedroAE.step(c,4,false);
            assert(p.numKeys===7,"expected 5 samples, got "+(p.numKeys-2));
            for (t=0;t<=1;t+=1/96) assert(offCurve(p.valueAtTime(t,true))<0.5,"motion path left the original curve at "+t);
        });
        test("keys to layer in / out keep spacing and use the last visible frame", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Rotate Z");
            layer.inPoint=1; layer.outPoint=5;
            animated(p,[0,1.5,3],[0,10,30]); choose(p,[2,3]);
            PedroAE.keysToLayer(c,"in");
            assert(near(p.keyTime(1),0) && near(p.keyTime(2),1) && near(p.keyTime(3),2.5),"in shift wrong");
            choose(p,[2,3]); PedroAE.keysToLayer(c,"out");
            assert(near(p.keyTime(3),5-c.frameDuration) && near(p.keyTime(2),3.5-c.frameDuration) && p.keyValue(3)===30,"out shift wrong");
        });
        test("keys to playhead align each layer's first selected key on the playhead", function () {
            var c=fresh(), a=c.layers.addShape(), b=c.layers.addShape(), pa=prop(a,"ADBE Rotate Z"), pb=prop(b,"ADBE Rotate Z");
            animated(pa,[0,0.5,1],[0,10,20]); animated(pb,[1.5,2],[1,2]);
            choose(pa,[2,3]); choose(pb,[1,2]); c.time=0.75;
            PedroAE.keysToLayer(c,"playhead");
            assert(near(pa.keyTime(1),0) && near(pa.keyTime(2),0.75) && near(pa.keyTime(3),1.25) && pa.keyValue(2)===10,"layer A shift wrong");
            assert(near(pb.keyTime(1),0.75) && near(pb.keyTime(2),1.25) && pb.keyValue(2)===2,"layer B shift wrong");
        });
        test("timing buttons move keys under loopOut / wiggle and leave the expression enabled and error-free", function () {
            var c=fresh(), layer=c.layers.addShape(), r=prop(layer,"ADBE Rotate Z"), o=prop(layer,"ADBE Opacity");
            animated(r,[0,0.5,1],[0,90,180]); r.expression="loopOut()";
            animated(o,[0,1],[100,50]); o.expression="wiggle(2,5)";
            function intact(p,expr,label){ var v=p.valueAtTime(1.5,false); assert(p.expression===expr && p.expressionEnabled && p.expressionError==="", label+": expression changed, disabled or erroring: "+p.expressionError); }
            choose(r,[1,2,3]); PedroAE.space(c,6,false,false); intact(r,"loopOut()","space");
            assert(near(r.keyTime(2)-r.keyTime(1),6*c.frameDuration),"space did not move keys");
            choose(r,[1,2]); PedroAE.step(c,3,false); intact(r,"loopOut()","step");
            choose(r,[1,2,3]); PedroAE.keepEvery(c,2); intact(r,"loopOut()","keep");
            choose(o,[1,2]); c.time=0.25; PedroAE.keysToLayer(c,"playhead"); intact(o,"wiggle(2,5)","keys to playhead");
            assert(near(o.keyTime(1),0.25),"keys to playhead did not move the wiggle keys");
        });
        test("keep every 2nd selected key removes the ones between", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Rotate Z");
            animated(p,[0,0.25,0.5,0.75,1],[0,1,2,3,4]); choose(p,[1,2,3,4,5]);
            var removed=PedroAE.keepEvery(c,2);
            assert(removed===2 && p.numKeys===3 && p.keyValue(1)===0 && p.keyValue(2)===2 && p.keyValue(3)===4,"keep wrong: "+removed+" / "+p.numKeys);
        });
        test("trim to keys ignores markers and keeps the last key's frame", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Rotate Z");
            animated(p,[1,3],[0,90]); layer.property("ADBE Marker").setValueAtTime(6,new MarkerValue("not a key"));
            for (var i=1;i<=c.numLayers;i++) c.layer(i).selected=false;
            layer.selected=true;
            PedroAE.trimToKeys(c,"both");
            assert(near(layer.inPoint,1) && near(layer.outPoint,3+c.frameDuration),"trim bounds wrong: "+layer.inPoint+" / "+layer.outPoint);
        });
        test("hold mode leaves last endpoint / outside keys unchanged", function () {
            var c=fresh(), layer=c.layers.addShape(), p=prop(layer,"ADBE Rotate Z");
            animated(p,[0,1,2,3],[0,10,20,30]); choose(p,[2,3]); PedroAE.step(c,12,true);
            assert(p.keyOutInterpolationType(p.nearestKeyIndex(1))===KeyframeInterpolationType.HOLD,"not hold");
            assert(p.keyOutInterpolationType(p.nearestKeyIndex(2))===KeyframeInterpolationType.LINEAR,"last endpoint changed");
            assert(p.keyOutInterpolationType(1)===KeyframeInterpolationType.LINEAR,"outside key changed");
        });
        function world(probe, subject, time) {
            var result=[];
            for(var i=0;i<3;i++) {
                var point=i===0 ? "[0,0,0]" : (i===1 ? "[50,0,0]" : "[0,50,0]");
                prop(probe,"ADBE Position").expression='thisComp.layer("Subject").toWorld('+point+')';
                result.push(prop(probe,"ADBE Position").valueAtTime(time,false));
            }
            return result;
        }
        function transferCase(threeD, separated, roving) {
            var c=fresh(), parent=c.layers.addShape(), subject=c.layers.addShape(), probe=c.layers.addShape();
            subject.name="Subject"; parent.name="Parent"; probe.name="Probe";
            parent.threeDLayer=threeD; subject.threeDLayer=threeD; probe.threeDLayer=true;
            prop(parent,"ADBE Scale").setValue(threeD ? [130,70,110] : [130,70]);
            prop(parent,"ADBE Rotate Z").setValue(25);
            subject.setParentWithJump(parent);
            animated(prop(subject,"ADBE Anchor Point"),[0,2],threeD ? [[30,20,5],[45,40,8]] : [[30,20],[45,40]]);
            var position=prop(subject,"ADBE Position");
            if(separated) {
                position.dimensionsSeparated=true;
                for(var d=0;d<(threeD ? 3 : 2);d++) animated(position.getSeparationFollower(d),[0,1,2],[40+d*10,150+d*5,250+d*20]);
            } else {
                animated(position,[0,1,2],threeD ? [[40,50,60],[150,120,80],[250,200,100]] : [[40,50],[150,120],[250,200]]);
                if(roving) position.setRovingAtKey(2,true);
            }
            animated(prop(subject,"ADBE Scale"),[0,2],threeD ? [[80,110,90],[120,70,130]] : [[80,110],[120,70]]);
            animated(prop(subject,"ADBE Rotate Z"),[0,2],[0,75]);
            if(threeD) { animated(prop(subject,"ADBE Orientation"),[0,2],[[10,20,30],[50,60,70]]); prop(subject,"ADBE Rotate X").setValue(15); }
            var times=[0,0.25,0.75,1.25,2], before=[];
            for(var i=0;i<times.length;i++) before.push(world(probe,subject,times[i]));
            for(i=1;i<=c.numLayers;i++) c.layer(i).selected=false;
            subject.selected=true;
            var controller=PedroAE.toNull(c);
            ownedSources.push(controller.source);
            assert(subject.parent===controller && controller.parent===parent,"parent chain incorrect");
            assert(prop(controller,"ADBE Anchor Point").value[0]===0,"controller pivot not zero");
            assert(prop(subject,"ADBE Anchor Point").numKeys===2,"source anchor animation removed");
            for(i=0;i<times.length;i++) {
                var after=world(probe,subject,times[i]);
                for(var p=0;p<3;p++) for(var d=0;d<3;d++) assert(near(after[p][d],before[i][p][d]),"world-space mismatch t="+times[i]+" point="+p+" dim="+d);
            }
        }
        test("transform 2D / animated anchor / transformed parent / world samples",function(){transferCase(false,false,false);});
        test("transform 3D / orientation / transformed parent / world samples",function(){transferCase(true,false,false);});
        test("transform separated 3D position / world samples",function(){transferCase(true,true,false);});
        test("transform roving position / world samples",function(){transferCase(false,false,true);});
        test("transform expression rejection leaves source intact",function(){
            var c=fresh(), layer=c.layers.addShape(); layer.selected=true;
            prop(layer,"ADBE Position").expression="value"; var count=c.numLayers, caught=false;
            try{PedroAE.toNull(c);}catch(e){caught=true;} assert(caught && c.numLayers===count && !layer.parent,"source mutated");
        });
        test("spacing mask-path key values",function(){
            var c=fresh(), layer=c.layers.addShape();
            var mask=layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            var p=mask.property("ADBE Mask Shape"), s=new Shape();
            s.vertices=[[0,0],[100,0],[100,100],[0,100]];
            s.inTangents=[[0,0],[0,0],[0,0],[0,0]]; s.outTangents=s.inTangents; s.closed=true;
            animated(p,[0,1],[s,s]); choose(p,[1,2]); PedroAE.space(c,12,false,false);
            assert(near(p.keyTime(2),0.5) && p.keyValue(2).vertices.length===4,"mask data lost");
        });
        test("spacing Source Text key values",function(){
            var c=fresh(), layer=c.layers.addText("A");
            var p=layer.property("ADBE Text Properties").property("ADBE Text Document");
            animated(p,[0,1],[new TextDocument("A"),new TextDocument("B")]); choose(p,[1,2]);
            PedroAE.space(c,12,false,false);
            assert(near(p.keyTime(2),0.5) && p.keyValue(2).text==="B","text data lost");
        });
        test("font inspector / mixed-character fonts / no layer writes",function(){
            var c=fresh(), text=c.layers.addText("AB");
            var p=text.property("ADBE Text Properties").property("ADBE Text Document"), td=p.value;
            td.characterRange(0,1).font="HelveticaNeue";
            td.characterRange(1,2).font="Courier";
            p.setValue(td);
            var sourceFile=new File(new File($.fileName).parent.parent.fsName+"/src/font-inspector.jsxinc");
            sourceFile.open("r"); var source=sourceFile.read(); sourceFile.close();
            var fontTest;
            eval(source.replace("        run();","        fontTest = {inspectComp: inspectComp, buildReport: buildReport};"));
            var map={},order=[],stats={textLayers:0,compsInspected:0,skippedCycles:0,errors:[],usedFallback:false,rangeErrors:0,expressionLayers:0};
            fontTest.inspectComp(c,c.name,{},map,order,stats);
            assert(order.length===2,"mixed fonts not detected: "+order.join(","));
            assert(c.numLayers===1 && p.value.text==="AB" && p.numKeys===0,"inspection changed text");
        });
    } finally {
        for (var i=created.length-1;i>=0;i--) { try{created[i].remove();}catch(error){lines.push("CLEANUP FAILED "+error.toString());failed++;} }
        for(i=ownedSources.length-1;i>=0;i--) {
            try { if(ownedSources[i].usedIn.length===0) ownedSources[i].remove(); }
            catch(error) { lines.push("SOLID CLEANUP FAILED "+error.toString()); failed++; }
        }
        // Restore project-panel selection; no user layer was edited or selected.
        for(i=app.project.rootFolder.numItems;i>=1;i--) { var leftover=app.project.rootFolder.item(i); if(leftover instanceof FolderItem&&!rootBefore[leftover.id]&&leftover.numItems===0) leftover.remove(); }
        for(i=0;i<oldSelection.length;i++) { try{oldSelection[i].selected=true;}catch(error){} }
        if(oldActive instanceof CompItem) { try{oldActive.openInViewer();}catch(error){} }
        app.endUndoGroup();
    }
    lines.unshift("AE "+app.version+" / "+$.os+" / passed="+passed+" failed="+failed);
    $.writeln(lines.join("\n"));
    var output=new File(new File($.fileName).parent.parent.fsName+"/native-results.txt");
    output.encoding="UTF-8";
    if(!output.open("w")) throw new Error("Cannot write native test report.");
    try { output.write(lines.join("\n")); } finally { output.close(); }
    return lines.join("\n");
}());
