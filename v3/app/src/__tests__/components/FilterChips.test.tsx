import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterChips from "@/components/FilterChips";

function renderFilterChips(overrides = {}) {
  const defaults = {
    query: "",
    selectedCategories: [] as string[],
    selectedRooms: [] as string[],
    selectedMaterials: [] as string[],
    onRemoveQuery: vi.fn(),
    onRemoveCategory: vi.fn(),
    onRemoveRoom: vi.fn(),
    onRemoveMaterial: vi.fn(),
    onClearAll: vi.fn(),
    resultCount: 10,
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<FilterChips {...props} />), props };
}

describe("FilterChips", () => {
  it("displays result count with correct pluralization", () => {
    renderFilterChips({ resultCount: 5 });
    expect(screen.getByText("5 results")).toBeInTheDocument();
  });

  it("uses singular 'result' for count of 1", () => {
    renderFilterChips({ resultCount: 1 });
    expect(screen.getByText("1 result")).toBeInTheDocument();
  });

  it("renders query chip when query is provided", () => {
    renderFilterChips({ query: "laser" });
    expect(screen.getByText('"laser"')).toBeInTheDocument();
  });

  it("does not render query chip when query is empty", () => {
    renderFilterChips({ query: "" });
    expect(screen.queryByText('""')).not.toBeInTheDocument();
  });

  it("renders category chips", () => {
    renderFilterChips({
      selectedCategories: ["CNC", "Digital Fabrication"],
    });

    expect(screen.getByText("CNC")).toBeInTheDocument();
    expect(screen.getByText("Digital Fabrication")).toBeInTheDocument();
  });

  it("renders room chips", () => {
    renderFilterChips({ selectedRooms: ["Design Lab", "Workshop"] });

    expect(screen.getByText("Design Lab")).toBeInTheDocument();
    expect(screen.getByText("Workshop")).toBeInTheDocument();
  });

  it("renders material chips", () => {
    renderFilterChips({ selectedMaterials: ["PLA", "Wood"] });

    expect(screen.getByText("PLA")).toBeInTheDocument();
    expect(screen.getByText("Wood")).toBeInTheDocument();
  });

  it("calls onRemoveQuery when query chip remove button is clicked", () => {
    const { props } = renderFilterChips({ query: "drill" });

    const removeBtn = screen.getByLabelText('Remove "drill" filter');
    fireEvent.click(removeBtn);

    expect(props.onRemoveQuery).toHaveBeenCalledOnce();
  });

  it("calls onRemoveCategory when category chip is removed", () => {
    const { props } = renderFilterChips({
      selectedCategories: ["CNC"],
    });

    const removeBtn = screen.getByLabelText("Remove CNC filter");
    fireEvent.click(removeBtn);

    expect(props.onRemoveCategory).toHaveBeenCalledWith("CNC");
  });

  it("calls onRemoveRoom when room chip is removed", () => {
    const { props } = renderFilterChips({
      selectedRooms: ["Workshop"],
    });

    const removeBtn = screen.getByLabelText("Remove Workshop filter");
    fireEvent.click(removeBtn);

    expect(props.onRemoveRoom).toHaveBeenCalledWith("Workshop");
  });

  it("calls onRemoveMaterial when material chip is removed", () => {
    const { props } = renderFilterChips({
      selectedMaterials: ["PLA"],
    });

    const removeBtn = screen.getByLabelText("Remove PLA filter");
    fireEvent.click(removeBtn);

    expect(props.onRemoveMaterial).toHaveBeenCalledWith("PLA");
  });

  it("calls onClearAll when Clear all button is clicked", () => {
    const { props } = renderFilterChips({
      query: "test",
      selectedCategories: ["CNC"],
    });

    fireEvent.click(screen.getByText("Clear all"));

    expect(props.onClearAll).toHaveBeenCalledOnce();
  });

  it("always renders Clear all button", () => {
    renderFilterChips();
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });
});
