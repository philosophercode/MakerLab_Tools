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
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateParams({ q: q || null });
      }, 200);
    },
    [updateParams]
  );

  // Defer the query used for filtering so React prioritizes input responsiveness
  const deferredQuery = useDeferredValue(localQuery);

  const filtered = useMemo(() => {
    let result = tools;

    const query = deferredQuery;
    if (query) {
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
  }, [tools, deferredQuery, selectedCategories, selectedRooms, selectedMaterials]);

  const hasFilters =
    localQuery ||
    selectedCategories.length > 0 ||
    selectedRooms.length > 0 ||
    selectedMaterials.length > 0;

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
      />

      {hasFilters && (
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
