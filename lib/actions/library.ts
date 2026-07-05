"use server";

// lib/actions/library.ts
// Thin wrongbook / favorites / recent Server Actions (architecture §4.2). requireUser is the
// security boundary; every service query is ownership-scoped with where:{ userId } (IDOR kill,
// §3.2). No user id is ever accepted from the client body. Results project to the existing
// ListItem shape (§7.4).

import { defineAction } from "@/lib/server/action";
import { requireUser } from "@/lib/server/guards";
import * as libraryService from "@/lib/server/services/libraryService";
import type { ListItemsResult } from "@/lib/server/services/libraryService";
import {
  listCursorSchema,
  listWrongbookSchema,
  masterWrongSchema,
  toggleFavoriteSchema,
} from "@/lib/validation/library";

export const listWrongbookAction = defineAction(
  listWrongbookSchema,
  requireUser,
  async (input, user): Promise<ListItemsResult> =>
    libraryService.listWrongbook({ userId: user.id, cursor: input.cursor, mastered: input.mastered }),
);

export const masterWrongAction = defineAction(
  masterWrongSchema,
  requireUser,
  async (input, user): Promise<{ ok: true }> =>
    libraryService.masterWrong({ userId: user.id, questionId: input.questionId }),
);

export const toggleFavoriteAction = defineAction(
  toggleFavoriteSchema,
  requireUser,
  async (input, user): Promise<{ fav: boolean }> =>
    libraryService.toggleFavorite({ userId: user.id, questionId: input.questionId }),
);

export const listFavoritesAction = defineAction(
  listCursorSchema,
  requireUser,
  async (input, user): Promise<ListItemsResult> =>
    libraryService.listFavorites({ userId: user.id, cursor: input.cursor }),
);

export const listRecentAction = defineAction(
  listCursorSchema,
  requireUser,
  async (input, user): Promise<ListItemsResult> =>
    libraryService.listRecent({ userId: user.id, cursor: input.cursor }),
);
