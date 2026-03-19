import { DrizzleAdapter } from "@auth/drizzle-adapter";
import * as bcrypt from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authenticator } from "otplib";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { runtimeConfig } from "@/lib/config";
import { getRedisClient } from "@/lib/redis";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isAdmin?: boolean;
  }
}

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(runtimeConfig.auth.passwordMinLength),
  totpCode: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  basePath: "/api/auth",
  adapter: DrizzleAdapter(db),
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totpCode: {},
      },
      authorize: async (credentials) => {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase();

        // Rate limiting for login attempts
        const redis = getRedisClient();
        if (redis) {
          try {
            const rateWindow = Math.floor(Date.now() / 600000); // 10 minute window
            const rateKey = `rate:login:${email}:${rateWindow}`;
            const current = await redis.incr(rateKey);
            if (current === 1) {
              await redis.expire(rateKey, 600 + 1);
            }
            if (current > 10) {
              // Limit to 10 attempts per 10 minutes per email
              throw new Error("Too many login attempts. Please try again in 10 minutes.");
            }
          } catch (e: unknown) {
            const error = e as Error;
            if (error.message.includes("Too many login attempts")) {
              throw error;
            }
            // Fail open for Redis connection errors
          }
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        if (runtimeConfig.auth.requireEmailVerification && !user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        // TOTP 2FA check
        if (user.totpEnabled && user.totpSecret) {
          if (!parsed.data.totpCode) {
            throw new Error("TOTP_REQUIRED");
          }
          let secret = user.totpSecret;
          try { secret = decrypt(user.totpSecret); } catch { /* not encrypted, use raw */ }
          const isValidTotp = authenticator.verify({ token: parsed.data.totpCode, secret });
          if (!isValidTotp) {
            throw new Error("TOTP_INVALID");
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isAdmin: user.isAdmin,
        };
      },
    }),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? [GitHub({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET })]
      : []),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.isAdmin = user.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.isAdmin = token.isAdmin;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return url;
      // Allows callback URLs on the same origin
      if (new URL(url).origin === new URL(baseUrl).origin) return url;
      return baseUrl;
    },
  },
});
