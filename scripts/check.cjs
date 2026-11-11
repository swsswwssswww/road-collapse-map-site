'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../src'),baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'baseline-data-sha256.json'),'utf8'));
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let checks=0;function ok(value,message){assert.ok(value,message);checks++;}
for(const file of fs.readdirSync(root)){
 if(/\.(js|html|css)$/.test(file))ok(!read(file).includes('\ufffd'),file+' has valid text');
 if(file.endsWith('.js')){new vm.Script(read(file),{filename:file});checks++;}
 if(/\.(json|geojson)$/.test(file)&&baseline[file])ok(hash(path.join(root,file))===baseline[file],file+' unchanged');
}
const html=read('index.html'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
ok(new Set(ids).size===ids.length,'Unique HTML IDs');
for(const [,ref]of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(/^(https?:|#|\.\/$)/.test(ref))continue;ok(fs.existsSync(path.join(root,ref.split('?')[0])),'Local asset '+ref);}
const stack=[],voidTags=new Set('meta link img input br hr path circle source area base col embed param track wbr'.split(' '));
for(const match of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z0-9-]+)\b[^>]*>/gi)){
 const token=match[0],tag=match[1]?.toLowerCase();if(!tag||voidTags.has(tag)||token.endsWith('/>'))continue;
 if(token.startsWith('</'))assert.equal(stack.pop(),tag,'HTML nesting near '+token);else stack.push(tag);
}ok(!stack.length,'Balanced HTML');
const elements=new Map(),events={},mapEvents={},windowEvents={};
function element(id){if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:true,scrollTop:0,isConnected:true,classList:{toggle(){},remove(){}},setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){},addEventListener(type,fn){events[type]=fn;}});return elements.get(id);}
let clock=1000,center={lat:35,lng:139},zoom=10,scrollY=320;
const mapMock={getCenter:()=>center,getZoom:()=>zoom,setView(c,z){center=c;zoom=z;},getContainer:()=>element('#map'),on(types,fn){for(const type of types.split(' '))mapEvents[type]=fn;}};
const context=vm.createContext({console,URL,Intl,performance:{now:()=>clock},setTimeout,clearTimeout,
 document:{querySelector:element,querySelectorAll:()=>[],activeElement:element('focus')},
 window:{get scrollY(){return scrollY;},scrollTo(o){scrollY=o.top;},addEventListener(t,f){windowEvents[t]=f;}},
 location:{pathname:'/',search:''},history:{replaceState(){}},requestAnimationFrame:fn=>fn(),mobileMedia:{matches:true},matchMedia:()=>({matches:false}),
 t:(ja,en)=>en,caseField:(r,k)=>r[k],prefLabel:s=>s,causeLabel:s=>s,auditIssues:()=>[],prefEnglish:[],causeEnglish:{},lang:'en'});
