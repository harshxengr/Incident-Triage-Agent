import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// avoids exhausting the connection pool when Bun hot-reloads this module
declare global {
  var __prisma: PrismaClient | undefined;
}

let prismaClient: PrismaClient;

if (globalThis.__prisma) {
  prismaClient = globalThis.__prisma;
} else {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  prismaClient = new PrismaClient({ adapter });
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}