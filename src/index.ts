import { readFile } from "node:fs/promises";
import { syncIssue, type GraphQL } from "./sync.ts";

/** The runner exposes each `with:` input as `INPUT_<NAME>`, upper-cased with hyphens kept. */
function input(name: string): string {
  const value = process.env[`INPUT_${name.toUpperCase()}`]?.trim();
  if (!value) throw new Error(`Input ${name} is required`);
  return value;
}

const token = input("github-token");

const graphql: GraphQL = async (query, variables) => {
  const response = await fetch(process.env.GITHUB_GRAPHQL_URL ?? "https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);

  const { data, errors } = (await response.json()) as {
    data: never;
    errors?: { message: string }[];
  };
  if (errors?.length) throw new Error(errors.map((error) => error.message).join("\n"));
  return data;
};

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, "utf8")) as {
  issue?: { node_id: string; html_url: string };
};
if (!event.issue) throw new Error("Run this action on an `issues` event");

const outcome = await syncIssue(graphql, {
  issueId: event.issue.node_id,
  projectOwner: input("project-owner"),
  projectNumber: Number(input("project-number")),
});
console.log(`${event.issue.html_url}: ${outcome}`);
