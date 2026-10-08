import { resolve } from "node:path";

export const searchModelId = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
type LocalExtractor = (
  input: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<{ data: Float32Array }>;

let extractorPromise: Promise<LocalExtractor> | null = null;

async function extractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const transformers = await import("@huggingface/transformers");
      if (process.env.SEARCH_MODEL_CACHE_DIR)
        transformers.env.cacheDir = resolve(process.env.SEARCH_MODEL_CACHE_DIR);
      const make = transformers.pipeline as unknown as (
        task: string,
        model: string,
        options: { dtype: string },
      ) => Promise<LocalExtractor>;
      return make("feature-extraction", searchModelId, { dtype: "q8" });
    })().catch((error) => {
      extractorPromise = null;
      throw error;
    });
  }
  return extractorPromise;
}

export async function embed(input: string): Promise<number[]> {
  const model = await extractor();
  const tensor = await model(input.slice(0, 2500), { pooling: "mean", normalize: true });
  return Array.from(tensor.data as Float32Array);
}

export async function warmSearchModel() {
  await extractor();
}
