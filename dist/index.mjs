import { readFile } from "node:fs/promises";
//#region src/sync.ts
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
async function syncIssue(graphql, target) {
	const { repositoryOwner, node } = await graphql(LOOKUP, {
		issue: target.issueId,
		owner: target.projectOwner,
		number: target.projectNumber
	});
	const project = repositoryOwner?.projectV2?.id;
	if (!project) throw new Error(`Project ${target.projectOwner}/${target.projectNumber} not found, or the token cannot see it`);
	const card = node.projectItems.nodes.find((item) => item.project.id === project);
	if (node.milestone && !card) {
		await graphql(ADD, {
			project,
			issue: target.issueId
		});
		return "added";
	}
	if (!node.milestone && card) {
		await graphql(DELETE, {
			project,
			item: card.id
		});
		return "removed";
	}
	return "unchanged";
}
//#endregion
//#region src/index.ts
/** The runner exposes each `with:` input as `INPUT_<NAME>`, upper-cased with hyphens kept. */
function input(name) {
	const value = process.env[`INPUT_${name.toUpperCase()}`]?.trim();
	if (!value) throw new Error(`Input ${name} is required`);
	return value;
}
const token = input("github-token");
const graphql = async (query, variables) => {
	const response = await fetch(process.env.GITHUB_GRAPHQL_URL ?? "https://api.github.com/graphql", {
		method: "POST",
		headers: {
			authorization: `bearer ${token}`,
			"content-type": "application/json"
		},
		body: JSON.stringify({
			query,
			variables
		})
	});
	if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
	const { data, errors } = await response.json();
	if (errors?.length) throw new Error(errors.map((error) => error.message).join("\n"));
	return data;
};
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
if (!event.issue) throw new Error("Run this action on an `issues` event");
const outcome = await syncIssue(graphql, {
	issueId: event.issue.node_id,
	projectOwner: input("project-owner"),
	projectNumber: Number(input("project-number"))
});
console.log(`${event.issue.html_url}: ${outcome}`);
//#endregion
export {};
