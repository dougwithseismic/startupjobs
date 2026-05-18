export interface ParsedQuery {
  textQuery: string;
  seniority: string[];
  isRemote: boolean | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

const SENIORITY_TOKENS: Record<string, string> = {
  junior: "junior",
  medior: "medior",
  mid: "medior",
  "mid-level": "medior",
  senior: "senior",
  lead: "lead",
  principal: "principal",
  intern: "intern",
  trainee: "intern",
  head: "lead",
  manager: "lead",
};

const REMOTE_TOKENS = new Set([
  "remote",
  "wfh",
  "work-from-home",
  "homeoffice",
  "home-office",
  "distributed",
]);

const SALARY_PATTERN = /(\d{2,3})[kK](?:\s*[-–]\s*(\d{2,3})[kK])?/;

export function parseSearchQuery(raw: string): ParsedQuery {
  const seniority: string[] = [];
  let isRemote: boolean | null = null;
  let salaryMin: number | null = null;
  let salaryMax: number | null = null;

  const salaryMatch = raw.match(SALARY_PATTERN);
  let cleaned = raw;
  if (salaryMatch) {
    salaryMin = parseInt(salaryMatch[1]!, 10) * 1000;
    salaryMax = salaryMatch[2]
      ? parseInt(salaryMatch[2], 10) * 1000
      : salaryMin;
    cleaned = cleaned.replace(salaryMatch[0], "");
  }

  const tokens = cleaned
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const textTokens: string[] = [];

  for (const token of tokens) {
    const mapped = SENIORITY_TOKENS[token];
    if (mapped && !seniority.includes(mapped)) {
      seniority.push(mapped);
      continue;
    }

    if (REMOTE_TOKENS.has(token)) {
      isRemote = true;
      continue;
    }

    textTokens.push(token);
  }

  return {
    textQuery: textTokens.join(" "),
    seniority,
    isRemote,
    salaryMin,
    salaryMax,
  };
}
