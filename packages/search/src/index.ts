import MiniSearch from "minisearch";
import type { Operation } from "catalogue";

/**
 * Search index (PRD §6.3, §6.4).
 * Backend BM25 par défaut via MiniSearch. Indexe `name + description +
 * noms de paramètres`. Renvoie le top-K avec signature TS complète (obligatoire).
 */

export interface SearchHit {
  name: string;
  signature: string;
  description: string;
  mutating: boolean;
}

export interface SearchBackend {
  query(query: string, k?: number): SearchHit[];
}

interface IndexedDoc {
  id: string;
  name: string;
  description: string;
  paramNames: string;
}

export class Bm25Search implements SearchBackend {
  private mini: MiniSearch<IndexedDoc>;
  private byName = new Map<string, Operation>();
  private readonly defaultTopK: number;

  constructor(operations: Operation[], defaultTopK = 8) {
    this.defaultTopK = defaultTopK;
    this.mini = new MiniSearch<IndexedDoc>({
      fields: ["name", "description", "paramNames"],
      storeFields: ["name"],
      searchOptions: {
        boost: { name: 2 },
        prefix: true,
        fuzzy: 0.2,
      },
    });

    const docs: IndexedDoc[] = operations.map((op) => {
      this.byName.set(op.name, op);
      return {
        id: op.name,
        name: op.name,
        description: op.description,
        paramNames: op.http.params.map((p) => p.name).join(" "),
      };
    });
    this.mini.addAll(docs);
  }

  query(query: string, k?: number): SearchHit[] {
    const limit = Math.max(1, k ?? this.defaultTopK);
    const results = this.mini.search(query).slice(0, limit);
    return results.map((r) => {
      const op = this.byName.get(r.id as string)!;
      return {
        name: op.name,
        signature: op.signature,
        description: op.description,
        mutating: op.mutating,
      };
    });
  }
}

/**
 * Construit le backend de recherche.
 * En l'absence d'opérations (mode vide), renvoie un backend qui répond [].
 */
export function createSearch(operations: Operation[], topK = 8): SearchBackend {
  return new Bm25Search(operations, topK);
}
