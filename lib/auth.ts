import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { workspaceDomain } from '@/lib/workspace-domain';

export const WORKSPACE_DOMAIN = workspaceDomain();

export const authOptions: NextAuthOptions = {
  // Required in production (Vercel: set NEXTAUTH_SECRET in Environment Variables).
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          // UX hint: prefer Workspace accounts (not a security control by itself).
          hd: workspaceDomain(),
          prompt: 'select_account',
        },
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user }) {
      const allowed = workspaceDomain();
      const email = user.email?.toLowerCase() ?? '';
      if (!email.endsWith(`@${allowed}`)) {
        return `/login?error=workspace&allowed=${encodeURIComponent(allowed)}`;
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = typeof token.email === 'string' ? token.email : session.user.email;
        session.user.name = typeof token.name === 'string' ? token.name : session.user.name;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
};

