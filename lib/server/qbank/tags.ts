// lib/server/qbank/tags.ts
// Tag synchronization inside an import/CRUD transaction (architecture §5.1). Upserts each Tag
// by slug (name = slug for now) and replaces the question's QuestionTag rows to match exactly.
// Takes a Prisma transaction client so it composes into the same $transaction as the write.
//
// Also hosts the READ path listTags(): the published-question tag facet for the practice/browse
// filter chips (§7.3), driven off the denormalized tagsFlat mirror rather than the Tag join.

import { prisma } from "@/lib/server/db";
import type { Prisma } from "@prisma/client";

/**
 * syncTags — make the question's QuestionTag rows exactly `tagSlugs`.
 *   1. upsert each Tag by unique slug (name defaults to slug).
 *   2. delete QuestionTag rows for this question not in the new set.
 *   3. create the missing QuestionTag links (createMany, skipDuplicates).
 * Idempotent: re-running with the same slugs is a no-op.
 */
export async function syncTags(
  tx: Prisma.TransactionClient,
  questionId: string,
  tagSlugs: string[],
): Promise<void> {
  // De-dupe + drop empties so we never create blank-slug tags.
  const slugs = [...new Set(tagSlugs.filter((s) => typeof s === "string" && s.trim() !== ""))];

  // Upsert tags and collect their ids.
  const tagIds: string[] = [];
  for (const slug of slugs) {
    const tag = await tx.tag.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {}, // name is content-managed elsewhere; do not clobber on re-import.
      select: { id: true },
    });
    tagIds.push(tag.id);
  }

  // Remove links that are no longer present.
  await tx.questionTag.deleteMany({
    where: { questionId, tagId: { notIn: tagIds.length > 0 ? tagIds : ["__none__"] } },
  });

  // Add the links that are missing.
  if (tagIds.length > 0) {
    await tx.questionTag.createMany({
      data: tagIds.map((tagId) => ({ questionId, tagId })),
      skipDuplicates: true,
    });
  }
}

/** One tag facet row: the slug, a display name, and its published-question count. */
export interface TagWithCount {
  slug: string;
  name: string;
  count: number;
}

/**
 * listTags — the published-question tag facet for the practice/browse filter chips (§7.3, replacing
 * the hardcoded pfTagList). Driven by unnest("tagsFlat") over PUBLISHED questions — NOT the
 * Tag/QuestionTag join — because tagsFlat is the authoritative filter surface (list/practice filter
 * on it) and is ALWAYS populated on a published row, whereas Tag rows are only written by syncTags
 * (the seed inserts tagsFlat directly, leaving Tag empty). Each slug's display `name` prefers a
 * curated Tag.name when one exists, else falls back to the slug. Counts are per published question;
 * ordered by count desc (ties by name), capped to 30. Empty array when the bank is empty. Read-only
 * (no tx) — uses the pooled client. COUNT is cast ::int so it crosses the action boundary as a
 * plain JS number (a raw bigint would not serialize).
 */
export async function listTags(): Promise<TagWithCount[]> {
  return prisma.$queryRaw<TagWithCount[]>`
    SELECT ft.slug AS slug,
           COALESCE(t.name, ft.slug) AS name,
           COUNT(*)::int AS count
    FROM "Question" q
    CROSS JOIN LATERAL unnest(q."tagsFlat") AS ft(slug)
    LEFT JOIN "Tag" t ON t.slug = ft.slug
    WHERE q.status = 'published' AND ft.slug <> ''
    GROUP BY ft.slug, t.name
    ORDER BY count DESC, name ASC
    LIMIT 30
  `;
}
