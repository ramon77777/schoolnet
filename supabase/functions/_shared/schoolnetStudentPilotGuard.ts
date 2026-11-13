// SCHOOLNET prod pilot: refuse writes unless this one request is explicitly selected.
const REQUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function schoolnetStudentPilotWriteAllowed(input: {
  accountsEnabled: boolean;
  pilotRequestId: string | null | undefined;
  requestId: string;
}): boolean {
  const pilot = typeof input.pilotRequestId === 'string' ? input.pilotRequestId.trim() : '';
  const request = typeof input.requestId === 'string' ? input.requestId.trim() : '';
  return input.accountsEnabled === true && REQUEST_UUID.test(pilot) && REQUEST_UUID.test(request) &&
    pilot.toLowerCase() === request.toLowerCase();
}
