CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.search_chunks
  ALTER COLUMN embedding TYPE extensions.vector(384)
  USING embedding::text::extensions.vector(384);

CREATE INDEX search_chunks_embedding_hnsw_idx
  ON public.search_chunks USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX search_chunks_body_fts_idx
  ON public.search_chunks USING gin (to_tsvector('simple', body));
