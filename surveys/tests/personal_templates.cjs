'use strict';
// Focused mock tests: no MySQL/browser involved.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const dir = path.resolve(__dirname,'..');
const js = fs.readFileSync(path.join(dir,'public/assets/personal-templates.js'),'utf8');
new vm.Script(js);
let apiCalls = [];
const template = { name:'تقييم درس', performance:1, definition:{axes:[{name:'التخطيط',qs:[{text:'سؤال',options:['لا','نوعاً ما','نعم'],type:'rating3'}]}]} };
const ctx=vm.createContext({
  structuredClone,URLSearchParams,
  location:{search:'',pathname:'/surveys/public/'},
  history:{replaceState(){}},
  sessionInfo:{base_url:'https://example.org/surveys/public'},
  e:s=>String(s),me:{name:'معلمة',school_name:'مدرستي'},
  busy:false,editingId:null,editingRevision:0,templateEditingId:null,editorAxis:0,editQuestionIndex:null,
  customSurvey:{axes:[]},
  editorModel:()=>({title:'استبيان جديد',teacher:'معلمة',kind:'custom',performance:false,axes:[{name:'محور',qs:[]}]}),
  newCustom(){ctx.customSurvey=ctx.editorModel();},renderBuilder(){},editDraft:async()=>{},
  surveyButtons:s=>`<div><button>الأصل</button></div>`,surveysHub:async()=>{},route:async()=>{},
  api:async(op,data,params)=>{apiCalls.push({op,data,params});
    if(op==='personal_template_get')return{template};
    if(op==='personal_template_update')return{ok:true,message:'حُفظ'};
    if(op==='personal_templates')return{items:[]};
    if(op==='personal_template_shared')return{template:{...template,author:'الزميلة'}};
    if(op==='personal_template_share')return{sharing_enabled:true,share_token:'a'.repeat(48)};
    return{ok:true,message:'حُفظ'};
  },
  stage:{querySelector:()=>null},
  portal(){},notify(){},confirm:()=>true,alert(){},prompt:()=>null,
  navigator:{clipboard:{writeText:async()=>{}}},
  document:{createElement:()=>({}),getElementById:()=>null},
  console,
});
vm.runInContext(js,ctx);
(async()=>{
  // Shared and personal templates must be cloned before editing.
  await vm.runInContext('madarUsePersonalTemplate(10)',ctx);
  assert.equal(vm.runInContext('customSurvey.title',ctx),'تقييم درس — نسخة');
  assert.equal(vm.runInContext('customSurvey.kind',ctx),'custom');
  assert.equal(vm.runInContext('customSurvey.axes[0].qs[0].text',ctx),'سؤال');
  vm.runInContext("customSurvey.axes[0].qs[0].text='تعديل'",ctx);
  assert.equal(template.definition.axes[0].qs[0].text,'سؤال','template should not mutate when editing a copy');
  // Edit a personal template: save without modifying any survey or response.
  await vm.runInContext('madarEditPersonalTemplate(10)',ctx);
  await vm.runInContext('madarSavePersonalTemplateEdit()',ctx);
  assert(apiCalls.find(x=>x.op==='personal_template_update'));
  assert(!apiCalls.some(x=>x.op==='submit'||x.op==='save'),'saving personal template should not submit a survey');
  // Survey file action still includes existing actions.
  const buttons=vm.runInContext("surveyButtons({id:25})",ctx);
  assert(buttons.includes('الأصل') && buttons.includes('حفظ كقالب خاص'));
  const schema=fs.readFileSync(path.join(dir,'database/migrations/20261019_personal_templates.sql'),'utf8');
  assert(schema.includes('CREATE TABLE IF NOT EXISTS ms_personal_templates'));
  assert(!schema.match(/DROP TABLE|DELETE FROM ms_surveys|ALTER TABLE ms_responses/i));
  console.log('PASS: independent template clone, update routing, existing survey actions preserved, additive SQL migration. (mock tests)');
})().catch(err=>{console.error(err);process.exitCode=1;});
