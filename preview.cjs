const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'src');
http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.svg':'image/svg+xml','.png':'image/png'}[ext]||'application/octet-stream'),'Cache-Control':'no-store'});res.end(data);});}).listen(8766,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:8766/'));
