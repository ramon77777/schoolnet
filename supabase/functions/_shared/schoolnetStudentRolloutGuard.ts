const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type StudentRolloutAccess={
 enabled:boolean;generalReleaseEnabled:boolean;
 pilotRequestId:unknown;canaryRequestId:unknown;requestId:unknown;
};
export function schoolnetStudentRequestIdIsValid(value:unknown):value is string{
 return typeof value==='string'&&UUID.test(value.trim());
}
export function schoolnetStudentRolloutAllowed(input:StudentRolloutAccess):boolean{
 if(input.enabled!==true||!schoolnetStudentRequestIdIsValid(input.requestId))return false;
 if(input.generalReleaseEnabled===true)return true;
 const requestId=input.requestId.trim().toLowerCase();
 return [input.pilotRequestId,input.canaryRequestId].some(x=>
   schoolnetStudentRequestIdIsValid(x)&&x.trim().toLowerCase()===requestId);
}
