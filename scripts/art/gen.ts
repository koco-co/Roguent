import {
  buildEditRequest,
  buildGenRequest,
  callEditApi,
  callImageApi,
  decodeAndWrite,
  targetPath,
} from "./api";
import { type Job, assemblePrompt, listJobs } from "./prompts";

interface Opts {
  anchor: boolean;
  all: boolean;
  theme?: string;
  asset?: string;
  dryRun: boolean;
  refAnchor: boolean;
}

const ANCHOR = "knight_m";

function parseArgs(argv: string[]): Opts {
  const has = (f: string) => argv.includes(f);
  const val = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    anchor: has("--anchor"),
    all: has("--all"),
    theme: val("--theme"),
    asset: val("--asset"),
    dryRun: has("--dry-run"),
    refAnchor: has("--ref-anchor"),
  };
}

function selectJobs(o: Opts): Job[] {
  let jobs = listJobs();
  if (o.theme && !jobs.some((j) => j.theme === o.theme)) {
    throw new Error(`unknown theme: ${o.theme}`);
  }
  if (o.asset && !jobs.some((j) => j.asset === o.asset)) {
    throw new Error(`unknown asset: ${o.asset}`);
  }
  if (o.anchor) jobs = jobs.filter((j) => j.asset === ANCHOR);
  if (o.theme) jobs = jobs.filter((j) => j.theme === o.theme);
  if (o.asset) jobs = jobs.filter((j) => j.asset === o.asset);
  if (!o.anchor && !o.all && !o.asset) {
    throw new Error("指定 --anchor / --all / --asset <id> 之一");
  }
  if (jobs.length === 0) {
    throw new Error("no jobs selected");
  }
  return jobs;
}

function sizeFor(job: Job): string {
  return job.category === "character" ? "1024x1536" : "1024x1024";
}

async function run(): Promise<void> {
  const o = parseArgs(Bun.argv.slice(2));
  const jobs = selectJobs(o);
  const key = process.env.OPENAI_API_KEY;

  for (const job of jobs) {
    const prompt = assemblePrompt(job.theme, job.asset);
    const out = targetPath(job.theme, job.asset);
    const size = sizeFor(job);
    if (o.dryRun) {
      console.log(
        `\n# ${job.theme}/${job.asset} (${size}) -> ${out}\n${prompt}`,
      );
      continue;
    }
    if (!key) throw new Error("缺 OPENAI_API_KEY(或用 --dry-run 手动出图)");
    const ref = targetPath(job.theme, ANCHOR);
    const useRef = o.refAnchor && job.asset !== ANCHOR;
    if (useRef && !(await Bun.file(ref).exists())) {
      throw new Error(`missing anchor reference: ${ref}`);
    }
    const b64 = useRef
      ? await callEditApi(await buildEditRequest(prompt, key, ref, size))
      : await callImageApi(buildGenRequest(prompt, key, size));
    await decodeAndWrite(b64, out);
    console.log(`✓ ${out}`);
  }
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
