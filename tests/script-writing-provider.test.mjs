import test from 'node:test';
import assert from 'node:assert/strict';
import { generateText, models } from '../lib/providers.mjs';

process.env.APP_PASSWORD='test-only-password-123456';
process.env.SESSION_SECRET='test-only-secret-DO-NOT-USE-IN-PRODUCTION-123456';
process.env.APP_USERS_JSON='{}';
process.env.UPSTASH_REDIS_REST_URL='https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN='redis-test-token';
process.env.OPENAI_API_KEY='openai-test-key';
process.env.OPENAI_MODEL='gpt-5-mini';
process.env.SCRIPT_WRITING_PROVIDER='openai';

const originalFetch=global.fetch;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});

test.after(()=>{global.fetch=originalFetch});

test('ChatGPT mode is used only for script writing with the configured OpenAI model',async()=>{
  const calls=[];
  global.fetch=async(url,options={})=>{
    const href=String(url); calls.push({href,options});
    if(href==='https://redis.test/'||href==='https://redis.test'){
      const args=JSON.parse(options.body);
      if(args[0]==='GET')return json({result:null});
      if(args[0]==='EVAL')return json({result:1});
      throw new Error('Unexpected Redis command '+JSON.stringify(args));
    }
    if(href==='https://api.openai.com/v1/chat/completions'){
      const body=JSON.parse(options.body);
      assert.equal(options.headers.Authorization,'Bearer openai-test-key');
      assert.equal(body.model,'gpt-5-mini');
      assert.equal(body.max_completion_tokens,2500);
      assert.equal(body.stream,false);
      assert.equal('thinking' in body,false);
      assert.equal(body.messages[0].role,'system');
      assert.match(body.messages[0].content,/PROMPT CHUNG BẮT BUỘC/);
      assert.match(body.messages[0].content,/PROMPT TẠO GÓC KHAI THÁC/);
      assert.equal(body.messages[1].role,'user');
      return json({choices:[{finish_reason:'stop',message:{content:'Một câu chuyện có góc nhìn riêng.'}}],usage:{prompt_tokens:10,completion_tokens:8,total_tokens:18}});
    }
    throw new Error('Unexpected URL '+href);
  };

  const out=await generateText('user01',{duration:10,title:'Một chậu cây đang ra quả',style:'Review TikTok',stylePrompt:'Có hook và câu chốt.'});
  assert.equal(out.text,'Một câu chuyện có góc nhìn riêng.');
  assert.equal(out.usage.total_tokens,18);
  assert.equal(models().openai,'gpt-5-mini');
  assert.equal(calls.filter(x=>x.href==='https://api.openai.com/v1/chat/completions').length,1);
  assert.equal(calls.filter(x=>x.href==='https://api.deepseek.com/chat/completions').length,0);
});
