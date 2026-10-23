'use strict';
/* Madar Surveys: axis-by-axis editor and teacher-owned reusable templates.
   Uses the existing API/session, permissions and question schema. */
let personalTemplateEditingId = null;
let personalTemplateListFilter = 'all';

function madarCloneTemplateToBuilder(t, titleSuffix = '') {
  const axes = structuredClone(t.definition.axes);
  personalTemplateEditingId = null;
  newCustom();
  customSurvey = {
    ...editorModel(),
    title: t.name + titleSuffix,
    kind: 'custom',
    performance: Boolean(Number(t.performance)),
    axes,
  };
  editorAxis = 0;
  renderBuilder();
}

// Preserve original survey and all its responses. The duplicate begins unsaved.
duplicateSurvey = async function (id) {
  try {
    const s = (await api('get', null, { id })).survey;
    madarCloneTemplateToBuilder({ name: s.title, performance: s.performance,
      definition: { axes: s.axes } }, ' — نسخة');
    customSurvey.lesson = s.lesson || '';
    renderBuilder();
    notify('تم إنشاء نسخة مستقلة قابلة للتعديل. احفظيها كمسودة قبل النشر.');
  } catch (err) { notify(err.message, true); }
};

const madarOriginalNewCustom = newCustom;
newCustom = function (...args) {
  personalTemplateEditingId = null;
  return madarOriginalNewCustom(...args);
};

const madarOriginalRenderBuilder = renderBuilder;
renderBuilder = function (...args) {
  madarOriginalRenderBuilder(...args);
  const card = stage.querySelector('.builder-card');
  if (!card || !customSurvey?.axes?.length) return;
  const ready = customSurvey.kind !== 'custom' && !templateEditingId;
  if (ready) {
    const button = document.createElement('button');
    button.className = 'madar-alt-action';
    button.type = 'button';
    button.textContent = 'تخصيص القالب وتعديل أسئلته';
    button.onclick = () => { customSurvey.kind = 'custom'; renderBuilder(); };
    card.querySelector('.builder-actions')?.prepend(button);
    return;
  }
  // Keep the existing admin template editor unchanged.
  if (templateEditingId) return;
  const axis = customSurvey.axes[editorAxis];
  const top = document.createElement('div');
  top.className = 'madar-axis-editor';
  top.innerHTML = `
    <div class="madar-axis-heading">
      <div><span class="madar-axis-eyebrow">منشئ استبيانات مدار · المحاور</span>
      <h2>المحور ${editorAxis + 1} من ${customSurvey.axes.length}</h2>
      <p>تُعرض أسئلة كل محور في صفحة تحرير مستقلة.</p></div>
      <span class="madar-axis-count">${axis.qs.length} أسئلة</span>
    </div>
    <div class="madar-axis-tabs" aria-label="الانتقال بين المحاور">
      ${customSurvey.axes.map((a, i) => `<button type="button" class="madar-axis-tab ${i === editorAxis ? 'is-active' : ''}"
        aria-current="${i === editorAxis ? 'step' : 'false'}" onclick="madarSetEditorAxis(${i})">${i + 1}. ${e(a.name)}</button>`).join('')}
    </div>
    <label class="madar-axis-name">اسم هذا المحور
      <input id="madarAxisLabel" maxlength="200" value="${e(axis.name)}" aria-label="اسم المحور" />
    </label>
    <div class="madar-axis-page-actions">
      <button type="button" onclick="madarSetEditorAxis(${editorAxis - 1})" ${editorAxis === 0 ? 'disabled' : ''}>→ المحور السابق</button>
      <button type="button" onclick="madarAddAxis()">+ إضافة محور</button>
      <button type="button" onclick="madarRemoveAxis()" ${customSurvey.axes.length === 1 ? 'disabled' : ''}>حذف المحور</button>
      <button type="button" onclick="madarSetEditorAxis(${editorAxis + 1})" ${editorAxis === customSurvey.axes.length - 1 ? 'disabled' : ''}>المحور التالي ←</button>
    </div>
    <details class="madar-question-toolbox">
      <summary>صندوق أدوات الأسئلة <span>اختاري النوع ثم اكتبي السؤال</span></summary>
      <div class="madar-question-type-actions">
        <button type="button" onclick="madarChooseQuestionType('rating3')">مقياس ثلاثي</button>
        <button type="button" onclick="madarChooseQuestionType('rating5')">مقياس خماسي</button>
        <button type="button" onclick="madarChooseQuestionType('choice')">اختيار واحد مخصص</button>
      </div>
      <small>هذه الأنواع متوافقة مع التحليل الحالي. ستضاف الأنواع الأخرى بعد تحديث طريقة تخزين الإجابات والتقارير.</small>
    </details>`;
  top.querySelector('.madar-axis-heading').after(top.querySelector('.madar-axis-page-actions'));
  const anchor = card.querySelector('.builder-extras') || card.querySelector('.add-q-row');
  card.insertBefore(top, anchor);
  document.getElementById('madarAxisLabel').addEventListener('input', event => {
    customSurvey.axes[editorAxis].name = event.target.value;
    const hidden = document.getElementById('bAxisName');
    if (hidden) hidden.value = event.target.value;
  });
  const questions = card.querySelectorAll('.q-item');
  questions.forEach((item, i) => {
    const actions = document.createElement('div');
    actions.className = 'madar-question-actions';
    actions.innerHTML = `<button type="button" onclick="madarMoveQuestion(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="تحريك السؤال للأعلى">↑</button>
      <button type="button" onclick="madarMoveQuestion(${i},1)" ${i === questions.length - 1 ? 'disabled' : ''} aria-label="تحريك السؤال للأسفل">↓</button>
      <button type="button" onclick="madarCopyQuestion(${i})">نسخ</button>`;
    item.append(actions);
  });
  if (personalTemplateEditingId) {
    const actions = card.querySelector('.builder-actions');
    if (actions) actions.innerHTML = `<button type="button" class="btn-start" onclick="madarSavePersonalTemplateEdit()">حفظ تعديلات القالب</button>
      <button type="button" class="madar-alt-action" onclick="personalTemplateLibrary()">رجوع إلى مكتبتي</button>`;
  } else {
    const actions = card.querySelector('.builder-actions');
    if (actions && !templateEditingId) {
      const button = document.createElement('button');
      button.className = 'madar-alt-action';
      button.type = 'button';
      button.textContent = 'حفظ نسخة في قوالبي الخاصة';
      button.onclick = madarSaveBuilderAsTemplate;
      actions.append(button);
    }
  }
};

