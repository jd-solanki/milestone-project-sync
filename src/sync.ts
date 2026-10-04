export type GraphQL = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

export interface Target {
  issueId: string;
  projectOwner: string;
  projectNumber: number;
}

export type Outcome = "added" | "removed" | "unchanged";

interface Lookup {
  repositoryOwner: { projectV2?: { id: string } | null } | null;
  node: {
    milestone: { id: string } | null;
    projectItems: { nodes: { id: string; project: { id: string } }[] };
  };
}

const LOOKUP = `
  query($issue: ID!, $owner: String!, $number: Int!) {
    repositoryOwner(login: $owner) { ... on ProjectV2Owner { projectV2(number: $number) { id } } }
    node(id: $issue) { ... on Issue {
      milestone { id }
      projectItems(first: 50) { nodes { id project { id } } }
    } }
  }`;

const ADD = `
  mutation($project: ID!, $issue: ID!) {
    addProjectV2ItemById(input: { projectId: $project, contentId: $issue }) { item { id } }
  }`;

const DELETE = `
  mutation($project: ID!, $item: ID!) {
    deleteProjectV2Item(input: { projectId: $project, itemId: $item }) { deletedItemId }
  }`;

/** Reads the issue's current milestone rather than the event's, so out-of-order events still settle right. */
export async function syncIssue(graphql: GraphQL, target: Target): Promise<Outcome> {
  const { repositoryOwner, node } = await graphql<Lookup>(LOOKUP, {
    issue: target.issueId,
    owner: target.projectOwner,
    number: target.projectNumber,
  });

  const project = repositoryOwner?.projectV2?.id;
  if (!project) {
    throw new Error(
      `Project ${target.projectOwner}/${target.projectNumber} not found, or the token cannot see it`,
    );
  }

  const card = node.projectItems.nodes.find((item) => item.project.id === project);

  if (node.milestone && !card) {
    await graphql(ADD, { project, issue: target.issueId });
    return "added";
  }
  if (!node.milestone && card) {
    await graphql(DELETE, { project, item: card.id });
    return "removed";
  }
  return "unchanged";
}
