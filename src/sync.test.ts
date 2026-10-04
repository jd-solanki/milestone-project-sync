import { expect, test } from "vite-plus/test";
import { syncIssue, type GraphQL } from "./sync.ts";

const target = { issueId: "I_1", projectOwner: "octocat", projectNumber: 9 };

function board(milestone: boolean, cardProjects: string[]) {
  const mutations: string[] = [];
  const graphql = (async (query) => {
    if (query.includes("mutation")) {
      mutations.push(query.includes("addProjectV2ItemById") ? "add" : "delete");
      return {};
    }
    return {
      repositoryOwner: { projectV2: { id: "P_9" } },
      node: {
        milestone: milestone ? { id: "M_1" } : null,
        projectItems: {
          nodes: cardProjects.map((project) => ({
            id: `item-in-${project}`,
            project: { id: project },
          })),
        },
      },
    };
  }) as GraphQL;
  return { graphql, mutations };
}

test.each([
  { milestone: true, cards: [], outcome: "added", mutations: ["add"] },
  { milestone: true, cards: ["P_9"], outcome: "unchanged", mutations: [] },
  { milestone: false, cards: ["P_1", "P_9"], outcome: "removed", mutations: ["delete"] },
  { milestone: false, cards: ["P_1"], outcome: "unchanged", mutations: [] },
])(
  "milestone $milestone, cards in $cards → $outcome",
  async ({ milestone, cards, outcome, mutations }) => {
    const fake = board(milestone, cards);
    expect(await syncIssue(fake.graphql, target)).toBe(outcome);
    expect(fake.mutations).toEqual(mutations);
  },
);

test("fails when the token cannot see the project", async () => {
  const graphql = (async () => ({ repositoryOwner: null, node: {} })) as GraphQL;
  await expect(syncIssue(graphql, target)).rejects.toThrow("octocat/9 not found");
});
