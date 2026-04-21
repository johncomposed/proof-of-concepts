import { Octokit } from "octokit";

export function requireToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN env var is required");
    process.exit(1);
  }
  return token;
}

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}
