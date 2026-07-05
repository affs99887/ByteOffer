// prisma/seed.ts
// Idempotent seed (architecture.md §11). Every write is an upsert so it is safe to re-run in
// any environment. Run: `npx tsx prisma/seed.ts` (also wired as prisma.seed / db:seed).
//
// Plants: Plan(free/plus) → bootstrap admin User (+ Subscription + Entitlement) →
// QuestionBank("frontend-core") → adaptSeed() records written as published questions.

import { PrismaClient, Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { adaptSeed } from "@/lib/qbank/adaptSeed";
import { effectiveClass } from "@/lib/qbank/enums";
import type { LocalizedString, QuestionRecord } from "@/lib/qbank/types";

const prisma = new PrismaClient();

// Env pulled directly (seed is a standalone script; env.ts is app-runtime concern).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@byteoffer.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-strong-password";
const PRICE_MONTHLY = process.env.STRIPE_PRICE_PLUS_MONTHLY || null;
const PRICE_YEARLY = process.env.STRIPE_PRICE_PLUS_YEARLY || null;

/** Flatten a LocalizedString to plain text for the stemText mirror column. */
function plainStem(stem: LocalizedString): string {
  if (typeof stem === "string") return stem;
  // Prefer zh-CN, else first available locale value.
  return stem["zh-CN"] ?? Object.values(stem)[0] ?? "";
}

async function seedPlans(): Promise<void> {
  await prisma.plan.upsert({
    where: { tier: "free" },
    create: {
      tier: "free",
      name: "免费版",
      dailyQuota: 30,
      premiumBanks: false,
      examMode: true,
      aiExplain: false,
    },
    update: {
      name: "免费版",
      dailyQuota: 30,
      premiumBanks: false,
      examMode: true,
      aiExplain: false,
    },
  });

  await prisma.plan.upsert({
    where: { tier: "plus" },
    create: {
      tier: "plus",
      name: "Plus 会员",
      dailyQuota: null,
      premiumBanks: true,
      examMode: true,
      aiExplain: true,
      stripePriceIdMonthly: PRICE_MONTHLY,
      stripePriceIdYearly: PRICE_YEARLY,
    },
    update: {
      name: "Plus 会员",
      dailyQuota: null,
      premiumBanks: true,
      examMode: true,
      aiExplain: true,
      stripePriceIdMonthly: PRICE_MONTHLY,
      stripePriceIdYearly: PRICE_YEARLY,
    },
  });
}

async function seedAdmin(): Promise<string> {
  const now = new Date();
  // argon2id hash (default variant of @node-rs/argon2's hash()).
  const passwordHash = await hash(ADMIN_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      role: "admin",
      passwordHash,
      emailVerified: now,
    },
    // Keep admin role + verified; refresh the password hash so seed re-runs re-sync it.
    update: {
      role: "admin",
      passwordHash,
      emailVerified: now,
    },
  });

  await prisma.subscription.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, tier: "free", status: "active" },
    update: {},
  });

  await prisma.entitlement.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      tier: "free",
      dailyQuota: 30,
      premiumBanks: false,
      examMode: true,
      aiExplain: false,
    },
    update: {
      tier: "free",
      dailyQuota: 30,
      premiumBanks: false,
      examMode: true,
      aiExplain: false,
    },
  });

  return admin.id;
}

async function seedBank(authorId: string): Promise<void> {
  const now = new Date();
  const bank = await prisma.questionBank.upsert({
    where: { slug: "frontend-core" },
    create: {
      slug: "frontend-core",
      title: "前端高频面试题库",
      description: "从原型 practiceBank 迁移的样例题库。",
      isPremium: false,
      sortOrder: 0,
    },
    update: { title: "前端高频面试题库" },
  });

  const records: QuestionRecord[] = adaptSeed();

  for (const rec of records) {
    const row = {
      bankId: bank.id,
      type: rec.type,
      difficulty: rec.difficulty,
      gradingClass: effectiveClass(rec), // recomputed, never trusted from input (§2.1)
      stemText: plainStem(rec.stem),
      tagsFlat: rec.tags,
      payload: rec as unknown as Prisma.InputJsonValue, // 1:1 JSONB mirror
      schemaVersion: 1,
      authorId,
    };

    await prisma.question.upsert({
      where: { id: rec.id },
      create: {
        id: rec.id,
        ...row,
        status: "published",
        publishedAt: now,
      },
      update: {
        ...row,
        status: "published",
        publishedAt: now,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded bank "${bank.slug}" with ${records.length} published question(s).`);
}

async function main(): Promise<void> {
  await seedPlans();
  const adminId = await seedAdmin();
  await seedBank(adminId);
  // eslint-disable-next-line no-console
  console.log(`Seed complete. Admin: ${ADMIN_EMAIL}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
