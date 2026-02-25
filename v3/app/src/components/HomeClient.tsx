"use client";

import { useSearchParams, useRouter } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ToolWithMeta } from "@/lib/types";
import ToolGrid, { type ViewMode } from "./ToolGrid";
import SearchAndFilters from "./SearchAndFilters";
import FilterChips from "./FilterChips";

const VIEW_MODE_KEY = "makerlab-view-mode";
const NL_SEARCH_KEY = "makerlab-nl-search";

interface NLSearchResult {
  toolIds: string[];
  reasoning: string;
  suggestedFilters?: {
    categories?: string[];
    materials?: string[];
    rooms?: string[];
  };
  method: "vector" | "llm";
}

interface HomeClientProps {
  tools: ToolWithMeta[];
  categoryGroups: string[];
  rooms: string[];
  materials: string[];
}

export default function HomeClient({
  tools,
  categoryGroups,
  rooms,
  materials,
}: HomeClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlQuery = searchParams.get("q") || "";
  const selectedCategories = searchParams.getAll("category");
  const selectedRooms = searchParams.getAll("room");
  const selectedMaterials = searchParams.getAll("material");

  // Local state for instant typing — debounced sync to URL
  const [localQuery, setLocalQuery] = useState(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // NL search state
  const [nlSearchActive, setNlSearchActive] = useState(false);
  const [nlSearchLoading, setNlSearchLoading] = useState(false);
  const [nlSearchResult, setNlSearchResult] = useState<NLSearchResult | null>(null);
  const [nlSearchError, setNlSearchError] = useState<string | null>(null);

  // Persist NL search preference
  useEffect(() => {
    const stored = localStorage.getItem(NL_SEARCH_KEY);
    if (stored === "true") setNlSearchActive(true);
  }, []);

  const handleNlSearchToggle = useCallback(() => {
    setNlSearchActive((prev) => {
      const next = !prev;
      localStorage.setItem(NL_SEARCH_KEY, String(next));
      // Clear NL results when toggling off
      if (!next) {
        setNlSearchResult(null);
        setNlSearchError(null);
      }
      return next;
    });
  }, []);

  const handleNlSearchSubmit = useCallback(
    async (query: string) => {
      setNlSearchLoading(true);
      setNlSearchError(null);
      setNlSearchResult(null);

      try {
        const res = await fetch("/api/nl-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Search failed (${res.status})`);
        }

        const result: NLSearchResult = await res.json();
        setNlSearchResult(result);
      } catch (e) {
        setNlSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setNlSearchLoading(false);
      }
    },
    []
  );

  // View mode state — persisted in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "compact" || stored === "grid" || stored === "table") {
      setViewMode(stored);
    }
  }, []);
  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  const updateParams = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        params.delete(key);
        if (value === null) continue;
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v));
        } else if (value) {
          params.set(key, value);
        }
      }

      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  const handleQueryChange = useCallback(
    (q: string) => {
      setLocalQuery(q);
      // Clear NL results when the user edits the query
      if (nlSearchResult) setNlSearchResult(null);
      if (nlSearchError) setNlSearchError(null);
      if (!nlSearchActive) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          updateParams({ q: q || null });
        }, 200);
      }
    },
    [updateParams, nlSearchActive, nlSearchResult, nlSearchError]
  );

  // Defer the query used for filtering so React prioritizes input responsiveness
  const deferredQuery = useDeferredValue(localQuery);

  // Standard keyword-filtered results
  const keywordFiltered = useMemo(() => {
    let result = tools;

    const query = deferredQuery;
    if (query && !nlSearchActive) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          t.materials.some((m) => m.toLowerCase().includes(q))
      );
    }

    if (selectedCategories.length > 0) {
      result = result.filter((t) =>
        selectedCategories.includes(t.category_group)
      );
    }

    if (selectedRooms.length > 0) {
      result = result.filter((t) => selectedRooms.includes(t.location_room));
    }

    if (selectedMaterials.length > 0) {
      result = result.filter((t) =>
        selectedMaterials.some((m) => t.materials.includes(m))
      );
    }

    return result;
  }, [tools, deferredQuery, nlSearchActive, selectedCategories, selectedRooms, selectedMaterials]);

  // NL search results — order tools by the returned IDs
  const nlFiltered = useMemo(() => {
    if (!nlSearchResult) return null;
    const idOrder = new Map(nlSearchResult.toolIds.map((id, i) => [id, i]));
    return tools
      .filter((t) => idOrder.has(t.id))
      .sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
  }, [tools, nlSearchResult]);

  // Choose which result set to display
  const filtered = nlFiltered ?? keywordFiltered;

  const hasFilters =
    localQuery ||
    selectedCategories.length > 0 ||
    selectedRooms.length > 0 ||
    selectedMaterials.length > 0;

  // Apply suggested filters from NL search
  const applySuggestedFilters = useCallback(
    (filters: NLSearchResult["suggestedFilters"]) => {
      if (!filters) return;
      const updates: Record<string, string[] | null> = {};
      if (filters.categories?.length) updates.category = filters.categories;
      if (filters.materials?.length) updates.material = filters.materials;
      if (filters.rooms?.length) updates.room = filters.rooms;
      // Clear NL results and switch to keyword mode with filters
      setNlSearchResult(null);
      setNlSearchActive(false);
      localStorage.setItem(NL_SEARCH_KEY, "false");
      updateParams(updates);
    },
    [updateParams]
  );

  return (
    <>
      <SearchAndFilters
        tools={tools}
        query={localQuery}
        categoryGroups={categoryGroups}
        rooms={rooms}
        materials={materials}
        selectedCategories={selectedCategories}
        selectedRooms={selectedRooms}
        selectedMaterials={selectedMaterials}
        onQueryChange={handleQueryChange}
        onCategoryChange={(cats) =>
          updateParams({ category: cats.length ? cats : null })
        }
        onRoomChange={(rms) =>
          updateParams({ room: rms.length ? rms : null })
        }
        onMaterialChange={(mats) =>
          updateParams({ material: mats.length ? mats : null })
        }
        nlSearchActive={nlSearchActive}
        onNlSearchToggle={handleNlSearchToggle}
        onNlSearchSubmit={handleNlSearchSubmit}
        nlSearchLoading={nlSearchLoading}
      />

      {/* NL search result banner */}
      {nlSearchResult && (
        <div className="mb-4 rounded-lg border border-accent-teal/30 bg-accent-teal/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <svg className="h-5 w-5 shrink-0 text-accent-teal mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{nlSearchResult.reasoning}</p>
              {nlSearchResult.suggestedFilters &&
                (nlSearchResult.suggestedFilters.categories?.length ||
                  nlSearchResult.suggestedFilters.materials?.length ||
                  nlSearchResult.suggestedFilters.rooms?.length) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Try filters:</span>
                    {nlSearchResult.suggestedFilters.categories?.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => applySuggestedFilters({ categories: [cat] })}
                        className="rounded-full bg-accent-teal/10 px-2.5 py-0.5 text-xs text-accent-teal hover:bg-accent-teal/20 transition-colors"
                      >
                        {cat}
                      </button>
                    ))}
                    {nlSearchResult.suggestedFilters.materials?.map((mat) => (
                      <button
                        key={mat}
                        onClick={() => applySuggestedFilters({ materials: [mat] })}
                        className="rounded-full bg-accent-teal/10 px-2.5 py-0.5 text-xs text-accent-teal hover:bg-accent-teal/20 transition-colors"
                      >
                        {mat}
                      </button>
                    ))}
                    {nlSearchResult.suggestedFilters.rooms?.map((room) => (
                      <button
                        key={room}
                        onClick={() => applySuggestedFilters({ rooms: [room] })}
                        className="rounded-full bg-accent-teal/10 px-2.5 py-0.5 text-xs text-accent-teal hover:bg-accent-teal/20 transition-colors"
                      >
                        {room}
                      </button>
                    ))}
                  </div>
                )}
            </div>
            <button
              onClick={() => setNlSearchResult(null)}
              className="shrink-0 text-muted hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {nlSearchResult.method === "vector" ? "Matched via vector similarity" : "Matched via AI reasoning"}
          </p>
        </div>
      )}

      {/* NL search error */}
      {nlSearchError && (
        <div className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3">
          <p className="text-sm text-danger">{nlSearchError}</p>
        </div>
      )}

      {hasFilters && !nlSearchResult && (
        <FilterChips
          query={localQuery}
          selectedCategories={selectedCategories}
          selectedRooms={selectedRooms}
          selectedMaterials={selectedMaterials}
          onRemoveQuery={() => { setLocalQuery(""); updateParams({ q: null }); }}
          onRemoveCategory={(cat) =>
            updateParams({
              category: selectedCategories.filter((c) => c !== cat),
            })
          }
          onRemoveRoom={(room) =>
            updateParams({
              room: selectedRooms.filter((r) => r !== room),
            })
          }
          onRemoveMaterial={(mat) =>
            updateParams({
              material: selectedMaterials.filter((m) => m !== mat),
            })
          }
          onClearAll={() => {
            setLocalQuery("");
            updateParams({
              q: null,
              category: null,
              room: null,
              material: null,
            });
          }}
          resultCount={filtered.length}
        />
      )}

      {/* Result count + view mode toggles */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{filtered.length}</span>{" "}
          {filtered.length === 1 ? "tool" : "tools"}
          {nlSearchResult && (
            <span className="ml-1 text-accent-teal">(AI results)</span>
          )}
        </p>
        <ViewToggle viewMode={viewMode} onChange={handleViewMode} />
      </div>

      <ToolGrid tools={filtered} viewMode={viewMode} />
    </>
  );
}

/* ── View mode toggle button group ──────────────────────────── */

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: "compact",
    label: "Compact grid",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="2" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth="2" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth="2" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="2" />
      </svg>
    ),
  },
  {
    mode: "grid",
    label: "Large grid",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
      </svg>
    ),
  },
  {
    mode: "table",
    label: "Table view",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeWidth="2" d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    ),
  },
];

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-card-border overflow-hidden">
      {VIEW_OPTIONS.map(({ mode, label, icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          title={label}
          className={`px-2.5 py-1.5 transition-colors ${
            viewMode === mode
              ? "bg-cornell-red text-white"
              : "bg-muted-bg text-muted hover:text-foreground"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
