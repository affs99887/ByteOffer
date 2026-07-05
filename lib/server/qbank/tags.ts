// lib/server/qbank/tags.ts
// Tag synchronization inside an import/CRUD transaction (architecture §5.1). Upserts each Tag
// by slug (name = slug for now) and replaces the question's QuestionTag rows to match exactly.
// Takes a Prisma transaction client so it composes into the same $transaction as the write.

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
