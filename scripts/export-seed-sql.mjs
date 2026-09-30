// One-time export: dump categories, products and users from the local SQLite
// database into Postgres-compatible INSERT statements (for Supabase bootstrap).
// Run BEFORE switching prisma/schema.prisma to postgresql.
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

try {
  const env = await readFile(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env - fine */ }

const prisma = new PrismaClient();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const iso = (d) => q(d instanceof Date ? d.toISOString() : new Date(d).toISOString());

const lines = ["-- Demo catalog + registered users exported from the local SQLite database."];

const categories = await prisma.category.findMany();
lines.push("\n-- Categories");
for (const c of categories) {
  lines.push(`INSERT INTO "Category" ("id","name") VALUES (${q(c.id)}, ${q(c.name)});`);
}

const products = await prisma.product.findMany({ orderBy: { id: "asc" } });
lines.push("\n-- Products (demo garment catalog)");
for (const p of products) {
  const cols = ["id","name","description","price","stock","categoryId","color","colorHex","fit","sleeve","styleJson","occasionsJson","formality","lengthFactor","assetPath","originalPath","thumbnailPath","leftShoulderX","leftShoulderY","rightShoulderX","rightShoulderY","leftHemX","leftHemY","rightHemX","rightHemY","width","height","sizesJson","badge","createdAt","updatedAt"];
  const vals = [q(p.id), q(p.name), p.description === null ? "NULL" : q(p.description), p.price, p.stock, q(p.categoryId), q(p.color), q(p.colorHex), q(p.fit), q(p.sleeve), q(p.styleJson), q(p.occasionsJson), p.formality, p.lengthFactor, q(p.assetPath), q(p.originalPath), q(p.thumbnailPath), p.leftShoulderX, p.leftShoulderY, p.rightShoulderX, p.rightShoulderY, p.leftHemX, p.leftHemY, p.rightHemX, p.rightHemY, p.width, p.height, p.sizesJson === null ? "NULL" : q(p.sizesJson), p.badge === null ? "NULL" : q(p.badge), iso(p.createdAt), iso(p.updatedAt)];
  lines.push(`INSERT INTO "Product" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${vals.join(",")});`);
}

const users = await prisma.user.findMany();
if (users.length) {
  lines.push("\n-- Registered users (password hashes included)");
  for (const u of users) {
    lines.push(`INSERT INTO "User" ("id","name","email","passwordHash","role","createdAt") VALUES (${q(u.id)}, ${q(u.name)}, ${q(u.email)}, ${q(u.passwordHash)}, ${q(u.role)}, ${iso(u.createdAt)});`);
  }
}
lines.push("");

await prisma.$disconnect();
await writeFile("prisma/supabase-seed.sql", lines.join("\n"), "utf8");
console.log(`Exported ${categories.length} categories, ${products.length} products, ${users.length} users -> prisma/supabase-seed.sql`);
