(() => {
  const now = Date.now(); const day = 86400000;
  const iso = ms => new Date(ms).toISOString(); const ymd = ms => new Date(ms).toISOString().slice(0,10);
  const mods = [{ id:'m1', code:'BWL', title:'Betriebswirtschaft', accent:'#b45309', targetGrade:5, createdAt:now-90*day, updatedAt:now }];
  const objs = [
    { id:'o1', moduleId:'m1', number:1, title:'Deckungsbeitragsrechnung sicher anwenden', description:'', status:'todo', confidence:2, notes:'', confidenceHistory:[], lastTouched:now-9*day, lastReviewed:now-12*day, totalStudyTime:45, reviewHistory:[{timestamp:now-5*day,outcome:'shaky',interval:4}], reviewSchedule:{nextReview:now-1*day,interval:4,reviewCount:2}, createdAt:now-60*day, updatedAt:now, sessionHistory:[] },
    { id:'o2', moduleId:'m1', number:2, title:'Break-even-Point interpretieren', description:'', status:'todo', confidence:3, notes:'', confidenceHistory:[], lastTouched:now-2*day, lastReviewed:now-1*day, totalStudyTime:30, reviewHistory:[], reviewSchedule:{nextReview:now+2*day,interval:4,reviewCount:1}, createdAt:now-30*day, updatedAt:now, sessionHistory:[] },
  ];
  const resources = [{ id:'r1', moduleId:'m1', name:'Skript BWL Kapitel 4', type:'pdf', url:'', notes:'Kostenrechnung', understood:true, usedCount:1, linkedObjectiveIds:['o1'], createdAt:now-40*day, updatedAt:now }];
  const sessions = [{ id:'s1', moduleId:'m1', startTime:iso(now-1*day), duration:50, linkedObjectiveIds:['o1'], linkedResourceIds:['r1'], note:'Deckungsbeitrag gerechnet', createdAt:now-1*day, updatedAt:now }];
  const exams = [{ id:'e1', moduleId:'m1', name:'BWL Schlussprüfung', date:ymd(now+12*day), weight:50, score:'', max:'', linkedObjectiveIds:['o1','o2'], objectiveResults:[{objectiveId:'o1',rating:'weak',note:''},{objectiveId:'o2',rating:'okay',note:''}], description:'', isMock:false, durationMin:90, createdAt:now-40*day, updatedAt:now }];
  const captures = [{ id:'c1', moduleId:'m1', objectiveId:'o1', type:'mistake', content:'Fixkosten nicht abgezogen.', tags:[], timestamp:iso(now-1*day), createdAt:now-1*day, updatedAt:now }];
  const planItems = [{ id:'p1', moduleId:'m1', week:1, title:'Deckungsbeitrag', text:'10 Übungsaufgaben rechnen', type:'task', linkedObjectiveIds:['o1'], linkedResourceIds:['r1'], done:false, dropped:false, notes:'', dueDate:ymd(now+1*day), createdAt:now-7*day, updatedAt:now }];
  const st = { schemaVersion:1, modules:mods, learningObjectives:objs, resources, studySessions:sessions, exams, examResults:[], planItems, captures, weeklyReviews:[], tombstones:[], settings:{theme:'light',currentModuleId:'m1',contextMode:'plan',todaySkipDate:new Date().toISOString().slice(0,10)} };
  window.EMVS.setState(st); window.EMVS.save(); window.EMVS.refresh();
  return { modules: window.EMVS.getState().modules.length };
})();
