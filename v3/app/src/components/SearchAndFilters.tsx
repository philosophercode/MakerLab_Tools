"use client";

interface SearchAndFiltersProps {
  query: string;
  categoryGroups: string[];
  rooms: string[];
  materials: string[];
  selectedCategories: string[];
  selectedRooms: string[];
  selectedMaterials: string[];
  onQueryChange: (q: string) => void;
  onCategoryChange: (cats: string[]) => void;
  onRoomChange: (rooms: string[]) => void;
  onMaterialChange: (mats: string[]) => void;
}

function MultiToggle({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((s) => s !== opt)
                    : [...selected, opt]
                )
              }
              aria-pressed={active}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-accent-blue text-white"
                  : "bg-muted-bg text-muted hover:bg-card-border"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SearchAndFilters({
  query,
  categoryGroups,
  rooms,
  materials,
  selectedCategories,
  selectedRooms,
  selectedMaterials,
  onQueryChange,
  onCategoryChange,
  onRoomChange,
  onMaterialChange,
}: SearchAndFiltersProps) {
  return (
    <div className="mb-6 space-y-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search tools by name, description, material, or tag..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full rounded-lg border border-card-border bg-card-bg py-2.5 pl-10 pr-4 text-sm placeholder:text-muted focus:border-cornell-red focus:outline-none focus:ring-1 focus:ring-cornell-red"
        />
      </div>

      {/* Filter groups */}
      <div className="space-y-3">
        <MultiToggle
          label="Category"
          options={categoryGroups}
          selected={selectedCategories}
          onChange={onCategoryChange}
        />
        <MultiToggle
          label="Room"
          options={rooms}
          selected={selectedRooms}
          onChange={onRoomChange}
        />
        {materials.length > 0 && (
          <MultiToggle
            label="Materials"
            options={materials}
            selected={selectedMaterials}
            onChange={onMaterialChange}
          />
        )}
      </div>
    </div>
  );
}
