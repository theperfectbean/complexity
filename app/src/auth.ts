import { DrizzleAdapter } from "@auth/drizzle-adapter";
import * as bcrypt from "bcrypt-ts";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { runtimeConfig } from "@/lib/config";
import { getRedisClient } from "@/lib/redis";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(runtimeConfig.auth.passwordMinLength),
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
          } catch (e: any) {
            if (e.message.includes("Too many login attempts")) {
              throw e;
            }
            // Fail open for Redis connection errors
          }
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          return null;
        }

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValid) {
          return null;
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
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.isAdmin = (user as any).isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).isAdmin = token.isAdmin;
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
