export function updateSearchParams(current, changes={}) {
 const params=new URLSearchParams(current);
 for(const [key,value] of Object.entries(changes)){
  if(value===undefined||value===null||value==="")params.delete(key);else params.set(key,String(value));
 }
 return params;
}
export function searchUrl(path,current,changes={}){const value=updateSearchParams(current,changes).toString();return `${path}${value?`?${value}`:""}`;}
export function isMyTasksSearch(search){return new URLSearchParams(search).get("assignee")==="me";}
export function completedFromSearch(search){const value=new URLSearchParams(search).get("showCompleted");return value===null?!isMyTasksSearch(search):value==="1";}
