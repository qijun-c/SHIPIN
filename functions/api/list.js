export async function onRequestPost(context){
  const { request, env } = context;
  const { link, pwd = "", dir = "/", bduss: bdussClient = "", bdclnd: bdclndClient = "", randsk: randskClient = "", sekey: sekeyClient = "" } = await request.json();
  const surl = extractSurl(link||"");
  const surlToken = surl.replace(/^1/, "");
  if(!surl) return json({errno:400,message:"invalid surl"},400);
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  let cookies = "";
  const BDUSS_ENV = (env && env.BDUSS) ? `BDUSS=${env.BDUSS}` : "";
  const BDUSS_CLIENT = bdussClient ? (bdussClient.startsWith('BDUSS=')? bdussClient : `BDUSS=${bdussClient}`) : "";
  const BDUSS = BDUSS_CLIENT || BDUSS_ENV;
  if(BDUSS) cookies = mergeCookie(cookies, BDUSS);
  let randsk = "";
  if (bdclndClient) cookies = mergeCookie(cookies, bdclndClient.startsWith('BDCLND=')? bdclndClient : `BDCLND=${bdclndClient}`);
  if (randskClient) cookies = mergeCookie(cookies, `BDCLND=${encodeURIComponent(randskClient)}`);
  if(pwd){
    const v = await verifyPwd(surl,pwd,ua,cookies);
    if(v.errno!==0) return json({errno:v.errno,message:v.message||"verify failed", stage:"verify"},400);
    randsk = v.randsk||"";
    if(v.bdclnd) cookies = mergeCookie(cookies,v.bdclnd);
  }
  const page = await fetch(`https://pan.baidu.com/s/1${encodeURIComponent(surlToken)}`,{headers:{"user-agent":ua,"referer":`https://pan.baidu.com/s/1${surlToken}`,...(cookies?{"cookie":cookies}:{})}});
  const html = await page.text();
  const yun = extractYunData(html);
  if(!yun) return json({errno:500,message:"failed to parse share page"},500);
  const { shareid, uk } = yun;
  const listUrl = `https://pan.baidu.com/share/list?shareid=${shareid}&uk=${uk}&order=name&desc=0&showempty=0&web=1&page=1&num=1000&dir=${encodeURIComponent(dir)}`;
  let lr = await fetch(listUrl,{headers:{"user-agent":ua,"referer":`https://pan.baidu.com/s/1${surlToken}`,...(cookies?{"cookie":cookies}:{})}});
  let lj = await lr.json();
  if(lj.errno!==0 && lj.errno===9019){
    // need verify, try once
    const v2 = await verifyPwd(surl, pwd || "", ua);
    if(v2 && v2.errno===0 && v2.bdclnd){ cookies = mergeCookie(cookies, v2.bdclnd); }
    lr = await fetch(listUrl,{headers:{"user-agent":ua,"referer":`https://pan.baidu.com/s/1${surlToken}`,...(cookies?{"cookie":cookies}:{})}});
    lj = await lr.json();
    if(lj.errno!==0){
      return json({errno:lj.errno,errtype:lj.errtype,errmsg:lj.errmsg,message:"list failed after verify", stage:"list-after-verify"},400);
    }
  } else if(lj.errno!==0){
    return json({errno:lj.errno,errtype:lj.errtype,errmsg:lj.errmsg,message:"list failed", stage:"list"},400);
  }
  const all = Array.isArray(lj.list)?lj.list:[];
  const videos = all.filter(x=>x.isdir===0 && isVideo(x.server_filename)).sort((a,b)=>b.size-a.size);
  return json({errno:0,share:{surl},total:all.length,videos});
}
export async function onRequest(context){
  const { request } = context;
  if(request.method === 'POST'){
    return onRequestPost(context);
  }
  if(request.method === 'GET'){
    const url = new URL(request.url);
    const link = url.searchParams.get('link') || url.searchParams.get('surl') || '';
    const pwd = url.searchParams.get('pwd') || '';
    const dir = url.searchParams.get('dir') || '/';
    const bduss = url.searchParams.get('bduss') || '';
    const bdclnd = url.searchParams.get('bdclnd') || '';
    const randsk = url.searchParams.get('randsk') || '';
    const sekey = url.searchParams.get('sekey') || '';
    // Reuse the same logic by faking a POST body
    const fake = new Request(request.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({link,pwd,dir,bduss,bdclnd,randsk,sekey})});
    return onRequestPost({ ...context, request: fake });
  }
  return new Response('method not allowed',{status:405,headers:{"access-control-allow-origin":"*"}});
}
function isVideo(name){
  const ex=[".mp4",".mkv",".flv",".ts",".mov",".avi",".wmv",".m4v",".webm",".3gp",".mpeg",".mpg"];
  const n=(name||"").toLowerCase();
  return ex.some(e=>n.endsWith(e));
}
function extractSurl(text){
  if(!text) return "";
  const t=text.trim();
  const m1=t.match(/pan\.baidu\.com\/(?:s|share)\/(?:1|s\w)?([^\s?&#]+)/i); if(m1) return m1[1];
  const m2=t.match(/surl=([\w-]+)/i); if(m2) return m2[1];
  const m3=t.match(/([\w-]{6,})/); if(m3) return m3[1];
  return t;
}
function extractYunData(html){
  const r1=/yunData\.setData\((\{[\s\S]*?\})\)/.exec(html);
  if(r1){try{return JSON.parse(r1[1]);}catch(e){}}
  const r2=/window\.yunData\s*=\s*(\{[\s\S]*?\});/.exec(html);
  if(r2){try{return JSON.parse(r2[1]);}catch(e){}}
  return null;
}
async function verifyPwd(surl,pwd,ua,cookies0){
  const surlParam = surl.startsWith('1') ? surl.slice(1) : surl;
  const body=`surl=${encodeURIComponent(surlParam)}&pwd=${encodeURIComponent(pwd)}`;
  const r=await fetch("https://pan.baidu.com/share/verify",{method:"POST",headers:{
    "content-type":"application/x-www-form-urlencoded; charset=UTF-8",
    "accept":"application/json, text/javascript, */*; q=0.01",
    "x-requested-with":"XMLHttpRequest",
    "user-agent":ua,
    "origin":"https://pan.baidu.com",
    "referer":`https://pan.baidu.com/share/init?surl=${surlParam}`,
    ...(cookies0?{"cookie":cookies0}:{})
  },body});
  const text=await r.text();
  let data; try{data=JSON.parse(text)}catch{data={errno:-1}};
  if(data.errno!==0) return {errno:data.errno||-1,message:"wrong pwd or need captcha"};
  let bdclnd="";
  const sc=r.headers.get("set-cookie")||"";
  const m=/BDCLND=([^;]+);/.exec(sc); if(m) bdclnd=`BDCLND=${m[1]}`;
  const randsk=data.randsk||"";
  if(!bdclnd && randsk) bdclnd=`BDCLND=${encodeURIComponent(randsk)}`;
  return {errno:0,bdclnd,randsk};
}
function mergeCookie(a,b){
  if(!a) return b; if(!b) return a; return a+"; "+b;
}
function json(obj,status=200){
  return new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"}});
}
export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"}});
}
