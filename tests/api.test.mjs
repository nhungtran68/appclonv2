import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import handler from '../api/index.js';

process.env.APP_PASSWORD='test-only-password-123456';
process.env.SESSION_SECRET='test-only-secret-DO-NOT-USE-IN-PRODUCTION-123456';
process.env.APP_USERS_JSON='{}';
process.env.OPENAI_API_KEY='sk-proj-testkey-9CgA';
process.env.DEEPSEEK_API_KEY='deepseek-test-key';
process.env.OPENAI_MODEL='gpt-5-mini';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const server=createServer(handler); await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`; let cookie='';
async function req(action,body,origin=base){
  return fetch(`${base}/api/index?action=${action}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
test.after(()=>new Promise(r=>server.close(r)));

test('health is public and session is protected',async()=>{
  const h=await req('health'); assert.equal(h.status,200); assert.deepEqual(await h.json(),{ok:true,service:'cliplab'});
  assert.equal((await req('session')).status,401);
});
test('admin login requires APP_PASSWORD and exposes provider state without secrets',async()=>{
  const denied=await req('login',{username:'admin',password:''}); assert.equal(denied.status,400);
  const r=await req('login',{username:'admin',password:process.env.APP_PASSWORD}); assert.equal(r.status,200); cookie=r.headers.get('set-cookie').split(';')[0];
  const d=await (await req('session')).json(); assert.equal(d.username,'admin'); assert.equal(d.role,'admin'); assert.equal(d.models.openai,'gpt-5-mini'); assert.ok('vbee' in d.providers); assert.equal(d.providers.deepseek,true); assert.ok(!('google' in d.providers)); assert.ok(!('sync' in d.providers)); assert.ok(!('fish' in d.providers)); assert.ok(!('lipSync' in d));
  assert.ok(!JSON.stringify(d).includes(process.env.SESSION_SECRET));
});
test('script styles expose five defaults and private style creation fails closed without Redis',async()=>{
  const stylesResponse=await req('script-styles');
  assert.equal(stylesResponse.status,200);
  const styles=await stylesResponse.json();
  assert.equal(styles.defaults.length,5);
  assert.deepEqual(styles.custom,[]);
  const create=await req('script-style-create',{name:'Của tôi',prompt:'Viết ngắn và tự nhiên'});
  assert.equal(create.status,503);
  assert.equal((await create.json()).code,'REDIS_REQUIRED');
  const update=await req('script-style-update',{styleId:'custom-test',name:'Của tôi',prompt:'Prompt mới'});
  assert.equal(update.status,503);
  assert.equal((await update.json()).code,'REDIS_REQUIRED');
});

test('admin state lists ten children plus admin',async()=>{
  const r=await req('admin-state',{}); assert.equal(r.status,200); const d=await r.json(); assert.equal(d.users.length,11); assert.equal(d.redis,false); assert.equal(d.scriptWriting.provider,'deepseek'); assert.equal(d.scriptWriting.model,'deepseek-flash'); assert.equal(d.scriptWriting.openaiConfigured,true); assert.equal(d.scriptWriting.deepseekConfigured,true); assert.equal(d.diagnostics.openai.hint,'sk-proj-…9CgA'); assert.ok(!JSON.stringify(d).includes('sk-proj-testkey-9CgA'));
});
test('admin writing mode is validated and cannot be persisted without Redis',async()=>{
  const invalid=await req('admin-save-script-writing-provider',{provider:'gemini'}); assert.equal(invalid.status,400);
  const missingRedis=await req('admin-save-script-writing-provider',{provider:'openai'}); assert.equal(missingRedis.status,503); assert.equal((await missingRedis.json()).code,'REDIS_REQUIRED');
});
test('adding a trend voice fails closed until shared Redis is configured',async()=>{
  const r=await req('admin-add-trend-voice',{label:'Giọng Trend',code:'trend-voice-code'});
  assert.equal(r.status,503);
  assert.equal((await r.json()).code,'REDIS_REQUIRED');
});

test('adding a voice fails closed until shared Redis is configured',async()=>{
  const r=await req('admin-add-voice',{label:'Giọng Pro',code:'professional-voice-code'}); assert.equal(r.status,503); assert.equal((await r.json()).code,'REDIS_REQUIRED');
});
test('removed provider routes no longer exist',async()=>{
  for(const action of ['tts','lip-submit','lip-status','google-start','google-file','google-delete','google-chunk']) assert.equal((await req(action,{})).status,404);
});
test('cross-origin login is rejected',async()=>{
  cookie=''; assert.equal((await req('login',{username:'admin',password:process.env.APP_PASSWORD},'https://evil.test')).status,403);
});


test('member accounts still require a password',async()=>{
  cookie='';
  const missing=await req('login',{username:'user01',password:''});
  assert.equal(missing.status,400);
});
