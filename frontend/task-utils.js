export function isMyTask(task, sub){return Boolean(sub&&task.assignee_id===sub);}
export function myTaskOrder(a,b,today=new Date().toISOString().slice(0,10)){
 const bucket=t=>t.status==="completed"?3:!t.due_date?2:t.due_date<today?0:1;
 return bucket(a)-bucket(b)||(a.due_date||"9999").localeCompare(b.due_date||"9999")||Number(a.task_number)-Number(b.task_number);
}
export function taskCounts(tasks,today=new Date().toISOString().slice(0,10)){
 const in7=new Date(`${today}T00:00:00Z`);in7.setUTCDate(in7.getUTCDate()+7);const limit=in7.toISOString().slice(0,10);
 return {not_started:tasks.filter(t=>t.status==="not_started").length,in_progress:tasks.filter(t=>t.status==="in_progress").length,overdue:tasks.filter(t=>t.status!=="completed"&&t.due_date&&t.due_date<today).length,due_soon:tasks.filter(t=>t.status!=="completed"&&t.due_date&&t.due_date>=today&&t.due_date<=limit).length};
}
