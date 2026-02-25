import { authenticateRequest } from '@/lib/decision-os/auth/helper';

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(request.headers.get('Authorization'));
    if (!auth.success) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    return Response.json({
      household_key: auth.context.householdKey,
      user_profile_id: auth.context.userProfileId,
      auth_user_id: auth.context.userId,
    });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