vm.runInContext(read('app.js').replace(/\binit\(\);\s*$/,''),context);
vm.runInContext(read('ranges.js'),context);vm.runInContext(read('map.js'),context);vm.runInContext(read('navigation.js'),context);vm.runInContext(read('playback.js'),context);vm.runInContext(read('historical-catalog.js'),context);vm.runInContext(read('terrain.js'),context);
const run=s=>vm.runInContext(s,context);
ok(run("safeSourceUrl('javascript:alert(1)')")===null,'Reject script URLs');
ok(run("safeSourceUrl('data:text/html,test')")===null,'Reject data URLs');
ok(run("safeSourceUrl('https://example.org/a?b=1')")==='https://example.org/a?b=1','Accept HTTPS sources');
ok(!run("sourceLink('javascript:alert(1)','<test>')").includes('<a'),'Unsafe source is text');
ok(run("esc('<img onerror=x>')").includes('&lt;'),'Escape data HTML');
const meta=JSON.parse(read('data.json')),records=meta.recordFiles.flatMap(f=>JSON.parse(read(f)));
context.inputRecords=records;run('national=inputRecords;');
ok(records.length===33301,'33,301 national records');
ok(run('national.filter(mapped).length')===33234,'Mapped record count retained');
ok(run('national.filter(r=>num(r.depthM)).length')===28857,'Known-depth count retained');
ok(new Set(records.map(r=>r.id)).size===records.length,'Unique national record IDs');
const years=run("buildPlaybackFrames(national,'national').map(f=>[f.key,f.records.length])");
assert.equal(JSON.stringify(years),JSON.stringify([['2023',12209],['2024',9865],['2025',11227]]));checks++;
ok(run("recordsAtFrame(buildPlaybackFrames(national,'national'),1,true).length")===22074,'Cumulative playback exact');
ok(run("playbackKey({date:'2024-02-30'},'featured')")===null,'Reject impossible dates');
ok(run("buildPlaybackFrames([{date:null}], 'featured').length")===0,'Never invent missing dates');
for(const km of [20,10,5,2,1])ok(run('Array.from(aggregateGrid(national,'+km+').values()).reduce((n,r)=>n+r.length,0)')===33234,'Grid preserves all located records: '+km);
ok(run('historicalCatalog.length')===60,'60 historical regions');
ok(run('historicalCatalog.every(r=>r.periods.length&&r.periods.every(p=>p.start<=p.end&&p.sheets.length&&p.sheets.every(s=>s.bounds.length===4&&s.bounds.every(Number.isFinite)&&s.bounds[0]<s.bounds[2]&&s.bounds[1]<s.bounds[3])))'),'Valid historical dates and sheet bounds');
ok(run("sheetContains({bounds:[35,139,36,140]},35.5,139.5)"),'Within historical sheet');
ok(!run("sheetContains({bounds:[35,139,36,140]},34,139.5)"),'Outside historical sheet stays unavailable');
context.mapMock=mapMock;run('map=mapMock;showSelectedPoint=()=>{};renderList=()=>{};renderMap=()=>{};renderTable=()=>{};renderStats=()=>{};renderAudit=()=>{};');
element('.sidebar').scrollTop=480;run('saveBrowsePosition();');center={lat:43,lng:143};zoom=15;element('.sidebar').scrollTop=0;scrollY=900;
run('restoreBrowsePosition();');ok(center.lat===35&&zoom===10&&element('.sidebar').scrollTop===480&&scrollY===320,'Back restores viewport and both scroll positions');
run("candidateState={records:[],heading:'test',scroll:640,windowY:1200,center:{lat:35.7,lng:139.7},zoom:12};renderCandidates=()=>{};");
element('#detail').hidden=false;center={lat:40,lng:140};zoom=16;scrollY=1500;
run('closeDetail();');ok(center.lat===35.7&&zoom===12&&element('.sidebar').scrollTop===640&&scrollY===1200,'Candidate back restores candidate viewport and mobile scroll');
run('candidateState=null;');
run('wireMapGestures();');
const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y});
events.pointerdown(event(1,0,0));events.pointermove(event(1,4,4));windowEvents.pointerup(event(1,4,4));
ok(run('tapAllowed()'),'Small tap allowed');
events.pointerdown(event(1,0,0));events.pointermove(event(1,40,0));windowEvents.pointerup(event(1,40,0));
ok(!run('tapAllowed()'),'Drag click suppressed');clock+=300;ok(run('tapAllowed()'),'Later tap allowed');
events.pointerdown(event(1,0,0));events.pointerdown(event(2,80,0));windowEvents.pointerup(event(1,0,0));windowEvents.pointerup(event(2,80,0));
ok(!run('tapAllowed()'),'Pinch release cannot select a record');
clock+=300;events.pointerdown(event(1,0,0));events.pointermove(event(1,20,0));windowEvents.pointercancel(event(1,20,0));ok(!run('tapAllowed()'),'Cancelled gesture cannot select');
element('#depth-missing').value='include';
run('filterRecords();');ok(run('filtered.length')===33301,'Unfiltered records retained');
element('#year-min').value='2024';element('#year-max').value='2024';run('filterRecords();');ok(run('filtered.length')===9865,'Fiscal-year range');
element('#depth-min').value='1';element('#depth-missing').value='exclude';run('filterRecords();');ok(run('filtered.every(r=>r.fiscalYear===2024&&r.depthM>=1)'),'Combined year/depth filters');
element('#year-min').value='';element('#year-max').value='';element('#depth-min').value='';element('#depth-missing').value='only';run('filterRecords();');ok(run('filtered.every(r=>!num(r.depthM))'),'Missing depth is explicit');
element('#depth-missing').value='include';element('#search').value='東京都文京区';run('filterRecords();');ok(run('filtered.length')===12,'Search retains expected Bunkyo records');
console.log(JSON.stringify({passed:checks,records:records.length,mapped:33234,years,regions:run('historicalCatalog.length')},null,2));