function madarPendingQuestion() {
  const text = document.getElementById('newQText');
  return text && (text.value.trim() !== '' || editQuestionIndex !== null);
}
function madarSetEditorAxis(index) {
  if (index < 0 || index >= customSurvey.axes.length || index === editorAxis) return;
  if (madarPendingQuestion() && !confirm('هناك سؤال لم يُحفظ. هل تريدين الانتقال وفقدان تحرير هذا السؤال؟')) return;
  editorAxis = index;
  editQuestionIndex = null;
  renderBuilder();
  stage.querySelector('.builder-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function madarAddAxis() {
  if (madarPendingQuestion() && !confirm('احفظي السؤال أولًا. هل تريدين تجاهل تحريره؟')) return;
  try { addAxis(); } catch (err) { notify(err.message, true); }
}
function madarRemoveAxis() {
  try { removeAxis(); } catch (err) { notify(err.message, true); }
}
function madarChooseQuestionType(type) {
  document.getElementById('bType').value = type;
  document.getElementById('bType').dispatchEvent(new Event('change'));
  document.getElementById('newQText')?.focus();
}
function madarMoveQuestion(index, distance) {
  const list = customSurvey.axes[editorAxis].qs;
  const destination = index + distance;
  if (destination < 0 || destination >= list.length) return;
  [list[index], list[destination]] = [list[destination], list[index]];
  editQuestionIndex = null;
  renderBuilder();
}
function madarCopyQuestion(index) {
  const list = customSurvey.axes[editorAxis].qs;
  if (list.length >= 100) return notify('بلغ المحور الحد الأقصى من الأسئلة.', true);
  list.splice(index + 1, 0, structuredClone(list[index]));
  editQuestionIndex = null;
  renderBuilder();
}

async function madarSaveBuilderAsTemplate() {
  if (busy) return;
  busy = true;
  try {
    const result = await api('save', { ...customSurvey, id: editingId, revision: editingRevision });
    editingId = result.survey.id;
    editingRevision = result.survey.revision;
    customSurvey = result.survey;
    const title = prompt('اسم القالب داخل مكتبتك:', customSurvey.title);
    if (title === null) return notify('حُفظ الاستبيان كمسودة. لم يُنشأ قالب جديد.');
    if (!title.trim()) return notify('اكتبي اسمًا للقالب.', true);
    const result2 = await api('personal_template_create', { survey_id: editingId, name: title.trim() });
    await personalTemplateLibrary();
    notify(result2.message);
  } catch (err) { notify(err.message, true); }
  finally { busy = false; }
}
async function madarSaveSurveyAsPersonalTemplate(id) {
  try {
    const s = (await api('get', null, { id })).survey;
    const name = prompt('اسم القالب الذي تريدين حفظه:', s.title);
    if (name === null) return;
    if (!name.trim()) return notify('اكتبي اسم القالب.', true);
    const result = await api('personal_template_create', { survey_id: id, name: name.trim() });
    await personalTemplateLibrary();
    notify(result.message);
  } catch (err) { notify(err.message, true); }
}
const madarOriginalSurveyButtons = surveyButtons;
surveyButtons = function (s) {
  return madarOriginalSurveyButtons(s).replace('</div>', `<button onclick="madarSaveSurveyAsPersonalTemplate(${Number(s.id)})">حفظ كقالب خاص</button></div>`);
};

// Leaving personal template editing to edit a normal draft must restore survey actions.
const madarOriginalEditDraft = editDraft;
editDraft = async function (...args) { personalTemplateEditingId = null; return madarOriginalEditDraft(...args); };

const madarOriginalSurveysHub = surveysHub;
surveysHub = async function (...args) {
  const pendingHub=madarOriginalSurveysHub(...args);
  const grid = stage.querySelector('.survey-tool-grid');
  if (grid && !grid.querySelector('[onclick="personalTemplateLibrary()"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'survey-tool';
    button.onclick = () => personalTemplateLibrary();
    button.innerHTML = `<span class="tool-art" aria-hidden="true">▦</span><strong>مكتبة قوالبي</strong><span>استخدمي استبياناتك مرة أخرى وشاركيها مع زميلاتك</span><i>فتح مكتبتي ←</i>`;
    grid.append(button);
  }
  await pendingHub;
};

async function personalTemplateLibrary(filter = personalTemplateListFilter) {
  try {
    personalTemplateListFilter = filter;
    const result = await api('personal_templates');
    const visible = result.items.filter(t => filter === 'all' || (filter === 'mine' ? !t.source_name : Boolean(t.source_name)));
    const changingLibraryFilter=Boolean(stage.querySelector('.madar-personal-library'));
    portal(`<section class="survey-tools madar-personal-library">
      <p class="tools-kicker">مساحة المعلمة الخاصة</p>
      <h1>مكتبة قوالبي</h1>
      <p class="tools-intro">${filter === 'received' ? 'هنا تظهر القوالب التي ترسلها إليكِ المعلمات؛ تُحفظ لكِ نسخة مستقلة دون نتائجهن.' : 'احتفظي بالقالب الأصلي، وأرسلي نسخة إلى معلمة من زر «إرسال قالب لمعلمة».'}</p>
      <div class="madar-template-filters">
        <button class="${filter === 'all' ? 'active' : ''}" onclick="personalTemplateLibrary('all')">الجميع</button>
        <button class="${filter === 'mine' ? 'active' : ''}" onclick="personalTemplateLibrary('mine')">قوالبي الخاصة</button>
        <button class="${filter === 'received' ? 'active' : ''}" onclick="personalTemplateLibrary('received')">تمت مشاركتها معي</button>
      </div>
      <div class="madar-my-templates">
        ${visible.map(t => `<article class="portal-card madar-personal-card">
          <span class="madar-template-label">${t.source_name ? `من المعلمة: ${e(t.source_name)}` : 'من تصميمي'}</span>
          <h2>${e(t.name)}</h2>
          <p>${t.sharing_enabled ? 'الرابط متاح للمعلمات المسجلات' : 'قالب خاص غير مشارك'}</p>
          <div class="portal-actions">
            <button onclick="madarUsePersonalTemplate(${Number(t.id)})">استخدام نسخة جديدة</button>
            <button onclick="madarEditPersonalTemplate(${Number(t.id)})">تعديل القالب</button>
            <button onclick="madarSetPersonalSharing(${Number(t.id)},${!Number(t.sharing_enabled)})">${Number(t.sharing_enabled) ? 'إيقاف المشاركة' : 'مشاركة القالب'}</button>
            ${Number(t.sharing_enabled) ? `<button onclick="madarShowTemplateLink(${Number(t.id)})">نسخ رابط المشاركة</button>` : ''}
            <button onclick="msSendToTeacher(${Number(t.id)})">إرسال قالب لمعلمة</button>
            <button onclick="msSchoolPublish(${Number(t.id)})">مشاركة مع المدرسة</button>
            <button onclick="msSchoolUnpublish(${Number(t.id)})">إيقاف مشاركة المدرسة</button>
            <button class="madar-danger" onclick="madarDeletePersonalTemplate(${Number(t.id)})">حذف القالب</button>
          </div>
        </article>`).join('') || '<div class="portal-card">لا توجد قوالب هنا بعد. احفظي أحد استبياناتك كقالب خاص.</div>'}
      </div>
      <div class="portal-actions"><button onclick="surveyGoBack()">عودة للخلف</button></div>
    </section>`);
    if(changingLibraryFilter)surveyBackViews.pop();
  } catch (err) { notify(err.message, true); }
}
async function madarUsePersonalTemplate(id) {
  try {
    const { template } = await api('personal_template_get', null, { id });
    madarCloneTemplateToBuilder(template, ' — نسخة');
    notify('هذه نسخة جديدة. عدّليها ثم احفظي المسودة؛ القالب الأصلي لم يتغير.');
  } catch (err) { notify(err.message, true); }
}
async function madarEditPersonalTemplate(id) {
  try {
    const { template } = await api('personal_template_get', null, { id });
    madarCloneTemplateToBuilder(template);
    personalTemplateEditingId = id;
    renderBuilder();
    notify('أنتِ تعدلين قالبك الخاص فقط. لن تتغير الاستبيانات المنشورة سابقًا.');
  } catch (err) { notify(err.message, true); }
}
async function madarSavePersonalTemplateEdit() {
  if (busy) return;
  busy = true;
  try {
    const id = personalTemplateEditingId;
    const name = customSurvey.title;
    const result = await api('personal_template_update', {
      id, name, performance: customSurvey.performance, axes: customSurvey.axes,
    });
    personalTemplateEditingId = null;
    await personalTemplateLibrary();
    notify(result.message);
  } catch (err) { notify(err.message, true); }
  finally { busy = false; }
}
async function madarSetPersonalSharing(id, enabled) {
  try {
    if (!enabled && !confirm('إيقاف المشاركة؟ الروابط السابقة ستتوقف، ولن تُحذف النسخ التي حفظتها زميلاتك.')) return;
    const result = await api('personal_template_share', { id, enabled });
    await personalTemplateLibrary();
    if (enabled) madarShareLinkBox(result.share_token);
    else notify('تم إيقاف مشاركة القالب وإبطال الرابط القديم.');
  } catch (err) { notify(err.message, true); }
}
async function madarShowTemplateLink(id) {
  try {
    const { template } = await api('personal_template_get', null, { id });
    if (!Number(template.sharing_enabled)) return notify('فعّلي مشاركة القالب أولًا.', true);
    madarShareLinkBox(template.share_token);
  } catch (err) { notify(err.message, true); }
}
function madarShareLinkBox(token) {
  const url = sessionInfo.base_url + '/?template=' + encodeURIComponent(token);
  const container = stage.querySelector('.madar-personal-library');
  if (!container) return;
  container.querySelector('.madar-template-share-box')?.remove();
  const box = document.createElement('div');
  box.className = 'portal-card madar-template-share-box';
  box.innerHTML = `<h2>رابط مشاركة القالب</h2>
    <p>يمكن للمعلمات المسجلات في مدار حفظ نسخة مستقلة من أسئلتك فقط، دون إجابات المشاركات ونتائجهن.</p>
    <input id="madarTemplateShareUrl" dir="ltr" readonly value="${e(url)}" aria-label="رابط مشاركة القالب">
    <div class="portal-actions"><button onclick="madarCopyTemplateLink()">نسخ الرابط</button></div>`;
  container.prepend(box);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function madarCopyTemplateLink() {
  const input = document.getElementById('madarTemplateShareUrl');
  if (!input) return;
  try { await navigator.clipboard.writeText(input.value); notify('تم نسخ رابط القالب.'); }
  catch (_) { input.focus(); input.select(); notify('حددي الرابط ثم انسخيه.'); }
}
async function madarDeletePersonalTemplate(id) {
  if (!confirm('حذف هذا القالب فقط؟ لن تُحذف الاستبيانات أو النتائج القديمة.')) return;
  try { await api('personal_template_delete', { id }); await personalTemplateLibrary(); notify('حُذف القالب فقط.'); }
  catch (err) { notify(err.message, true); }
}
async function madarSharedTemplateScreen(token) {
  try {
    const { template } = await api('personal_template_shared', null, { token });
    portal(`<div class="portal-card madar-shared-template">
      <p class="tools-kicker">قالب تمت مشاركته معك</p>
      <h1>${e(template.name)}</h1><p>من إعداد: ${e(template.author)}</p>
      <p>يحتوي على ${template.definition.axes.length} محاور. لا يحتوي الرابط على نتائج أو أسماء المشاركات.</p>
      <div class="portal-actions">
        <button onclick="madarUseSharedPersonalTemplate()">استخدام نسخة وتعديلها</button>
        <button onclick="madarImportSharedPersonalTemplate()">حفظه في مكتبتي</button>
        <button onclick="location.href='./'">العودة إلى مدار</button>
      </div>
    </div>`);
  } catch (err) { portal(`<div class="portal-card"><h1>رابط القالب</h1><p class="error-box">${e(err.message)}</p><a href="./">العودة إلى الاستبيانات</a></div>`); }
}
async function madarUseSharedPersonalTemplate() {
  try {
    const token = new URLSearchParams(location.search).get('template');
    const { template } = await api('personal_template_shared', null, { token });
    history.replaceState({}, '', location.pathname);
    madarCloneTemplateToBuilder(template, ' — نسخة');
    notify('فتحتِ نسخة مستقلة للتعديل. احفظيها كمسودة.');
  } catch (err) { notify(err.message, true); }
}
async function madarImportSharedPersonalTemplate() {
  try {
    const token = new URLSearchParams(location.search).get('template');
    const result = await api('personal_template_import', { token });
    history.replaceState({}, '', location.pathname);
    await personalTemplateLibrary('received');
    notify(result.message);
  } catch (err) { notify(err.message, true); }
}
const madarOriginalRoute = route;
route = async function (...args) {
  const params = new URLSearchParams(location.search);
  if (params.has('template') && !params.has('s')) {
    if (!me || me.is_guest) return authScreen();
    return madarSharedTemplateScreen(params.get('template'));
  }
  return madarOriginalRoute(...args);
};
