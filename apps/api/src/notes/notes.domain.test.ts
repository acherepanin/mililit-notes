import { describe, expect, it } from "vitest";

import { buildNoteTree, reorderIds, wouldCreateCycle } from "./notes.domain.js";

describe("notes domain", () => {
  it("builds stable roots and treats missing parents as roots", () => {
    const rows = [
      {
        id: 1,
        isFavorite: false,
        isPinned: false,
        name: "Root",
        parentId: null,
        position: 0,
        revision: 1,
        tags: [],
        updatedAt: "now",
      },
      {
        id: 2,
        isFavorite: false,
        isPinned: true,
        name: "Child",
        parentId: 1,
        position: 0,
        revision: 1,
        tags: ["work"],
        updatedAt: "now",
      },
      {
        id: 3,
        isFavorite: false,
        isPinned: false,
        name: "Orphan",
        parentId: 99,
        position: 1,
        revision: 1,
        tags: [],
        updatedAt: "now",
      },
    ];

    expect(buildNoteTree(rows)).toEqual([
      { ...rows[0], children: [{ ...rows[1], children: [] }] },
      { ...rows[2], children: [] },
    ]);
  });

  it("rejects descendant moves and clamps reorder positions", () => {
    const rows = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 2 },
    ];
    expect(wouldCreateCycle(rows, 1, 3)).toBe(true);
    expect(wouldCreateCycle(rows, 3, 1)).toBe(false);
    expect(reorderIds([1, 2, 3], 2, 99)).toEqual([1, 3, 2]);
  });
});
