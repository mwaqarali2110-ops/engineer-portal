// Exact-ID refresh regression test: no network, database writes or reference re-resolution.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.DEV','false'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const id='00bf4605-1234-4123-8123-123456789abc';
const row={id,full_name:'Fixture Customer',phone:'03000000000',city:'Islamabad',address:'Fixture',booking_type:'solar_survey',service_type:'solar_survey',preferred_date:'2026-09-30',preferred_time_slot:'Team confirmed',status:'survey_scheduled',current_milestone:'survey_scheduled',journey_status:'active',confirmed_survey_at:'2026-09-30T06:00:00Z',created_at:'2026-09-26T00:00:00Z'};
const calls=[];
const query={select(columns){calls.push(['select',columns]);return this;},eq(column,value){calls.push(['eq',column,value]);return this;},limit(value){calls.push(['limit',value]);return this;},maybeSingle:async()=>({data:row,error:null}),gte(){throw Error('UUID prefix lookup must not run during exact-ID refresh');},lte(){throw Error('UUID prefix lookup must not run during exact-ID refresh');}};
const client={auth:{getSession:async()=>({data:{session:{user:{id:'engineer'}}}})},from(table){assert.equal(table,'survey_bookings');return query;}};
const original=Module._load;
Module._load=function(name,parent,isMain){
  if(name==='../lib/env')return {isMockMode:false};
  if(name==='../lib/supabase')return {getSupabaseClient:()=>client};
  if(name==='../features/surveys/mockSurvey')return {mockSurveyRecords:[]};
  return original.call(this,name,parent,isMain);
};
const {getSurveyById}=require(path.resolve(__dirname,'../src/services/surveyService.ts'));
(async()=>{
  const record=await getSurveyById(id.toUpperCase());
  assert.equal(record.details.bookingId,id);
  assert.deepEqual(calls.find(call=>call[0]==='eq'),['eq','id',id]);
  await assert.rejects(()=>getSurveyById('KA-00BF4605'),/no longer accessible/i);
  console.log('PASS exact-ID refresh: canonical booking UUID is queried directly; display reference parsing and UUID-prefix search are not used.');
})().catch(error=>{console.error(error);process.exitCode=1;});
