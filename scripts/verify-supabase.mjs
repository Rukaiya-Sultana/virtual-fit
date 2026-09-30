// Quick verification: counts + a sample row straight from the configured database.
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

try {
  const env = await readFile(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env - fine */ }

const prisma = new PrismaClient();
const [users, categories, products] = await Promise.all([
  prisma.user.count(),
  prisma.category.count(),
  prisma.product.count(),
]);
const sample = await prisma.product.findFirst({ select: { id: true, name: true, price: true, categoryId: true } });
const db = await prisma.$queryRawUnsafe("select current_database() as db, inet_server_addr() as addr");
console.log("server:", JSON.stringify(db));
console.log(`counts: users=${users} categories=${categories} products=${products}`);
console.log("sample product:", JSON.stringify(sample));
await prisma.$disconnect();
