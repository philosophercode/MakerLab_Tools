import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchAndFilters from "@/components/SearchAndFilters";

function renderSearchAndFilters(overrides = {}) {
  const defaults = {
    query: "",
    categoryGroups: ["CNC", "Digital Fabrication", "Textiles"],
    rooms: ["Design Lab", "Workshop", "Annex"],
    materials: ["PLA", "Wood", "Acrylic"],
    selectedCategories: [] as string[],
    selectedRooms: [] as string[],
    selectedMaterials: [] as string[],
    onQueryChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onRoomChange: vi.fn(),
    onMaterialChange: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<SearchAndFilters {...props} />), props };
}

describe("SearchAndFilters", () => {
  // ── Search input ─────────────────────────────────────────────────

  it("renders search input with current query", () => {
    renderSearchAndFilters({ query: "laser" });

    const input = screen.getByPlaceholderText(/search tools/i);
    expect(input).toHaveValue("laser");
  });

  it("calls onQueryChange when user types", () => {
    const { props } = renderSearchAndFilters();

    const input = screen.getByPlaceholderText(/search tools/i);
    fireEvent.change(input, { target: { value: "drill" } });

    expect(props.onQueryChange).toHaveBeenCalledWith("drill");
  });

  // ── Category toggles ─────────────────────────────────────────────

  it("renders all category group buttons", () => {
    renderSearchAndFilters();

    expect(screen.getByText("CNC")).toBeInTheDocument();
    expect(screen.getByText("Digital Fabrication")).toBeInTheDocument();
    expect(screen.getByText("Textiles")).toBeInTheDocument();
  });

  it("marks selected categories with aria-pressed=true", () => {
    renderSearchAndFilters({ selectedCategories: ["CNC"] });

    const cncButton = screen.getByText("CNC");
    expect(cncButton).toHaveAttribute("aria-pressed", "true");

    const dfButton = screen.getByText("Digital Fabrication");
    expect(dfButton).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onCategoryChange to add a category", () => {
    const { props } = renderSearchAndFilters({ selectedCategories: [] });

    fireEvent.click(screen.getByText("CNC"));

    expect(props.onCategoryChange).toHaveBeenCalledWith(["CNC"]);
  });

  it("calls onCategoryChange to remove a category", () => {
    const { props } = renderSearchAndFilters({
      selectedCategories: ["CNC", "Textiles"],
    });

    fireEvent.click(screen.getByText("CNC"));

    expect(props.onCategoryChange).toHaveBeenCalledWith(["Textiles"]);
  });

  // ── Room toggles ─────────────────────────────────────────────────

  it("renders all room buttons", () => {
    renderSearchAndFilters();

    expect(screen.getByText("Design Lab")).toBeInTheDocument();
    expect(screen.getByText("Workshop")).toBeInTheDocument();
    expect(screen.getByText("Annex")).toBeInTheDocument();
  });

  it("calls onRoomChange to add a room", () => {
    const { props } = renderSearchAndFilters({ selectedRooms: [] });

    fireEvent.click(screen.getByText("Workshop"));

    expect(props.onRoomChange).toHaveBeenCalledWith(["Workshop"]);
  });

  it("calls onRoomChange to remove a room", () => {
    const { props } = renderSearchAndFilters({
      selectedRooms: ["Workshop"],
    });

    fireEvent.click(screen.getByText("Workshop"));

    expect(props.onRoomChange).toHaveBeenCalledWith([]);
  });

  // ── Material toggles ─────────────────────────────────────────────

  it("renders material buttons when materials are provided", () => {
    renderSearchAndFilters();

    expect(screen.getByText("PLA")).toBeInTheDocument();
    expect(screen.getByText("Wood")).toBeInTheDocument();
    expect(screen.getByText("Acrylic")).toBeInTheDocument();
  });

  it("does not render materials section when materials is empty", () => {
    renderSearchAndFilters({ materials: [] });

    expect(screen.queryByText("Materials")).not.toBeInTheDocument();
  });

  it("calls onMaterialChange to toggle a material", () => {
    const { props } = renderSearchAndFilters({ selectedMaterials: ["PLA"] });

    fireEvent.click(screen.getByText("Wood"));

    expect(props.onMaterialChange).toHaveBeenCalledWith(["PLA", "Wood"]);
  });

  it("calls onMaterialChange to remove a material", () => {
    const { props } = renderSearchAndFilters({
      selectedMaterials: ["PLA", "Wood"],
    });

    fireEvent.click(screen.getByText("PLA"));

    expect(props.onMaterialChange).toHaveBeenCalledWith(["Wood"]);
  });

  // ── Labels ─────────────────────────────────────────────────────────

  it("renders Category, Room, and Materials labels", () => {
    renderSearchAndFilters();

    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Room")).toBeInTheDocument();
    expect(screen.getByText("Materials")).toBeInTheDocument();
  });
});
