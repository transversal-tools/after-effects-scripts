"use strict";
// Builds the release ZIP: only what users run, never tests, environments or model weights.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),{execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),version=require("../package.json").version;
const name=`after-effects-scripts-v${version}`,target=path.join(root,"dist",name+".zip");
const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8"});
if(git(["status","--porcelain"]).trim() && !process.argv.includes("--allow-dirty"))throw new Error("Commit or stash changes first: the release must match a commit (or pass --allow-dirty for a local trial).");

const repo="https://github.com/transversal-tools/after-effects-scripts/blob/main/";
const files=[
  ...["Transform-to-Null","Keyframe-Tools","Font-Inspector"].map(n=>[`scripts/${n}.jsx`,`Scripts/${n}.jsx`]),
  ["experimental/shape-to-stroke/Shape-to-Stroke.jsx","Scripts/Shape-to-Stroke.jsx"],
  ...["Create-Test-Fixtures.jsx","circular.jsxinc","outlines.jsxinc","geometry.jsxinc","host.jsxinc","fixtures.jsxinc"].map(f=>[`experimental/shape-to-stroke/${f}`,`Shape to Stroke test comps/${f}`]),
  // Tracked files only: the local Python environment, vendor checkouts and weights are never shipped.
  ...git(["ls-files","depth-map"]).split("\n").filter(Boolean).map(f=>[f,f]),
  ["LICENSE","LICENSE.txt"],["CHANGELOG.md","CHANGELOG.md"]
];
const readme=`After Effects Scripts v${version} — Transversal
https://github.com/transversal-tools/after-effects-scripts

INSTALL
1. In After Effects choose File > Scripts > Run Script File... and pick a script from the "Scripts" folder.
   Each file there works on its own; nothing else to install.
2. To keep them in the File > Scripts menu, copy them into After Effects' Scripts folder and restart AE:
   macOS:   /Applications/Adobe After Effects <version>/Scripts
   Windows: C:\\Program Files\\Adobe\\Adobe After Effects <version>\\Support Files\\Scripts
3. Keyframe Tools is a panel: copy Keyframe-Tools.jsx into the "ScriptUI Panels" folder inside that Scripts
   folder, restart AE and open it from the Window menu.
4. Font Inspector's Save Report and Depth Map need "Allow Scripts to Write Files and Access Network"
   (Settings or Preferences > Scripting & Expressions).

BEFORE YOU USE THEM
- Save your project first. Each script's changes undo with a single Cmd/Ctrl+Z.
- Tested on After Effects 26.5 on macOS. Windows and older versions have not been tested yet.
- Shape to Stroke is experimental. Depth Map is advanced (macOS, needs a Python setup).

WHAT'S INSIDE
Scripts/                     Transform to Null, Keyframe Tools, Font Inspector, Shape to Stroke
Shape to Stroke test comps/  Run Create-Test-Fixtures.jsx to add READY, SKIP and ICONS test comps. Keep these files together.
depth-map/                   Keep the whole folder. Double-click install.command once (first time: right-click > Open),
                             then run jsx/DepthMapStatic.jsx. Details: depth-map/README.md.

GUIDES
Transform to Null   ${repo}docs/transform-to-null.md
Keyframe Tools      ${repo}docs/keyframe-tools.md
Font Inspector      ${repo}docs/font-inspector.md
Shape to Stroke     ${repo}experimental/shape-to-stroke/README.md
Depth Map           ${repo}depth-map/README.md

Problems or ideas: https://github.com/transversal-tools/after-effects-scripts/issues
MIT License, provided without warranty (see LICENSE.txt). Depth Map models and dependencies keep their own licenses.
`;

const stage=fs.mkdtempSync(path.join(os.tmpdir(),"ae-scripts-package-")),base=path.join(stage,name);
try {
  for(const [from,to] of files) {
    const out=path.join(base,to);
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.copyFileSync(path.join(root,from),out);
  }
  fs.writeFileSync(path.join(base,"README.txt"),readme);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.rmSync(target,{force:true});
  execFileSync("zip",["-q","-r","-X",target,name],{cwd:stage});
} finally { fs.rmSync(stage,{recursive:true,force:true}); }
console.log(`Packaged ${path.relative(root,target)} (${files.length+1} files)`);
