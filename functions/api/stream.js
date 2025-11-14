export async function onRequest(context){
  const { request, env } = context;
  const url=new URL(request.url);
  const surl=url.searchParams.get("surl")||"";
  const fs_id=url.searchParams.get("fs_id")||"";
  const pwd=url.searchParams.get("pwd")||"";
  if(!surl||!fs_id) return new Response("missing params",{status:400,headers:corsHeaders()});
  const BDUSS=(env&&env.BDUSS)||"";
  if(!BDUSS) return new Response("需要在 Cloudflare 设置 BDUSS 才能播放",{status:400,headers:corsHeaders()});
  const uaWeb="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  let cookies=`BDUSS=${BDUSS}`;
  if(pwd){
    const v=await verifyPwd(surl,pwd,uaWeb);
    if(v.errno!==0) return new Response("verify failed",{status:400,headers:corsHeaders()});
    if(v.bdclnd) cookies=mergeCookie(cookies,v.bdclnd);
  }
  const page=await fetch(`https://pan.baidu.com/s/${encodeURIComponent(surl)}`,{headers:{"user-agent":uaWeb,"referer":"https://pan.baidu.com/",...(cookies?{"cookie":cookies}:{})}});
  const html=await page.text();
  const yun=extractYunData(html);
  if(!yun) return new Response("parse share page failed",{status:500,headers:corsHeaders()});
  const sign=yun.sign||yun.sign1||"";
  const timestamp=yun.timestamp||yun.time||"";
  const uk=yun.uk; const shareid=yun.shareid;
  const extra=encodeURIComponent(JSON.stringify({sekey:getSeKeyFromCookie(cookies)||""}));
  const q=`app_id=250528&web=1&channel=chunlei&clienttype=5&sign=${encodeURIComponent(sign)}&timestamp=${encodeURIComponent(timestamp)}`;
  const body=`encrypt=0&extra=${extra}&fid_list=[${fs_id}]&primaryid=${shareid}&uk=${uk}&product=share&type=n&vip=1`;
  const r=await fetch(`https://pan.baidu.com/api/sharedownload?${q}`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded; charset=UTF-8","user-agent":uaWeb,"origin":"https://pan.baidu.com","referer":`https://pan.baidu.com/s/${surl}`,...(cookies?{"cookie":cookies}:{})},body});
  const jr=await r.json();
  if(jr.errno!==0){
    return new Response(`get dlink failed: ${jr.errno}`,{status:400,headers:corsHeaders()});
  }
  const item=(jr.list&&jr.list[0])||{}; const dlink=item.dlink;
  if(!dlink) return new Response("no dlink",{status:400,headers:corsHeaders()});
  const range=request.headers.get("range");
  const res=await fetch(dlink,{headers:{"user-agent":"netdisk;7.2.0;pc;windows;10;","range":range||undefined,"accept":"*/*","referer":"https://pan.baidu.com/",...(cookies?{"cookie":cookies}:{})},redirect:"follow"});
  const headers=new Headers(res.headers);
  headers.set("access-control-allow-origin","*");
  headers.set("access-control-expose-headers","accept-ranges,content-range,content-length,content-type");
  return new Response(res.body,{status:res.status,headers});
}
function extractYunData(html){
  const r1=/yunData\.setData\((\{[\s\S]*?\})\)/.exec(html);
  if(r1){try{return JSON.parse(r1[1]);}catch(e){}}
  const r2=/window\.yunData\s*=\s*(\{[\s\S]*?\});/.exec(html);
  if(r2){try{return JSON.parse(r2[1]);}catch(e){}}
  return null;
}
async function verifyPwd(surl,pwd,ua){
  const body=`surl=${encodeURIComponent(surl)}&pwd=${encodeURIComponent(pwd)}`;
  const r=await fetch("https://pan.baidu.com/share/verify",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded; charset=UTF-8","user-agent":ua,"origin":"https://pan.baidu.com","referer":`https://pan.baidu.com/share/init?surl=${surl}`},body});
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={errno:-1}};
  if(data.errno!==0) return {errno:data.errno||-1};
  let bdclnd=""; const sc=r.headers.get("set-cookie")||""; const m=/BDCLND=([^;]+);/.exec(sc); if(m) bdclnd=`BDCLND=${m[1]}`;
  const randsk=data.randsk||""; if(!bdclnd&&randsk) bdclnd=`BDCLND=${encodeURIComponent(randsk)}`;
  return {errno:0,bdclnd};
}
function mergeCookie(a,b){ if(!a) return b; if(!b) return a; return a+"; "+b; }
function getSeKeyFromCookie(c){ const m=/BDCLND=([^;]+)/.exec(c||""); return m?decodeURIComponent(m[1]):"" }
function corsHeaders(){return {"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"}}
export async function onRequestOptions(){ return new Response(null,{status:204,headers:corsHeaders()}); }
