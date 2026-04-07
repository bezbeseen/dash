import { getServerSession } from 'next-auth/next';
import { authOptions, WORKSPACE_DOMAIN } from '@/lib/auth';

export async function requireSessionEmail(): Promise<string> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() ?? '';
  if (!email) throw new Error('Not signed in.');
  if (!email.endsWith(`@${WORKSPACE_DOMAIN}`)) throw new Error('Not authorized.');
  return email;
}

