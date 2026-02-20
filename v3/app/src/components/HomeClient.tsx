"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
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

  const query = searchParams.get("q") || "";
  const selectedCategories = searchParams.getAll("category");
  const selectedRooms = searchParams.getAll("room");
  const selectedMaterials = searchParams.getAll("material");

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

  const filtered = useMemo(() => {
    let result = tools;

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
  }, [tools, query, selectedCategories, selectedRooms, selectedMaterials]);

  const hasFilters =
    query ||
    selectedCategories.length > 0 ||
    selectedRooms.length > 0 ||
    selectedMaterials.length > 0;

  return (
    <>
      <SearchAndFilters
        query={query}
        categoryGroups={categoryGroups}
        rooms={rooms}
        materials={materials}
        selectedCategories={selectedCategories}
        selectedRooms={selectedRooms}
        selectedMaterials={selectedMaterials}
        onQueryChange={(q) => updateParams({ q: q || null })}
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
          query={query}
          selectedCategories={selectedCategories}
          selectedRooms={selectedRooms}
          selectedMaterials={selectedMaterials}
          onRemoveQuery={() => updateParams({ q: null })}
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
          onClearAll={() =>
            updateParams({
              q: null,
              category: null,
              room: null,
              material: null,
            })
          }
          resultCount={filtered.length}
        />
      )}

      <ToolGrid tools={filtered} />
    </>
  );
}
