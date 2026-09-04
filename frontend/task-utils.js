export function isMyTask(task, sub){return Boolean(sub&&task.assignee_id===sub);}
export function localDateKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
export function myTaskOrder(a,b,today=localDateKey()){
 const bucket=t=>t.status==="completed"?3:!t.due_date?2:t.due_date<today?0:1;
 return bucket(a)-bucket(b)||(a.due_date||"9999").localeCompare(b.due_date||"9999")||Number(a.task_number)-Number(b.task_number);
}
export function taskCounts(tasks,today=localDateKey()){
 const in7=new Date(`${today}T00:00:00Z`);in7.setUTCDate(in7.getUTCDate()+7);const limit=in7.toISOString().slice(0,10);
 return {not_started:tasks.filter(t=>t.status==="not_started").length,in_progress:tasks.filter(t=>t.status==="in_progress").length,overdue:tasks.filter(t=>t.status!=="completed"&&t.due_date&&t.due_date<today).length,due_soon:tasks.filter(t=>t.status!=="completed"&&t.due_date&&t.due_date>=today&&t.due_date<=limit).length};
}
export function dueDateState(task,today=localDateKey()){
 if(task.status==="completed"||!task.due_date)return null;
 if(task.due_date<today)return {kind:"overdue",label:"期限超過"};
 if(task.due_date===today)return {kind:"today",label:"本日期限"};
 const end=new Date(`${today}T00:00:00`);end.setDate(end.getDate()+7);
 return task.due_date<=localDateKey(end)?{kind:"soon",label:"期限間近"}:null;
}
export function filterTasksByCompletion(tasks,showCompleted){return showCompleted?tasks:tasks.filter(task=>task.status!=="completed");}
export function syncCompletedButtons(buttons,showCompleted){for(const button of buttons)button.setAttribute("aria-pressed",String((button.dataset.value==="1")===showCompleted));}
