"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import type { ToolWithMeta } from "@/lib/types";
import ToolGrid from "./ToolGrid";
import SearchAndFilters from "./SearchAndFilters";
import FilterChips from "./FilterChips";

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

      <ToolGrid tools={filtered} />
    </>
  );
}
